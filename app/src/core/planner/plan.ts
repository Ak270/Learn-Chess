// Session planner (docs/backend/05 §5): pure and deterministic. Explains every decision as data.
import { cfg } from '../../config';
import skillsJson from '../../content/skills.json';
import type { SkillId } from '../../types/ids';
import type { Card, PlanBlock, PlanItem, SessionPlan, SkillState } from '../../types/model';

export interface SkillDef {
  id: SkillId;
  title: string;
  phase: number;
  prereqs: SkillId[];
}
export const SKILL_DEFS = skillsJson.skills as unknown as SkillDef[];
export const skillTitle = (id: SkillId) => SKILL_DEFS.find((s) => s.id === id)?.title ?? id;

export interface ContentIndex {
  lessons: { id: string; skill: SkillId; minutes: number; seen: boolean; phase: number }[];
  /** curated puzzles available per skill (0 when the shards are not installed yet) */
  puzzleCounts: Partial<Record<SkillId, number>>;
}
export interface MistakeLite {
  skillTags: SkillId[];
  winPctLoss: number;
  /** 0 = newest game */
  gameIdx: number;
}
export interface PlannerInput {
  now: number;
  minutes: number;
  light?: boolean;
  welcomeBack?: boolean;
  date: string;
  skills: Partial<Record<SkillId, SkillState>>;
  reviewedGames: number;
  recentMistakes: MistakeLite[];
  /** the focus chosen earlier (for hysteresis and the recently-focused adjustment) */
  currentFocus?: { skill: SkillId; since: number };
  activeMisconceptionSkills: SkillId[];
  dueCards: Card[];
  ownCards: Card[];
  content: ContentIndex;
  seed: number;
  teacherLevelHint?: string;
}

export interface SkillScore {
  skill: SkillId;
  score: number;
  eligible: boolean;
  parts: Record<
    'leakRate' | 'severity' | 'weakness' | 'decayRisk' | 'leverage' | 'misconception' | 'recentlyFocused',
    number
  >;
  reasons: string[];
}
const DAY = 86_400_000;
const isSolid = (s?: SkillState) => s?.status === 'solid' || s?.status === 'maintenance';

/** mastery = mean of the known layers (knowledge/recognition/decision/transfer) that have evidence */
export function mastery(s?: SkillState): number {
  if (!s) return 0;
  const ls = (['knowledge', 'recognition', 'decision', 'transfer'] as const).filter((l) => s.layers[l].n > 0);
  return ls.length ? ls.reduce((a, l) => a + s.layers[l].mean, 0) / ls.length : 0;
}

export function scoreSkills(i: PlannerInput): SkillScore[] {
  const w = (k: string) => cfg.get<number>(`planner.weights.${k}`);
  const games = new Set(i.recentMistakes.map((m) => m.gameIdx));
  const nGames = Math.max(games.size, 1);
  const locked = SKILL_DEFS.filter((d) => !isSolid(i.skills[d.id]));
  return SKILL_DEFS.map((d) => {
    const st = i.skills[d.id];
    const ms = i.recentMistakes.filter((m) => m.skillTags.includes(d.id));
    const leakRate = i.recentMistakes.length ? new Set(ms.map((m) => m.gameIdx)).size / nGames : 0;
    const severity = ms.length
      ? Math.min(1, ms.reduce((s, m) => s + m.winPctLoss, 0) / ms.length / cfg.get<number>('planner.severityDivisor'))
      : 0;
    const weakness = 1 - mastery(st);
    const daysSince = st ? (i.now - st.lastSeen) / DAY : cfg.get<number>('planner.decayDaysDivisor');
    const decayRisk =
      st?.status === 'decaying' ? 1 : Math.min(1, daysSince / cfg.get<number>('planner.decayDaysDivisor'));
    const dependants = locked.filter((x) => x.prereqs.includes(d.id)).length;
    const leverage = Math.min(1, dependants / 4);
    const misconception = i.activeMisconceptionSkills.includes(d.id) ? 1 : 0;
    const recentlyFocused =
      i.currentFocus?.skill === d.id &&
      isSolid(st) &&
      i.now - i.currentFocus.since <= cfg.get<number>('planner.recentFocusDays') * DAY
        ? 1
        : 0;
    const prereqsOk = d.prereqs.every((p) => isSolid(i.skills[p]));
    const eligible = prereqsOk || leakRate >= cfg.get<number>('planner.remedialLeakRate');
    const score =
      w('leakRate') * leakRate +
      w('severity') * severity +
      w('weakness') * weakness +
      w('decayRisk') * decayRisk +
      w('leverage') * leverage +
      w('misconception') * misconception -
      w('recentlyFocused') * recentlyFocused;
    const reasons: string[] = [];
    if (ms.length)
      reasons.push(
        `${skillTitle(d.id)} showed up in ${new Set(ms.map((m) => m.gameIdx)).size} of your last ${nGames} reviewed games.`,
      );
    if (st?.status === 'decaying') reasons.push(`${skillTitle(d.id)} slipped recently, so a refresher helps.`);
    if (misconception) reasons.push('A belief linked to this skill keeps costing you games.');
    return {
      skill: d.id,
      score,
      eligible,
      parts: { leakRate, severity, weakness, decayRisk, leverage, misconception, recentlyFocused },
      reasons,
    };
  });
}

