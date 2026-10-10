// Entities from docs/backend/02 §2. Times are UTC epoch ms, ids are ULIDs, positions are FEN strings.
import type { ID, Ms, MotifId, SkillId } from './ids';

export type Layer = 'knowledge' | 'recognition' | 'calculation' | 'decision' | 'transfer' | 'retention';
export const LAYERS: Layer[] = ['knowledge', 'recognition', 'calculation', 'decision', 'transfer', 'retention'];

export interface Profile {
  id: 'me';
  createdAt: Ms;
  displayName: string;
  platformAccounts: { lichess?: string; chesscom?: string };
  selfRating?: number;
  estimatedRating?: number;
  dailyMinutes: number;
  restDay: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  goalRating: number;
  settingsVersion: number;
}
export type EvalPoint = { cp?: number; mate?: number; depth: number };
export type MoveClass =
  'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'book' | 'inaccuracy' | 'mistake' | 'miss' | 'blunder';

export interface Game {
  id: ID;
  source: 'lichess' | 'chesscom' | 'pgn' | 'mentor';
  sourceId?: string;
  pgn: string;
  startedAt: Ms;
  timeControl?: string;
  white: string;
  black: string;
  playerColor: 'w' | 'b';
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
  termination?: string;
  opponentRating?: number;
  playerRating?: number;
  mode?: 'normal' | 'coach' | 'training';
  clocks?: number[];
  importedAt: Ms;
  reviewedAt?: Ms;
  reviewVersion?: number;
}
export interface MotifHit {
  id: MotifId;
  role: 'allowed' | 'missed' | 'played';
  squares: string[];
  severity: 1 | 2 | 3;
  evidence: string;
}
export interface PlyRecord {
  gameId: ID;
  ply: number;
  fenBefore: string;
  san: string;
  uci: string;
  color: 'w' | 'b';
  timeSpentMs?: number;
  evalBefore?: EvalPoint;
  evalAfter?: EvalPoint;
  bestUci?: string;
  bestLine?: string[];
  winPctBefore?: number;
  winPctAfter?: number;
  winPctLoss?: number;
  cls?: MoveClass;
  accuracy?: number;
  isBook?: boolean;
  motifs?: MotifHit[];
  phase: 'opening' | 'middlegame' | 'endgame';
}
export type Cause =
  | 'perception'
  | 'calculation'
  | 'over_focus_own_plan'
  | 'rushed'
  | 'knowledge_gap'
  | 'transfer_failure'
  | 'tilt'
  | 'unknown';
export interface DiagnosisHypothesis {
  cause: Cause;
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
  confirmedByUser?: boolean | 'corrected';
  correctedTo?: Cause;
}
export interface Mistake {
  id: ID;
  gameId: ID;
  ply: number;
  fen: string;
  playedUci: string;
  bestUci: string;
  refutationUci?: string;
  winPctLoss: number;
  isFirstMeaningful: boolean;
  rank: number;
  motifs: MotifHit[];
  skillTags: SkillId[];
  diagnosis: DiagnosisHypothesis[];
  selfExplanation?: { text: string; at: Ms };
  cardId?: ID;
}
export type CardKind = 'blunder' | 'opening' | 'concept' | 'tactic' | 'endgame';
export interface Card {
  id: ID;
  kind: CardKind;
  fen?: string;
  prompt: string;
  solution: string[];
  why: string;
  skillTags: SkillId[];
  sourceRef?: { mistakeId?: ID; puzzleId?: string; lineId?: string; lessonId?: string };
  srs: {
    scheduler: 'ladder' | 'fsrs';
    step?: number;
    fsrs?: unknown;
    dueAt: Ms;
    lastAt?: Ms;
    lapses: number;
    cleanStreak: number;
    /** cleared blunder cards come back once as a retention probe */
    probe?: 'pending' | 'done';
  };
  state: 'new' | 'learning' | 'review' | 'cleared' | 'suspended';
  createdAt: Ms;
}
export type AttemptContext =
  'drill' | 'puzzle' | 'test' | 'recall' | 'weekly_exam' | 'game_prompt' | 'review' | 'think_aloud' | 'rules_check';
