import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { MentorDB } from '../../src/data/db';
import { repos } from '../../src/data/repos';
import { createSrsService } from '../../src/services/SrsService';
import { createContentService } from '../../src/services/ContentService';
import { createMisconceptionService } from '../../src/services/MisconceptionService';
import { createPlannerService } from '../../src/services/PlannerService';
import { createTestService } from '../../src/services/TestService';
import { createCoachMemoryService } from '../../src/services/CoachMemoryService';
import { buildDailyTest, calibration, gradeAnswer, isCorrect, type TestQuestion } from '../../src/core/test/dailyTest';
import {
  checkPuzzleMove,
  eloUpdate,
  pickNearest,
  toPuzzleView,
  bandFor,
  type RawPuzzle,
} from '../../src/core/content/puzzles';
import { mineMemories } from '../../src/core/memory/miners';
import { dailyIcs } from '../../src/core/export/ics';
import { annotatedPgn } from '../../src/core/export/pgn';
import { boardSvg, coachReportHtml } from '../../src/core/export/report';
import { noteFacts, noteTemplate } from '../../src/core/teacher/note';
import { dayString } from '../../src/core/planner/streak';
import type { Game, GameReview, Mistake, PlyRecord } from '../../src/types/model';
import { cfg } from '../../src/config';

const DAY = 86_400_000;
const T0 = new Date(2026, 9, 6, 12).getTime(); // a Tuesday, local time
let n = 0;
const fresh = () => new MentorDB(`m2-${n++}`);
const noFetch = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;

describe('puzzle shards (docs/backend/06 §10: spot-check by replay)', () => {
  const root = 'public/content/puzzles';
  const shards = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => readdirSync(`${root}/${d.name}`).map((f) => `${root}/${d.name}/${f}`));
  it('ships shards with provenance, CC0 licence, engine verification and legal lines', () => {
    expect(shards.length).toBeGreaterThanOrEqual(25);
    let total = 0;
    for (const f of shards) {
      const j = JSON.parse(readFileSync(f, 'utf8')) as {
        provenance: { license: string; engineVerified: boolean; source: string };
        puzzles: RawPuzzle[];
      };
      expect(j.provenance.license).toBe('CC0');
      expect(j.provenance.engineVerified).toBe(true);
      for (const p of j.puzzles) {
        total++;
        const c = new Chess(p.fen);
        for (const m of p.moves.split(' ')) c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      }
    }
    expect(total).toBeGreaterThan(4000);
  });
  it('applies the opponent first move (FEN is BEFORE it) and accepts any mate on the last move', () => {
    const p: RawPuzzle = {
      id: 'x',
      fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1',
      moves: 'g8f8 a1a8',
      rating: 500,
      themes: ['mateIn1'],
    };
    const v = toPuzzleView(p, 'tactic_backrank');
    expect(v.turn).toBe('w');
    expect(v.lastMove).toEqual({ from: 'g8', to: 'f8' });
    expect(checkPuzzleMove(v, 0, 'a1a8')).toBe('done');
    expect(checkPuzzleMove(v, 0, 'a1a2')).toBe('wrong');
  });
  it('nearest-rating picking avoids seen ids; Elo moves in the right direction; bands cover the range', () => {
    const list = [
      { id: 'a', rating: 500 },
      { id: 'b', rating: 520 },
      { id: 'c', rating: 900 },
    ];
    expect(pickNearest(list, 510, new Set())?.id).toBe('a');
    expect(pickNearest(list, 510, new Set(['a']))?.id).toBe('b');
    expect(eloUpdate(500, 500, true, 24)).toBeCloseTo(512, 5);
    expect(eloUpdate(500, 500, false, 24)).toBeCloseTo(488, 5);
    expect(bandFor(300)).toBe('400-700');
    expect(bandFor(2000)).toBe('1150-1400');
  });
});