export function chooseFocus(i: PlannerInput): { skill: SkillId; scores: SkillScore[]; reasons: string[] } {
  const scores = scoreSkills(i);
  if (i.reviewedGames < cfg.get<number>('planner.coldStartGames'))
    return {
      skill: cfg.get<SkillId>('planner.coldStartSkill'),
      scores,
      reasons: [
        'We are still learning about you, so we start with the habit that matters most: checking whether a piece can be taken for free.',
      ],
    };
  const ranked = scores.filter((s) => s.eligible).sort((a, b) => b.score - a.score || a.skill.localeCompare(b.skill));
  let best = ranked[0] ?? scores[0];
  const cur = i.currentFocus && scores.find((s) => s.skill === i.currentFocus!.skill);
  // hysteresis: keep the current focus unless the new one beats it by 15% (docs/backend/05 §14)
  if (
    cur &&
    cur.eligible &&
    !isSolid(i.skills[cur.skill]) &&
    best.skill !== cur.skill &&
    best.score < cur.score * (1 + cfg.get<number>('planner.focusHysteresis'))
  )
    best = cur;
  return {
    skill: best.skill,
    scores,
    reasons: best.reasons.length ? best.reasons : [`${skillTitle(best.skill)} is the next skill in your path.`],
  };
}

/** Scale block minutes to the requested total (±10%), integers, never below 1. */
export function allocateMinutes(base: Record<string, number>, minutes: number): Record<string, number> {
  const total = Object.values(base).reduce((a, b) => a + b, 0);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(base)) out[k] = Math.max(1, Math.round((v * minutes) / total));
  let diff = minutes - Object.values(out).reduce((a, b) => a + b, 0);
  const keys = Object.keys(out).sort((a, b) => out[b] - out[a]);
  for (let n = 0; diff !== 0 && n < 100; n++) {
    const k = keys[n % keys.length];
    if (diff > 0) {
      out[k]++;
      diff--;
    } else if (out[k] > 1) {
      out[k]--;
      diff++;
    }
  }
  return out;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