export type Confidence = 'sure' | 'unsure' | 'guess';
export interface Attempt {
  id: ID;
  at: Ms;
  context: AttemptContext;
  cardId?: ID;
  puzzleId?: string;
  fen?: string;
  playedUci?: string;
  correct: boolean;
  hints: number;
  ms: number;
  confidence?: Confidence;
  threatsStated?: string[];
  skillTags: SkillId[];
  /** what kind of evidence this attempt is (docs/backend/05 §3.1); defaults from `context` */
  source?: EvidenceSource;
  /** days since the card's previous review (retention evidence needs >= 7) */
  gapDays?: number;
  /** trap question: the pattern of the day does not apply */
  trap?: boolean;
}
export type EvidenceSource =
  | 'lesson_check'
  | 'puzzle_recognition'
  | 'puzzle_calc'
  | 'calc_deepdive'
  | 'critical_drill'
  | 'card_review'
  | 'daily_test'
  | 'think_aloud'
  | 'rules_check';
export interface SkillEvidence {
  id: ID;
  at: Ms;
  skill: SkillId;
  layer: Layer;
  outcome: 1 | 0 | 0.5;
  weight: number;
  assisted: boolean;
  sourceRef: { attemptId?: ID; mistakeId?: ID; gameId?: ID };
}
export interface SkillState {
  skill: SkillId;
  updatedAt: Ms;
  layers: Record<Layer, { mean: number; n: number }>;
  independence: number;
  recentGameRate?: number;
  transferGap?: number;
  lastSeen: Ms;
  trend: number;
  status: SkillStatus;
  nEffTotal: number;
  solidSince?: Ms;
}
export type SkillStatus = 'insufficient' | 'learning' | 'solid' | 'maintenance' | 'decaying';
export interface PlanItem {
  kind: 'card' | 'puzzle' | 'lesson' | 'game' | 'test';
  ref: string;
  why: string;
}
export interface PlanBlock {
  id: 'recall' | 'lesson' | 'drills' | 'play' | 'test' | 'note';
  targetMin: number;
  items: PlanItem[];
  startedAt?: Ms;
  doneAt?: Ms;
  summary?: unknown;
}
export interface SessionPlan {
  id: ID;
  date: string;
  minutes: number;
  focusSkill: SkillId;
  blocks: PlanBlock[];
  createdAt: Ms;
  completedAt?: Ms;
  light: boolean;
  teacherNote?: string[];
}
export interface Streak {
  id: 'me';
  current: number;
  best: number;
  freezeLeft: number;
  lastDay: string;
  /** completed days since the last freeze was earned */
  sinceFreeze: number;
}
export interface Journal {
  id: ID;
  at: Ms;
  kind: 'teacher_note' | 'weekly_letter' | 'monthly_letter';
  body: string;
  refs: ID[];
}
export interface ContentProgress {
  id: string;
  kind: 'lesson' | 'opening' | 'endgame' | 'modelgame';
  state: 'new' | 'seen' | 'done';
  at: Ms;
  score?: number;
}
export interface KV {
  key: string;
  value: unknown;
}

export interface GameReview {
  gameId: ID;
  reviewedAt: Ms;
  engine: { name: string; depth: number };
  learnerColor: 'w' | 'b';
  accuracy: number;
  counts: Partial<Record<MoveClass, number>>;
  phaseGrades: Partial<Record<'opening' | 'middlegame' | 'endgame', 'Solid' | 'Fine' | 'Costly'>>;
  firstMeaningfulPly: number | null;
  firstMeaningfulFlagged: boolean;
  mistakeIds: ID[];
  /** win% of White after each ply (index 0 = start) for the evaluation graph */
  whiteWinPct: number[];
  evidenceEligible: boolean;
  blundersPer40: number;
}
