// Review pipeline (docs/backend/04 §3): engine -> classify -> motifs -> select -> diagnose -> cards -> evidence -> summary.
import { cfg } from '../config';
import { analyseGame } from '../core/chess/analyse';
import { firstMeaningfulMistake, pickMistakesToShow } from '../core/chess/classify';
import { moveAccuracy } from '../core/chess/eval';
import { skillTagsFor } from '../core/chess/skills';
import { diagnose } from '../core/diagnosis/diagnose';
import { phaseGrades } from '../core/diagnosis/grades';
import { timeSpentMs, isEvidenceEligible } from '../core/importers/common';
import { emit } from '../data/bus';
import type { MentorDB } from '../data/db';
import { withPersistentCache } from '../data/evalCache';
import { ulid } from '../data/ulid';
import type { SkillId } from '../types/ids';
import type { Card, GameReview, Mistake, MoveClass, PlyRecord, SkillEvidence } from '../types/model';
import type { EngineClient, ReviewProgress } from '../types/services';
import { positionKey } from '../data/repos';

export type ReviewStage = 'queued' | 'engine' | 'select' | 'save' | 'done';
export interface ReviewJobProgress extends ReviewProgress {
  stage: ReviewStage;
}

const GENERIC_SKILL: SkillId = 'blunder_check';
const KEY = (id: string) => `review.v1:${id}`;

