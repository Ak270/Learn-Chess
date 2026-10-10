// Attempts -> evidence (docs/backend/05 §3.1) and evidence -> SkillState (§3.2). Pure, deterministic, config-driven.
import { cfg } from '../../config';
import type { SkillId } from '../../types/ids';
import type {
  Attempt,
  AttemptContext,
  EvidenceSource,
  Layer,
  SkillEvidence,
  SkillState,
  SkillStatus,
} from '../../types/model';
import { LAYERS } from '../../types/model';

const DEFAULT_SOURCE: Record<AttemptContext, EvidenceSource> = {
  drill: 'puzzle_recognition',
  puzzle: 'puzzle_recognition',
  test: 'daily_test',
  recall: 'card_review',
  weekly_exam: 'daily_test',
  game_prompt: 'critical_drill',
  review: 'lesson_check',
  think_aloud: 'think_aloud',
  rules_check: 'rules_check',
};
const W = (k: string) => cfg.get(`weights.${k}`);

export type EvidenceRow = Omit<SkillEvidence, 'id' | 'sourceRef'>;

/** One attempt can produce several rows (one per skill tag, plus a retention row for old cards). */
export function evidenceFromAttempt(a: Attempt): EvidenceRow[] {
  const source = a.source ?? DEFAULT_SOURCE[a.context];
  const assisted = a.hints > 0;
  const rows: EvidenceRow[] = [];
  for (const skill of a.skillTags) {
    let layer: Layer;
    let weight: number;
    switch (source) {
      case 'lesson_check':
        layer = 'knowledge';
        weight = W('lessonCheck');
        break;
      case 'rules_check':
        layer = 'knowledge';
        weight = W('rulesCheck');
        break;
      case 'puzzle_calc':
        layer = 'calculation';
        weight = W('puzzleCalculation');
        break;
      case 'calc_deepdive':
        layer = 'calculation';
        weight = W('calcDeepDive');
        break;
      case 'critical_drill':
        layer = 'decision';
        weight = W('criticalDrill');
        break;
      case 'card_review':
        layer = 'recognition';
        weight = W('puzzleRecognition');
        break;
      case 'daily_test':
        layer = a.trap ? 'decision' : 'recognition';
        weight = W('dailyTest');
        break;
      case 'think_aloud':
        layer = 'decision';
        weight = W('thinkAloud');
        break;
      default:
        layer = 'recognition';
        weight = W('puzzleRecognition');
    }
    if (assisted) weight *= W('assistedFactor');
    let outcome: 0 | 0.5 | 1 = a.correct ? 1 : 0;
    if (a.confidence === 'sure' && !a.correct) weight *= W('sureWrong');
    if (a.confidence === 'guess' && a.correct) outcome = W('guessRightOutcome') as 0.5;
    rows.push({ at: a.at, skill, layer, outcome, weight, assisted });
    if (a.gapDays !== undefined && a.gapDays >= 7)
      rows.push({ at: a.at, skill, layer: 'retention', outcome, weight: W('retention'), assisted });
  }
  return rows;
}

type Post = Record<Layer, { a: number; b: number }>;
const DAY = 86_400_000;

function emptyPost(): Post {
  const p = {} as Post;
  for (const l of LAYERS) p[l] = { a: cfg.get('skills.priorAlpha'), b: cfg.get('skills.priorBeta') };
  return p;
}
const mean = (x: { a: number; b: number }) => x.a / (x.a + x.b);
const nEff = (x: { a: number; b: number }) =>
  x.a + x.b - cfg.get<number>('skills.priorAlpha') - cfg.get<number>('skills.priorBeta');

function isSolid(p: Post, independence: number): boolean {
  const t = p.transfer;
  const tn = nEff(t);
  const total = LAYERS.reduce((s, l) => s + nEff(p[l]), 0);
  // docs/backend/05 §3.2: transfer >= 0.7, or too little transfer evidence (< 3) and not contradicted (mean never below the prior).
  // The "3 games since introduced" clause needs game counts, which the planner checks separately (DECISIONS T12).
  const transferOk =
    mean(t) >= cfg.get<number>('skills.solid.transfer') ||
    (tn < cfg.get<number>('skills.solid.transferMinN') && mean(t) >= 0.5);
  return (
    mean(p.recognition) >= cfg.get<number>('skills.solid.recognition') &&
    mean(p.decision) >= cfg.get<number>('skills.solid.decision') &&
    independence >= cfg.get<number>('skills.solid.independence') &&
    transferOk &&
    total >= cfg.get<number>('skills.solid.nEff')
  );
}

