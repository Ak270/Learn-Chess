import { cfg } from '../../config';
// Think-aloud baseline scoring (docs/backend/10 §1.2). Rule-based; shown to the learner as observations, not grades.
export interface ThinkAloudInput {
  kind: 'hanging' | 'fork' | 'threat' | 'quiet' | 'mate1';
  opponentThreatPresent: boolean;
  chips: { opponentThreat: boolean; checkedReply: boolean; checksCapturesThreats: boolean };
  text: string;
  /** distinct moves the learner tried on the board before locking one in */
  triedMoves: string[];
  /** win% lost by the chosen move vs the engine's best (undefined if the engine was unavailable) */
  winPctLoss?: number;
  timeToMoveMs: number;
}
export interface ThinkAloudRubric {
  mentionsOpponentThreat: boolean;
  candidateCount: number;
  checkedReply: boolean;
  foundBestMove: boolean | undefined;
  timeToMoveMs: number;
  lookedAtThreatFirst: boolean;
}

const THREAT_WORDS =
  /\b(threat|threaten|attack|attacks|attacking|take|takes|capture|hang|hanging|unprotected|undefended)\b/i;
const REPLY_WORDS = /\b(then|reply|respond|they could|they can|next|if they)\b/i;

export function scoreThinkAloud(i: ThinkAloudInput): ThinkAloudRubric {
  return {
    mentionsOpponentThreat: i.chips.opponentThreat || THREAT_WORDS.test(i.text),
    candidateCount: new Set(i.triedMoves).size,
    checkedReply: i.chips.checkedReply || REPLY_WORDS.test(i.text),
    foundBestMove: i.winPctLoss === undefined ? undefined : i.winPctLoss < cfg.get('classification.inaccuracyWinPct'),
    timeToMoveMs: i.timeToMoveMs,
    lookedAtThreatFirst: i.chips.opponentThreat,
  };
}

export interface ThinkAloudSummary {
  found: number;
  of: number;
  looked: number;
  note: string;
}
export function summariseThinkAloud(rubrics: ThinkAloudRubric[]): ThinkAloudSummary {
  const known = rubrics.filter((r) => r.foundBestMove !== undefined);
  const found = known.filter((r) => r.foundBestMove).length;
  const looked = rubrics.filter((r) => r.checkedReply).length;
  const note =
    looked < rubrics.length / 2
      ? `You found a good move ${found} of ${known.length} times, but looked at their reply only ${looked} of ${rubrics.length}. That is the habit we will build.`
      : `You found a good move ${found} of ${known.length} times and checked their reply ${looked} of ${rubrics.length} times. We will make that automatic.`;
  return { found, of: known.length, looked, note };
}