describe('daily test', () => {
  const q = (id: string, origin: 'old' | 'today' | 'trap'): TestQuestion =>
    origin === 'trap'
      ? { kind: 'trap', id, fen: 'x', q: 'q', answer: 'no', why: 'w', skill: 'piece_safety', origin }
      : {
          kind: 'check',
          id,
          lessonId: 'l',
          q: 'q',
          options: ['a', 'b'],
          answer: 0,
          why: 'w',
          skill: 'piece_safety',
          origin,
        };
  it('builds 10 questions: 5 old, 3 today, 2 traps; light = 5; tops up when a pool is short; deterministic', () => {
    const pools = {
      old: Array.from({ length: 8 }, (_, i) => q(`o${i}`, 'old')),
      today: Array.from({ length: 6 }, (_, i) => q(`t${i}`, 'today')),
      traps: Array.from({ length: 3 }, (_, i) => q(`x${i}`, 'trap')),
    };
    const t = buildDailyTest(pools, 5);
    expect(t).toHaveLength(10);
    expect(t.filter((x) => x.kind === 'trap')).toHaveLength(2);
    expect(buildDailyTest(pools, 5).map((x) => x.id)).toEqual(t.map((x) => x.id));
    expect(buildDailyTest(pools, 5, true)).toHaveLength(5);
    expect(buildDailyTest({ ...pools, traps: [] }, 5)).toHaveLength(10);
  });
  it('grades right/wrong with confidence; wrong and sure is a misconception; Brier uses the config values', () => {
    expect(gradeAnswer(true, 'sure').verdict).toBe('right_sure');
    expect(gradeAnswer(true, 'guess').verdict).toBe('right_unsure');
    expect(gradeAnswer(false, 'sure')).toMatchObject({ verdict: 'wrong_sure', misconception: true });
    expect(gradeAnswer(false, 'unsure').misconception).toBe(false);
    expect(gradeAnswer(true, 'sure').brier).toBeCloseTo(0.01, 9);
    expect(gradeAnswer(false, 'sure').brier).toBeCloseTo(0.81, 9);
    expect(isCorrect(q('c', 'old'), 0)).toBe(true);
    expect(isCorrect(q('t', 'trap'), 'yes')).toBe(false);
    const cal = calibration([
      { correct: true, confidence: 'sure' },
      { correct: false, confidence: 'sure' },
      { correct: true, confidence: 'guess' },
    ]);
    expect(cal.sureRight).toBe(0.5);
    expect(cal.n).toBe(3);
  });
});

describe('TestService + PlannerService on a real database', () => {
  async function world() {
    const db = fresh();
    let t = T0;
    const now = () => t;
    const srs = createSrsService(db, now);
    const content = createContentService(db, now, noFetch);
    const misc = createMisconceptionService(db, now);
    const planner = createPlannerService({ db, srs, content, misconceptions: misc, now });
    const tests = createTestService(db, now);
    await repos(db).addCard({
      kind: 'blunder',
      fen: '4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1',
      prompt: 'p',
      solution: ['d1d5'],
      why: 'a free queen',
      skillTags: ['piece_safety'],
      srs: { scheduler: 'ladder', step: 0, dueAt: t, lapses: 0, cleanStreak: 0 },
      state: 'new',
    });
    return { db, srs, content, misc, planner, tests, advance: (ms: number) => (t += ms), now };
  }
  it('plans today with six blocks, persists it, reuses it, returns nothing on the rest day', async () => {
    const w = await world();
    await w.db.profile.put({
      id: 'me',
      createdAt: 0,
      displayName: 'x',
      platformAccounts: {},
      dailyMinutes: 40,
      restDay: 0,
      goalRating: 1000,
      settingsVersion: 1,
    });
    const plan = (await w.planner.planToday(T0))!;
    expect(plan.blocks.map((b) => b.id)).toEqual(['recall', 'lesson', 'drills', 'play', 'test', 'note']);
    expect(plan.focusSkill).toBe('piece_safety'); // cold start
    expect((await w.planner.planToday(T0))!.id).toBe(plan.id);
    expect(await w.db.plans.count()).toBe(1);
    expect(await w.planner.planToday(new Date(2026, 9, 11, 12).getTime())).toBeUndefined(); // Sunday rest day
    const light = (await w.planner.planToday(T0, undefined, { light: true }))!;
    expect(light.light).toBe(true);
    expect(light.minutes).toBe(15);
  });
  it('completing a plan updates the streak and writes a three-line, kind teacher note', async () => {
    const w = await world();
    const plan = (await w.planner.planToday(T0))!;
    await w.planner.recordBlockResult(plan.id, 'drills', { right: 6, total: 8, clean: 5 });
    await w.planner.recordBlockResult(plan.id, 'test', { right: 7, total: 10, wrongSure: 1 });
    const r = (await w.planner.completePlan(plan.id))!;
    expect(r.update.streak.current).toBe(1);
    expect(r.note).toHaveLength(3);
    expect(r.note.join(' ')).toMatch(/Went well/);
    expect(r.note.join(' ')).toMatch(/felt sure but missed/);
    expect((await w.db.journal.toArray())[0].kind).toBe('teacher_note');
    expect((await w.db.plans.get(plan.id))!.completedAt).toBeTruthy();
    expect(dayString(T0)).toBe(plan.date);
  });
  it('a missed pair of days triggers the welcome-back plan (10 minutes)', async () => {
    const w = await world();
    await w.db.profile.put({
      id: 'me',
      createdAt: 0,
      displayName: 'x',
      platformAccounts: {},
      dailyMinutes: 40,
      restDay: 0,
      goalRating: 1000,
      settingsVersion: 1,
    });
    const p1 = (await w.planner.planToday(T0))!;
    await w.planner.completePlan(p1.id);
    const later = T0 + 4 * DAY; // Saturday: missed Wed, Thu, Fri
    const p2 = (await w.planner.planToday(later))!;
    expect(p2.minutes).toBe(10);
    expect(p2.light).toBe(true);
  });
  it('builds a test from cards, lessons and traps, grades it with evidence and flags sure-and-wrong for tomorrow', async () => {
    const w = await world();
    const qs = await w.tests.build({ focus: 'piece_safety', seed: 3 });
    expect(qs.length).toBeGreaterThanOrEqual(5);
    const answers = qs.map((q, i) => ({
      questionId: q.id,
      answer:
        q.kind === 'check'
          ? i === 0
            ? (q.answer + 1) % q.options.length
            : q.answer
          : q.kind === 'card'
            ? q.solution[0]
            : q.answer,
      confidence: (i === 0 ? 'sure' : 'unsure') as 'sure' | 'unsure',
      ms: 1000,
    }));
    const res = await w.tests.submit(qs, answers);
    expect(res.total).toBe(qs.length);
    expect(res.wrongSure).toBe(1);
    expect(await w.db.attempts.where('context').equals('test').count()).toBe(qs.length);
    expect(await w.tests.miniLessonDue(dayString(T0 + DAY))).toBe(true);
    expect(await w.tests.miniLessonDue(dayString(T0 + 3 * DAY))).toBe(false);
  });
});