export function createReviewService(deps: {
  db: MentorDB;
  engine: EngineClient;
  engineName?: string;
  now?: () => number;
}) {
  const { db } = deps;
  const engine = withPersistentCache(deps.engine, db);
  const now = deps.now ?? Date.now;

  async function* reviewGame(
    gameId: string,
    o: { depth?: number; signal?: { cancelled: boolean } } = {},
  ): AsyncGenerator<ReviewJobProgress> {
    const game = await db.games.get(gameId);
    if (!game) throw new Error('Game not found');
    const depth: number = o.depth ?? cfg.get<number>('engine.review.depth');
    yield { gameId, ply: 0, total: game.clocks?.length ?? 0, stage: 'queued' };

    // Stage 2-4 run inside analyseGame; progress is bridged through a small queue so the UI can show a bar.
    const events: ReviewJobProgress[] = [];
    let wake: (() => void) | null = null;
    let finished = false;
    let failure: unknown;
    let analysis: Awaited<ReturnType<typeof analyseGame>> | undefined;
    const run = analyseGame(game.pgn, game.playerColor, engine, {
      depth,
      signal: o.signal,
      onProgress: (done, total) => {
        events.push({ gameId, ply: done, total, stage: 'engine' });
        wake?.();
      },
    })
      .then((a) => (analysis = a))
      .catch((e) => (failure = e))
      .finally(() => {
        finished = true;
        wake?.();
      });
    while (!finished || events.length) {
      if (!events.length) await new Promise<void>((r) => (wake = r));
      wake = null;
      while (events.length) yield events.shift()!;
    }
    await run;
    if (failure) throw failure;
    if (o.signal?.cancelled || !analysis) return; // cancelled: nothing half-written
    yield { gameId, ply: analysis.plies.length, total: analysis.plies.length, stage: 'select' };

    const spent = game.clocks ? timeSpentMs(game.clocks, game.timeControl) : undefined;
    const plies: PlyRecord[] = analysis.plies.map((p) => ({ ...p, gameId, timeSpentMs: spent?.[p.ply - 1] }));
    const learnerPlies = plies.filter((p) => p.color === game.playerColor);
    const lp = new Map(analysis.learner.map((l) => [l.ply, l]));
    const first = firstMeaningfulMistake(analysis.learner);

    const medianMs = (() => {
      const t = learnerPlies
        .map((p) => p.timeSpentMs)
        .filter((x): x is number => x !== undefined)
        .sort((a, b) => a - b);
      return t.length ? t[Math.floor(t.length / 2)] : undefined;
    })();

    const cand = learnerPlies.filter((p) => p.cls === 'mistake' || p.cls === 'blunder' || p.cls === 'miss');
    const drafts = cand.map((p) => {
      const tags = skillTagsFor(p.motifs ?? []);
      return { p, tags: (tags.length ? tags : [GENERIC_SKILL]) as SkillId[] };
    });
    const show = pickMistakesToShow(
      drafts.map((d) => ({ ply: d.p.ply, winPctLoss: d.p.winPctLoss ?? 0, skillTag: d.tags[0], d })),
      first?.ply ?? null,
    );
    const shownPlies = new Set(show.map((s) => s.ply));
    // if the only flagged mistake is the fallback (not meaningful) we still show the largest one
    const rankByLoss = [...drafts].sort((a, b) => (b.p.winPctLoss ?? 0) - (a.p.winPctLoss ?? 0)).map((d) => d.p.ply);

    const mistakes: Mistake[] = [];
    const cards: Card[] = [];
    for (const d of drafts) {
      if (!shownPlies.has(d.p.ply)) continue;
      const l = lp.get(d.p.ply)!;
      const id = ulid(now());
      const idx = learnerPlies.indexOf(d.p);
      const recent = learnerPlies.slice(Math.max(0, idx - 6), idx + 1).map((q) => ({
        materialLost: (lp.get(q.ply)?.materialDropAfterBestReply ?? 0) >= 1,
        blunder: q.cls === 'blunder',
        ms: q.timeSpentMs,
      }));
      const mistake: Mistake = {
        id,
        gameId,
        ply: d.p.ply,
        fen: d.p.fenBefore,
        playedUci: d.p.uci,
        bestUci: d.p.bestUci ?? '',
        refutationUci: analysis.refutations[d.p.ply],
        winPctLoss: d.p.winPctLoss ?? 0,
        isFirstMeaningful: first?.isFirstMeaningful === true && first.ply === d.p.ply,
        rank: rankByLoss.indexOf(d.p.ply) + 1,
        motifs: d.p.motifs ?? [],
        skillTags: d.tags,
        diagnosis: diagnose({
          fenBefore: d.p.fenBefore,
          playedUci: d.p.uci,
          color: d.p.color,
          motifs: d.p.motifs ?? [],
          winPctLoss: d.p.winPctLoss ?? 0,
          materialDropAfterBestReply: l.materialDropAfterBestReply,
          timeSpentMs: d.p.timeSpentMs,
          medianMoveMs: medianMs,
          recentLosses: recent,
          imported: game.source !== 'mentor',
        }),
      };
      mistakes.push(mistake);
      if (mistake.bestUci) {
        const key = positionKey(mistake.fen);
        const dup = (await db.cards.toArray()).find(
          (c) => c.fen && positionKey(c.fen) === key && c.solution[0] === mistake.bestUci,
        );
        if (dup) mistake.cardId = dup.id;
        else {
          const card: Card = {
            id: ulid(now()),
            kind: 'blunder',
            fen: mistake.fen,
            prompt: 'Find the best move. What did your last move allow?',
            solution: [mistake.bestUci],
            why: mistake.motifs[0]?.evidence ?? 'This move cost you a lot of the game.',
            skillTags: mistake.skillTags,
            sourceRef: { mistakeId: mistake.id },
            srs: { scheduler: 'ladder', step: 0, dueAt: now(), lapses: 0, cleanStreak: 0 },
            state: 'new',
            createdAt: now(),
          };
          cards.push(card);
          mistake.cardId = card.id;
        }
      }
    }

    // Evidence: real-game behaviour is the most informative (docs/backend/05 §3.1: allowed/missed motif -> transfer 0, weight 2.0)
    const evidence: SkillEvidence[] = [];
    for (const d of drafts) {
      for (const skill of d.tags)
        evidence.push({
          id: ulid(now()),
          at: game.startedAt || now(),
          skill,
          layer: 'transfer',
          outcome: 0,
          weight: 2,
          assisted: false,
          sourceRef: { gameId, mistakeId: mistakes.find((m) => m.ply === d.p.ply)?.id },
        });
    }

    const counts: Partial<Record<MoveClass, number>> = {};
    for (const p of learnerPlies) if (p.cls) counts[p.cls] = (counts[p.cls] ?? 0) + 1;
    const acc = learnerPlies.length
      ? learnerPlies.reduce((s, p) => s + (p.accuracy ?? moveAccuracy(p.winPctLoss ?? 0)), 0) / learnerPlies.length
      : 0;
    const review: GameReview = {
      gameId,
      reviewedAt: now(),
      engine: { name: deps.engineName ?? 'Stockfish 19 (lite)', depth },
      learnerColor: game.playerColor,
      accuracy: acc,
      counts,
      phaseGrades: phaseGrades(plies, game.playerColor),
      firstMeaningfulPly: first?.ply ?? null,
      firstMeaningfulFlagged: first ? !first.isFirstMeaningful : false,
      mistakeIds: mistakes.map((m) => m.id),
      whiteWinPct: analysis.whiteWinPct,
      evidenceEligible: isEvidenceEligible(game.timeControl),
      blundersPer40: learnerPlies.length ? ((counts.blunder ?? 0) / learnerPlies.length) * 40 : 0,
    };

    yield { gameId, ply: plies.length, total: plies.length, stage: 'save' };
    await db.transaction('rw', [db.plies, db.mistakes, db.cards, db.evidence, db.kv, db.games], async () => {
      await db.plies.where('gameId').equals(gameId).delete();
      await db.mistakes.where('gameId').equals(gameId).delete();
      await db.evidence.filter((e) => e.sourceRef.gameId === gameId).delete();
      await db.plies.bulkPut(plies);
      await db.mistakes.bulkPut(mistakes);
      await db.cards.bulkPut(cards);
      await db.evidence.bulkPut(evidence);
      await db.kv.put({ key: KEY(gameId), value: review });
      await db.games.update(gameId, { reviewedAt: now(), reviewVersion: 1 });
    });
    emit('review:done', gameId);
    emit('mistake:added', gameId);
    yield { gameId, ply: plies.length, total: plies.length, stage: 'done' };
  }

  return {
    reviewGame,
    async getReview(gameId: string): Promise<GameReview | undefined> {
      return (await db.kv.get(KEY(gameId)))?.value as GameReview | undefined;
    },
    async isReviewed(gameId: string) {
      return !!(await db.kv.get(KEY(gameId)));
    },
  };
}
export type ReviewService = ReturnType<typeof createReviewService>;