export function planSession(i: PlannerInput): SessionPlan & { scores: SkillScore[] } {
  const light = !!i.light;
  const baseBlocks = cfg.get<Record<string, number>>(
    i.welcomeBack ? 'planner.welcomeBackBlocks' : light ? 'planner.lightBlocks' : 'planner.blocks',
  );
  const minutes = i.welcomeBack
    ? cfg.get<number>('streak.welcomeBackMinutes')
    : light
      ? cfg.get<number>('planner.lightMinutes')
      : i.minutes;
  const mins = allocateMinutes(baseBlocks, minutes);
  const { skill: focus, scores, reasons } = chooseFocus(i);
  const rand = rng(i.seed);
  const blocks: PlanBlock[] = [];
  const cap = (n: number) => Math.max(1, n);

  if (mins.recall) {
    const n = cap(
      Math.min(
        cfg.get<number>('planner.recallMaxCards'),
        Math.round(mins.recall * cfg.get<number>('srs.reviewsPerMinute')),
      ),
    );
    const overflow =
      i.dueCards.length >
      cfg.get<number>('planner.overflowFactor') * Math.round(i.minutes * cfg.get<number>('srs.reviewsPerMinute'));
    const items: PlanItem[] = i.dueCards.slice(0, overflow ? n * 2 : n).map((c) => ({
      kind: 'card',
      ref: c.id,
      why:
        c.kind === 'blunder'
          ? 'A position from one of your games that is due to come back.'
          : 'Due for a quick recall.',
    }));
    blocks.push({ id: 'recall', targetMin: mins.recall, items });
  }
  if (mins.lesson) {
    const next = i.content.lessons
      .filter((l) => l.skill === focus && !l.seen)
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    blocks.push({
      id: 'lesson',
      targetMin: mins.lesson,
      items: next
        ? [{ kind: 'lesson', ref: next.id, why: `The next lesson on ${skillTitle(focus).toLowerCase()}.` }]
        : i.ownCards.length
          ? [
              {
                kind: 'card',
                ref: i.ownCards[Math.floor(rand() * i.ownCards.length)].id,
                why: 'A worked example from your own game, since the lessons for this skill are done.',
              },
            ]
          : [],
    });
  }
  if (mins.drills) {
    const total = light ? 4 : i.welcomeBack ? 3 : cfg.get<number>('planner.drillCount');
    const mix = cfg.get<Record<string, number>>('planner.drillMix');
    const nOwn = Math.min(Math.round(total * mix.own), i.ownCards.length);
    const own = i.ownCards
      .filter((c) => c.skillTags.includes(focus))
      .concat(i.ownCards.filter((c) => !c.skillTags.includes(focus)))
      .slice(0, nOwn);
    const curatedAvail = i.content.puzzleCounts[focus] ?? 0;
    const nCur = curatedAvail ? Math.min(Math.round(total * mix.curated), curatedAvail) : 0;
    const items: PlanItem[] = [
      ...own.map((c): PlanItem => ({
        kind: 'card',
        ref: c.id,
        why: `A mistake from your own games about ${skillTitle(c.skillTags[0] ?? focus).toLowerCase()}.`,
      })),
      ...(nCur
        ? [
            {
              kind: 'puzzle',
              ref: `query:${focus}:${nCur}`,
              why: `Practice for ${skillTitle(focus).toLowerCase()}.`,
            } as PlanItem,
          ]
        : []),
    ];
    const warm = total - own.length - nCur;
    if (warm > 0 && (i.content.puzzleCounts[focus] || i.ownCards.length))
      items.push({
        kind: 'puzzle',
        ref: `query:mixed:${warm}`,
        why: 'A short warm-up on earlier skills so they stay fresh.',
      });
    blocks.push({ id: 'drills', targetMin: mins.drills, items });
  }
  if (mins.play) {
    const critical = i.ownCards.find((c) => c.skillTags.includes(focus));
    const useCritical = !!critical && rand() < 0.5;
    blocks.push({
      id: 'play',
      targetMin: mins.play,
      items: [
        useCritical && critical
          ? {
              kind: 'game',
              ref: `critical:${critical.id}`,
              why: 'Play out a position from your own game, this time with the answer in mind.',
            }
          : {
              kind: 'game',
              ref: 'coach:slow',
              why: i.teacherLevelHint ?? 'One slow game with the Safety Check on, against a level a little below you.',
            },
      ],
    });
  }
  if (mins.test)
    blocks.push({
      id: 'test',
      targetMin: mins.test,
      items: [{ kind: 'test', ref: 'daily', why: 'Ten mixed questions with a confidence rating.' }],
    });
  if (mins.note) blocks.push({ id: 'note', targetMin: mins.note, items: [] });

  return {
    id: `plan-${i.date}`,
    date: i.date,
    minutes: Object.values(mins).reduce((a, b) => a + b, 0),
    focusSkill: focus,
    blocks,
    createdAt: i.now,
    light: light || !!i.welcomeBack,
    teacherNote: reasons,
    scores,
  };
}