describe('misconceptions M01-M05 from real-game hits', () => {
  it('activates after minOccurrences within the window, stays quiet below it, and resolves after 10 clean games', async () => {
    const db = fresh();
    const misc = createMisconceptionService(db);
    const addGame = async (i: number, motif?: string) => {
      const g: Game = {
        id: `g${String(i).padStart(2, '0')}`,
        source: 'pgn',
        pgn: '',
        startedAt: 1000 + i,
        white: 'a',
        black: 'b',
        playerColor: 'w',
        result: '*',
        importedAt: 0,
        reviewedAt: 1,
      };
      await db.games.put(g);
      const p: PlyRecord = {
        gameId: g.id,
        ply: 1,
        fenBefore: 'x',
        san: 'e4',
        uci: 'e2e4',
        color: 'w',
        phase: 'opening',
        motifs: motif ? [{ id: motif as never, role: 'played', squares: [], severity: 1, evidence: 'e' }] : [],
      };
      await db.plies.put(p);
    };
    await addGame(1, 'check.waste');
    expect((await misc.evaluate()).find((s) => s.id === 'M02')!.status).toBe('watching');
    await addGame(2, 'check.waste');
    expect((await misc.evaluate()).find((s) => s.id === 'M02')!.status).toBe('active');
    expect(await misc.activeSkills()).toContain('checks_captures_threats');
    for (let i = 3; i < 14; i++) await addGame(i);
    expect((await misc.evaluate()).find((s) => s.id === 'M02')!.status).toBe('resolved');
  });
});

describe('coach memory (>= 3 data points, dismissible)', () => {
  const mk = (i: number, firstPly: number): import('../../src/core/memory/miners').MemoryData => ({
    game: {
      id: `g${i}`,
      source: 'pgn',
      pgn: '',
      startedAt: i,
      white: 'a',
      black: 'b',
      playerColor: 'w',
      result: '*',
      importedAt: 0,
    } as Game,
    review: {
      gameId: `g${i}`,
      firstMeaningfulPly: firstPly,
      firstMeaningfulFlagged: false,
      blundersPer40: i <= 3 ? 4 : 2,
    } as GameReview,
    plies: [],
    mistakes: [
      {
        id: `m${i}`,
        gameId: `g${i}`,
        ply: firstPly,
        motifs: [
          { id: 'hanging.piece', role: 'allowed', squares: [], severity: 2, evidence: 'the knight on h4 was attacked' },
        ],
      } as unknown as Mistake,
    ],
  });
  it('mines patterns only with enough evidence, and cites it', () => {
    expect(mineMemories([mk(1, 21), mk(2, 23)])).toEqual([]);
    const mem = mineMemories([1, 2, 3, 4, 5, 6].map((i) => mk(i, 21 + i)));
    expect(mem.find((m) => m.key === 'first-mistake-window')!.text).toMatch(/between moves \d+ and \d+/);
    expect(mem.find((m) => m.key === 'hanging-kind-knight')!.evidence.length).toBeGreaterThanOrEqual(3);
    expect(mem.find((m) => m.key === 'blunder-trend')!.text).toMatch(/from 4\.0 to 2\.0/);
    for (const m of mem) expect(m.evidence.length).toBeGreaterThanOrEqual(3);
  });
  it('a dismissed memory is never returned again', async () => {
    const db = fresh();
    const svc = createCoachMemoryService(db);
    for (let i = 1; i <= 6; i++) {
      const d = mk(i, 21 + i);
      await db.games.put({ ...d.game, reviewedAt: 1 });
      await db.kv.put({ key: `review.v1:g${i}`, value: d.review });
      await db.mistakes.put(d.mistakes[0]);
    }
    const before = await svc.list();
    expect(before.length).toBeGreaterThan(0);
    await svc.dismiss(before[0].key);
    expect((await svc.list()).some((m) => m.key === before[0].key)).toBe(false);
    expect(await svc.active()).not.toContain(before[0].text);
  });
});