/** Replays evidence oldest->newest; the posterior decays by 2^(-dt/halfLife) toward the prior before each update. */
export function skillStatesFromEvidence(ev: SkillEvidence[]): SkillState[] {
  const bySkill = new Map<SkillId, SkillEvidence[]>();
  for (const e of [...ev].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)))
    (bySkill.get(e.skill) ?? bySkill.set(e.skill, []).get(e.skill)!).push(e);
  const half = cfg.get<number>('skills.halfLifeDays') * DAY;
  const pa = cfg.get<number>('skills.priorAlpha');
  const pb = cfg.get<number>('skills.priorBeta');
  const out: SkillState[] = [];
  for (const [skill, list] of bySkill) {
    const post = emptyPost();
    let lastAt = list[0].at;
    let status: SkillStatus = 'insufficient';
    let solidSince: number | undefined;
    let wasSolid = false;
    const seen: SkillEvidence[] = [];
    for (const e of list) {
      const f = Math.pow(2, -(e.at - lastAt) / half);
      for (const l of LAYERS) {
        post[l].a = pa + (post[l].a - pa) * f;
        post[l].b = pb + (post[l].b - pb) * f;
      }
      lastAt = e.at;
      post[e.layer].a += e.weight * e.outcome;
      post[e.layer].b += e.weight * (1 - e.outcome);
      seen.push(e);
      const ind = independenceOf(seen);
      const total = LAYERS.reduce((s, l) => s + nEff(post[l]), 0);
      const solidNow = isSolid(post, ind);
      if (total < cfg.get<number>('skills.insufficientBelowNEff')) status = 'insufficient';
      else if (solidNow) {
        solidSince ??= e.at;
        wasSolid = true;
        status = e.at - solidSince >= cfg.get<number>('skills.maintenanceAfterDays') * DAY ? 'maintenance' : 'solid';
      } else if (wasSolid) {
        const w = cfg.get<number>('skills.decayingWindow');
        const last = seen.slice(-w);
        const m = last.reduce((s, x) => s + x.outcome, 0) / last.length;
        const missedTransfer = e.layer === 'transfer' && e.outcome === 0;
        if (
          m < cfg.get<number>('skills.solid.recognition') - cfg.get<number>('skills.decayingDrop') ||
          missedTransfer
        ) {
          status = 'decaying';
          solidSince = undefined;
        }
      } else status = 'learning';
    }
    const layers = {} as SkillState['layers'];
    for (const l of LAYERS) layers[l] = { mean: mean(post[l]), n: nEff(post[l]) };
    const tw = cfg.get<number>('skills.trendWindow');
    const avg = (xs: SkillEvidence[]) => (xs.length ? xs.reduce((s, e) => s + e.outcome, 0) / xs.length : 0);
    const recent = list.slice(-tw);
    const prev = list.slice(-2 * tw, -tw);
    const gapMin = cfg.get<number>('skills.transferGapMinN');
    out.push({
      skill,
      updatedAt: list[list.length - 1].at,
      layers,
      independence: independenceOf(list),
      transferGap:
        layers.recognition.n >= gapMin && layers.transfer.n >= gapMin
          ? layers.recognition.mean - layers.transfer.mean
          : undefined,
      lastSeen: list[list.length - 1].at,
      trend: prev.length ? avg(recent) - avg(prev) : 0,
      status,
      nEffTotal: LAYERS.reduce((s, l) => s + nEff(post[l]), 0),
      solidSince,
    });
  }
  return out;
}

/** weighted share of correct unassisted evidence among the last N rows (docs/backend/05 §3.2) */
export function independenceOf(list: SkillEvidence[]): number {
  const last = list.slice(-cfg.get<number>('skills.independenceWindow'));
  const wsum = last.reduce((s, e) => s + e.weight, 0);
  return wsum ? last.reduce((s, e) => s + (e.outcome === 1 && !e.assisted ? e.weight : 0), 0) / wsum : 0;
}

/** assistance fading: which hints/steps are offered by default (docs/backend/05 §7) */
export function assistLevel(independence: number): 0 | 1 | 2 | 3 {
  if (independence < cfg.get<number>('assist.level3Below')) return 3;
  if (independence < cfg.get<number>('assist.level2Below')) return 2;
  if (independence < cfg.get<number>('assist.level1Below')) return 1;
  return 0;
}