describe('exports', () => {
  it('ICS excludes the rest day and has the right duration/time', () => {
    const ics = dailyIcs({ time: '19:30', minutes: 40, restDay: 0, today: new Date(2026, 9, 10) });
    expect(ics).toContain('BYDAY=MO,TU,WE,TH,FR,SA');
    expect(ics).not.toContain('SU,');
    expect(ics).toContain('DTSTART:20261010T193000');
    expect(ics).toContain('DURATION:PT40M');
    expect(ics).toContain('\r\n');
  });
  it('annotated PGN is valid PGN with comments and re-loads in chess.js', () => {
    const game: Game = {
      id: 'g',
      source: 'pgn',
      pgn: '',
      startedAt: 0,
      white: 'Me',
      black: 'Them',
      playerColor: 'w',
      result: '0-1',
      importedAt: 0,
    };
    const c = new Chess();
    const plies: PlyRecord[] = ['e4', 'e5', 'Nf3', 'Nc6'].map((san, i) => {
      const m = c.move(san);
      return {
        gameId: 'g',
        ply: i + 1,
        fenBefore: '',
        san,
        uci: m.lan,
        color: m.color,
        phase: 'opening',
        cls: i === 2 ? 'blunder' : 'good',
        winPctAfter: 40,
        winPctLoss: 20,
        bestUci: 'b1c3',
      } as PlyRecord;
    });
    const pgn = annotatedPgn(game, plies, [
      { ply: 3, isFirstMeaningful: true, motifs: [{ evidence: 'knight hangs' }] } as unknown as Mistake,
    ]);
    expect(pgn).toContain('[Annotator "Mentor"]');
    expect(pgn).toMatch(/Nf3 \{Blunder\. .*First meaningful mistake\. knight hangs\. Better: b1c3\}/);
    const re = new Chess();
    re.loadPgn(pgn);
    expect(re.history()).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });
  it('coach report is self-contained HTML with escaped text, board diagrams and honest limits', () => {
    const svg = boardSvg('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1', 160, ['d1', 'd5']);
    expect(svg).toContain('<svg');
    expect(svg).toContain('♛');
    const html = coachReportHtml({
      generatedAt: 'today',
      name: '<b>Me</b>',
      games: 7,
      baseline: { blundersPer40: 2.4, missedThreatsPerGame: 1.1, accuracy: 71, n: 7 },
      mistakes: [
        { title: 'Move 11', fen: '4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1', text: 'x', diagnosis: ['rushed (medium)'] },
      ],
      memories: ['note'],
      focus: 'Piece safety',
      limitations: ['Diagnoses are hypotheses.'],
    });
    expect(html).toContain('&lt;b&gt;Me&lt;/b&gt;');
    expect(html).toContain('Diagnoses are hypotheses.');
    expect(html).not.toContain('<script');
  });
  it('teacher note template is three kind lines', () => {
    const lines = noteTemplate(
      noteFacts({
        testRight: 8,
        testTotal: 10,
        cardsClean: 2,
        cardsTotal: 3,
        drillsRight: 6,
        drillsTotal: 8,
        wrongSure: 0,
        focus: 'piece_safety',
        nextFocus: 'checks_captures_threats',
      }),
    );
    expect(lines).toHaveLength(3);
    expect(lines[2]).toMatch(/tomorrow's focus: checks, captures, threats/);
    expect(cfg.get<string[]>('copy.bannedWords').some((w) => lines.join(' ').toLowerCase().includes(w))).toBe(false);
  });
});
