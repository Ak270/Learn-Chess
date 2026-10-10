// PlayService (docs/backend/07 §2, docs/backend/08 §4 Play). A GameSession owns the rules, clocks (from timestamps),
// the sparring opponent, coach logic (Safety Check, blunder interception with a question, hint ladder, slow-down lock)
// and persistence after every move so a refresh never loses more than the current move.
import { Chess, type Move, type Square } from 'chess.js';
import { cfg } from '../config';
import { flipWinPct, winPctOf } from '../core/chess/eval';
import { loosePieces } from '../core/chess/see';
import { threatQuestion, threats, type Threat } from '../core/chess/threats';
import { flagged, newClock, press, remainingNow, type ClockState } from '../core/play/clock';
import { estimateFrom, performanceLine, recommendLevel, type Played } from '../core/play/matchmaking';
import { levelById } from '../core/opponent/levels';
import { plausibleFor, type OpponentCtx, type OpponentResult } from '../core/opponent/opponent';
import { thinkMs, seededRng, shouldResign, acceptsDraw } from '../core/opponent/sampler';
import { evidenceFromAttempt } from '../core/skills/derive';
import type { MentorDB } from '../data/db';
import { emit } from '../data/bus';
import { repos } from '../data/repos';
import { ulid } from '../data/ulid';
import type { SkillId } from '../types/ids';
import type { Game } from '../types/model';
import type { EngineClient } from '../types/services';

export type PlayMode = 'normal' | 'coach' | 'training' | 'critical';
export interface GameConfig {
  levelId: number;
  tcIndex: number;
  mode: PlayMode;
  color: 'w' | 'b' | 'r';
  startFen?: string;
  focusSkill?: SkillId;
}
export interface MoveRec {
  ply: number;
  uci: string;
  san: string;
  by: 'me' | 'bot';
  at: number;
  spentMs: number;
  ticks?: number;
  statement?: { correct: boolean; assisted: boolean };
  cp?: number;
  source?: OpponentResult['source'];
}
export interface TakebackOffer {
  fen: string;
  hanging: { square: string; attackerSquare?: string; gain: number }[];
  options: { text: string; correct: boolean }[];
  winPctLoss: number;
  stage: 'question' | 'hints' | 'decide';
  hintsShown: number;
}
export type SessionEvent = 'state' | 'move' | 'offer' | 'hint' | 'ended' | 'bot-thinking' | 'lock';

interface Meta {
  cfg: GameConfig;
  me: 'w' | 'b';
  startFen?: string;
  moves: MoveRec[];
  clock: ClockState;
  takebacksUsed: number;
  hintsUsed: number;
  lock: number;
  lastInterruptMove: number;
  interceptions: { ply: number; kept: boolean; assisted: boolean; granted: boolean }[];
  intents: { ply: number; skill: string; kind: string }[];
  intentState: { forkUsed: number; lastThreatPly: number; log: { ply: number; skill: string; kind: string }[] };
  evals: number[];
  status: 'live' | 'ended';
  /** true when the opponent engine stalled and a fallback move was played */
  degraded?: boolean;
  result: Game['result'];
  termination?: string;
  gameId: string;
}
export interface PlayDeps {
  db: MentorDB;
  /** engine used for coach verification and hints (NOT the opponent's) */
  analysis: EngineClient;
  makeOpponent: (levelId: number) => {
    level: { id: number; name: string; elo: number };
    choose(fen: string, history: string[], ctx: OpponentCtx): Promise<OpponentResult>;
  };
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  rng?: () => number;
}

const TCS = () => cfg.get<[string, number, number][]>('play.timeControls');
const nameOf = (c: 'w' | 'b') => (c === 'w' ? 'White' : 'Black');

export class GameSession {
  chess: Chess;
  meta: Meta;
  thinking = false;
  offer?: TakebackOffer;
  private listeners = new Set<(e: SessionEvent) => void>();
  private lastTurnAt: number;
  private opp: ReturnType<PlayDeps['makeOpponent']>;
  private hintStep = 0;

  constructor(
    private deps: PlayDeps,
    meta: Meta,
  ) {
    this.meta = meta;
    this.chess = meta.startFen ? new Chess(meta.startFen) : new Chess();
    for (const m of meta.moves)
      this.chess.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci[4] });
    this.opp = deps.makeOpponent(meta.cfg.levelId);
    this.lastTurnAt = this.now();
  }
  private now = () => (this.deps.now ?? Date.now)();
  private sleep = (ms: number) => (this.deps.sleep ? this.deps.sleep(ms) : new Promise<void>((r) => setTimeout(r, ms)));

  on(f: (e: SessionEvent) => void) {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }
  private emit(e: SessionEvent) {
    this.listeners.forEach((f) => f(e));
  }

  get me() {
    return this.meta.me;
  }
  get over() {
    return this.meta.status === 'ended';
  }
  get mode() {
    return this.meta.cfg.mode;
  }
  get coaching() {
    return this.mode !== 'normal'; // coach, training and critical-position games all get the coach features
  }
  get level() {
    return this.opp.level;
  }
  get moves() {
    return this.meta.moves;
  }
  get lockRemaining() {
    return this.meta.lock;
  }
  get clock() {
    return this.meta.clock;
  }
  get turn() {
    return this.chess.turn();
  }
  get canInteract() {
    return !this.over && !this.thinking && !this.offer && this.chess.turn() === this.me;
  }
  clockSeconds(c: 'w' | 'b') {
    return remainingNow(this.meta.clock, c, this.now());
  }

  // ---------- persistence ----------
  async save() {
    const m = this.meta;
    await this.deps.db.kv.put({ key: `play.meta:${m.gameId}`, value: m });
    const g = await this.deps.db.games.get(m.gameId);
    if (g) await this.deps.db.games.put({ ...g, pgn: this.pgn(), result: m.result, termination: m.termination });
  }
  pgn(): string {
    const c = this.chess;
    const lv = `${this.opp.level.name} (${this.opp.level.elo})`;
    const white = this.me === 'w' ? 'You' : lv;
    const black = this.me === 'w' ? lv : 'You';
    c.setHeader('White', white);
    c.setHeader('Black', black);
    c.setHeader('Result', this.meta.result);
    return c.pgn();
  }

  // ---------- learner move ----------
  /** ticks = how many Safety Check boxes were ticked for this move (coach mode habit, not a gate). */
  async userMove(
    mv: { from: string; to: string; promotion?: string },
    o: { ticks?: number } = {},
  ): Promise<{ ok: boolean; reason?: string; move?: Move }> {
    if (!this.canInteract) return { ok: false, reason: 'not-your-turn' };
    if (this.meta.lock > 0 && this.coaching) return { ok: false, reason: 'statement-needed' };
    const fenBefore = this.chess.fen();
    let m: Move;
    try {
      m = this.chess.move({ from: mv.from, to: mv.to, promotion: mv.promotion ?? 'q' });
    } catch {
      return { ok: false, reason: 'illegal' };
    }
    const spent = this.now() - this.lastTurnAt;
    await this.record(m, 'me', spent, { ticks: o.ticks });
    if (this.over) return { ok: true, move: m };
    if (this.coaching) {
      const rushed = spent < cfg.get<number>('coach.rushedNudgeMs') && !o.ticks && this.meta.moves.length > 8;
      const flaggedBlunder = await this.maybeIntercept(fenBefore, m);
      if (flaggedBlunder) {
        if (rushed) this.meta.lock = cfg.get<number>('consequence.slowDownLockMoves');
        return { ok: true, move: m };
      }
      if (this.meta.lock > 0) this.meta.lock--;
    }
    void this.botTurn();
    return { ok: true, move: m };
  }

  private async record(m: Move, by: 'me' | 'bot', spentMs: number, extra: Partial<MoveRec> = {}) {
    const meta = this.meta;
    meta.moves.push({ ply: meta.moves.length + 1, uci: m.lan, san: m.san, by, at: this.now(), spentMs, ...extra });
    meta.clock = press(meta.clock, m.color, this.now(), meta.moves.length >= 2);
    this.lastTurnAt = this.now();
    this.hintStep = 0;
    this.emit('move');
    await this.checkEnd();
    await this.save();
  }

  private async checkEnd() {
    const c = this.chess;
    if (c.isCheckmate())
      return this.end(
        c.turn() === this.me ? (this.me === 'w' ? '0-1' : '1-0') : this.me === 'w' ? '1-0' : '0-1',
        'checkmate',
      );
    if (c.isStalemate()) return this.end('1/2-1/2', 'stalemate');
    if (c.isDraw())
      return this.end(
        '1/2-1/2',
        c.isThreefoldRepetition() ? 'repetition' : c.isInsufficientMaterial() ? 'insufficient material' : 'draw',
      );
    const f = flagged(this.meta.clock, this.now());
    if (f) return this.end(f === 'w' ? '0-1' : '1-0', 'time');
  }

  async end(result: Game['result'], termination: string) {
    if (this.over) return;
    this.meta.status = 'ended';
    this.meta.result = result;
    this.meta.termination = termination;
    this.offer = undefined;
    await this.save();
    const score = result === '1/2-1/2' ? 0.5 : (result === '1-0') === (this.me === 'w') ? 1 : 0;
    if (this.mode !== 'critical')
      await this.deps.db.kv.put({
        key: `play.result:${this.meta.gameId}`,
        value: { levelElo: this.opp.level.elo, score, at: this.now() },
      });
    emit('play:ended', this.meta.gameId);
    this.emit('ended');
  }
  async resign() {
    await this.end(this.me === 'w' ? '0-1' : '1-0', 'resignation');
  }
  async checkClock() {
    await this.checkEnd();
  }
  async offerDraw(): Promise<boolean> {
    const cp = this.meta.evals.length ? this.meta.evals[this.meta.evals.length - 1] : 0;
    const ok = acceptsDraw(cp, this.meta.moves.length);
    if (ok) await this.end('1/2-1/2', 'agreement');
    return ok;
  }

  // ---------- bot ----------
  async botTurn() {
    if (this.over || this.chess.turn() === this.me) return;
    this.thinking = true;
    this.emit('bot-thinking');
    const fen = this.chess.fen();
    const history = this.meta.moves.map((m) => m.uci);
    const ctx: OpponentCtx = {
      ply: history.length,
      intent: this.mode === 'training' && this.meta.cfg.focusSkill ? { skill: this.meta.cfg.focusSkill } : undefined, // honesty: intent is OFF in normal play
      state: this.meta.intentState,
    };
    const t0 = this.now();
    const r = await this.chooseWithWatchdog(fen, history, ctx);
    if (r.evalCp !== undefined) this.meta.evals.push(r.evalCp);
    const legal = this.chess.moves({ verbose: true });
    const delay = thinkMs({
      rng: this.deps.rng ?? seededRng(t0 & 0xffff),
      legalMoves: legal.length,
      tactical: legal.some((m) => m.captured || m.san.includes('+')),
      ply: history.length,
      clockSec: this.clockSeconds(this.chess.turn()),
    });
    await this.sleep(Math.max(0, delay - (this.now() - t0)));
    if (this.over) return;
    if (shouldResign(levelById(this.opp.level.id), this.meta.evals) && history.length > 20) {
      this.thinking = false;
      return this.end(this.me === 'w' ? '1-0' : '0-1', 'resignation by opponent');
    }
    const m = this.chess.move({ from: r.uci.slice(0, 2), to: r.uci.slice(2, 4), promotion: r.uci[4] });
    this.thinking = false;
    await this.record(m, 'bot', this.now() - t0, { cp: r.evalCp, source: r.source });
    if (r.intent) this.meta.intents.push({ ply: history.length + 1, ...r.intent });
    this.emit('state');
  }

  /** The opponent must never freeze a game: on a stall or an error it plays a simple fallback move and says so. */
  private async chooseWithWatchdog(fen: string, history: string[], ctx: OpponentCtx): Promise<OpponentResult> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.opp.choose(fen, history, ctx),
        new Promise<never>((_, rej) => {
          timer = setTimeout(() => rej(new Error('opponent timeout')), cfg.get<number>('opponent.timeoutMs'));
        }),
      ]);
    } catch {
      const legal = new Chess(fen).moves({ verbose: true });
      const caps = legal.filter((m) => m.captured).sort((a, b) => b.captured!.length - a.captured!.length);
      const pick = caps[0] ?? legal[Math.floor((this.deps.rng ?? Math.random)() * legal.length)];
      this.meta.degraded = true;
      this.emit('state');
      return { uci: pick.lan, source: 'engine' };
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------- coach: blunder interception (docs/backend/07 §2.2) ----------
  private async maybeIntercept(fenBefore: string, m: Move): Promise<boolean> {
    const meta = this.meta;
    const learnerMoves = meta.moves.filter((x) => x.by === 'me').length;
    if (meta.takebacksUsed >= cfg.get<number>('coach.takebacksPerGame')) return false;
    if (meta.lastInterruptMove && learnerMoves - meta.lastInterruptMove < cfg.get<number>('coach.interruptEveryMoves'))
      return false;
    const fenAfter = this.chess.fen();
    const hang = loosePieces(fenAfter, m.color).hanging.filter((h) => h.gain >= 2); // cheap pre-filter, material only
    if (!hang.length) return false;
    const depth = cfg.get<number>('coach.interceptDepth');
    let loss: number;
    try {
      const before = await this.deps.analysis.analyse(fenBefore, { depth, multiPv: 1 });
      const after = await this.deps.analysis.analyse(fenAfter, { depth, multiPv: 1 });
      loss = Math.max(0, winPctOf(before.lines[0]) - flipWinPct(winPctOf(after.lines[0])));
    } catch {
      loss = 100; // engine down: trust the material pre-filter
    }
    if (loss < cfg.get<number>('classification.blunderWinPct')) return false;
    const q = threatQuestion(
      fenAfter,
      (n) => Math.floor((this.deps.rng ?? Math.random)() * n),
      hang.map((h) => h.square),
    );
    if (!q) return false;
    meta.lastInterruptMove = learnerMoves;
    this.offer = {
      fen: fenAfter,
      hanging: hang.map((h) => ({ square: h.square, attackerSquare: h.attackerSquare, gain: h.gain })),
      options: q.options,
      winPctLoss: loss,
      stage: 'question',
      hintsShown: 0,
    };
    this.emit('offer');
    return true;
  }

  /** Right answer -> take-back granted. Wrong -> hint ladder (H1..H3), take-back then allowed but assisted. */
  async answerOffer(optionIndex: number): Promise<{ correct: boolean; granted: boolean; hint?: string }> {
    const o = this.offer;
    if (!o) return { correct: false, granted: false };
    const correct = !!o.options[optionIndex]?.correct;
    await this.recordPromptEvidence(correct, o.hintsShown > 0);
    if (correct) {
      await this.grantTakeback(o.hintsShown > 0);
      return { correct: true, granted: true };
    }
    o.hintsShown = Math.min(3, o.hintsShown + 1);
    o.stage = o.hintsShown >= 3 ? 'decide' : 'hints';
    const hint = [
      "Look at the opponent's last move. What did it attack or open up?",
      `Look at ${o.hanging[0]?.square ?? 'the highlighted square'}. What can reach it?`,
      this.nameTopThreat(o.fen),
    ][o.hintsShown - 1];
    this.meta.hintsUsed++;
    this.emit('hint');
    return { correct: false, granted: false, hint };
  }
  private nameTopThreat(fen: string) {
    const t = threats(fen)[0];
    return t
      ? `The main threat: ${t.evidence}.`
      : 'There is no big threat, but check what each of your pieces is protected by.';
  }
  /** Take-back is allowed after the third hint (marked assisted). */
  async takebackAfterHints() {
    if (this.offer && this.offer.hintsShown >= 3) await this.grantTakeback(true);
  }
  private async grantTakeback(assisted: boolean) {
    const meta = this.meta;
    this.chess.undo();
    const undone = meta.moves.pop();
    meta.takebacksUsed++;
    meta.interceptions.push({ ply: undone?.ply ?? meta.moves.length + 1, kept: false, assisted, granted: true });
    this.offer = undefined;
    this.lastTurnAt = this.now();
    meta.clock = { ...meta.clock, turn: this.me, turnStartedAt: this.now() };
    await this.save();
    this.emit('state');
  }
  async keepMove() {
    const o = this.offer;
    if (!o) return;
    this.meta.interceptions.push({
      ply: this.meta.moves.length,
      kept: true,
      assisted: o.hintsShown > 0,
      granted: false,
    });
    this.offer = undefined;
    await this.save();
    this.emit('state');
    void this.botTurn();
  }

  /** Coach-mode take-back button (up to the limit): removes the last full move pair. */
  async takebackPair(): Promise<boolean> {
    if (
      !this.coaching ||
      this.thinking ||
      this.over ||
      this.meta.takebacksUsed >= cfg.get<number>('coach.takebacksPerGame') ||
      this.meta.moves.length < 2
    )
      return false;
    this.chess.undo();
    this.chess.undo();
    this.meta.moves.splice(-2, 2);
    this.meta.takebacksUsed++;
    this.lastTurnAt = this.now();
    await this.save();
    this.emit('state');
    return true;
  }

  // ---------- coach: slow-down lock threat statement ----------
  threatStatementQuestion() {
    return threatQuestion(this.chess.fen(), (n) => Math.floor((this.deps.rng ?? Math.random)() * n));
  }
  async answerStatement(correct: boolean) {
    await this.recordPromptEvidence(correct, false);
    if (correct && this.meta.lock > 0) this.meta.lock--;
    const last = this.meta.moves[this.meta.moves.length - 1];
    if (last) last.statement = { correct, assisted: false };
    await this.save();
    this.emit('lock');
  }

  // ---------- hint ladder (docs/backend/07 §2.3) ----------
  async hint(): Promise<{ level: number; text: string; arrows: [string, string, string][]; highlight?: string[] }> {
    this.hintStep = Math.min(4, this.hintStep + 1);
    this.meta.hintsUsed++;
    const fen = this.chess.fen();
    const lastOpp = [...this.meta.moves].reverse().find((m) => m.by === 'bot');
    const ts: Threat[] = threats(fen);
    let out: { level: number; text: string; arrows: [string, string, string][]; highlight?: string[] };
    if (this.hintStep === 1)
      out = { level: 1, text: "Look at the opponent's last move. What did it attack or open up?", arrows: [] };
    else if (this.hintStep === 2)
      out = {
        level: 2,
        text: 'The piece they just moved is marked. What can it capture or check next?',
        arrows: lastOpp ? [[lastOpp.uci.slice(0, 2), lastOpp.uci.slice(2, 4), 'blue']] : [],
        highlight: ts.flatMap((t) => [t.from, t.to].filter(Boolean) as string[]),
      };
    else if (this.hintStep === 3)
      out = {
        level: 3,
        text: ts[0]
          ? `The main threat: ${ts[0].evidence}.`
          : 'There is no big threat right now. Look for checks, captures and threats of your own.',
        arrows: ts[0]?.from && ts[0]?.to ? [[ts[0].from, ts[0].to, 'red']] : [],
      };
    else {
      const best = await this.humanPlausibleBest(fen);
      out = best
        ? {
            level: 4,
            text: `A solid candidate is ${best.san}. Now check what it leaves unprotected.`,
            arrows: [[best.from, best.to, 'green']],
          }
        : { level: 4, text: 'No clear candidate stands out. Check what each move leaves unprotected.', arrows: [] };
    }
    this.emit('hint');
    return out;
  }
  private async humanPlausibleBest(fen: string): Promise<Move | undefined> {
    try {
      const r = await this.deps.analysis.analyse(fen, { depth: cfg.get<number>('engine.hint.depth'), multiPv: 3 });
      const ok = plausibleFor(fen, levelById(4));
      for (const l of r.lines) {
        const u = l.pv[0];
        if (u && ok(u)) {
          const c = new Chess(fen);
          return c.move({ from: u.slice(0, 2) as Square, to: u.slice(2, 4) as Square, promotion: u[4] });
        }
      }
    } catch {
      /* engine down: no candidate */
    }
    return undefined;
  }

  // ---------- evidence ----------
  private async recordPromptEvidence(correct: boolean, assisted: boolean) {
    const attempt = {
      at: this.now(),
      context: 'game_prompt' as const,
      correct,
      hints: assisted ? 1 : 0,
      ms: 0,
      skillTags: ['opponent_threats' as SkillId],
      source: 'critical_drill' as const,
    };
    await repos(this.deps.db).recordAttempt(attempt, evidenceFromAttempt({ ...attempt, id: '' }));
  }

  /** Summary for the end-of-game card, including honest disclosure of training intents. */
  summary() {
    const m = this.meta;
    return {
      result: m.result,
      termination: m.termination,
      takebacks: m.takebacksUsed,
      hints: m.hintsUsed,
      interceptions: m.interceptions,
      intents: m.intents,
      won: m.result === '1/2-1/2' ? undefined : (m.result === '1-0') === (m.me === 'w'),
      gameId: m.gameId,
      reviewable: this.mode !== 'critical',
    };
  }
}

export function createPlayService(deps: PlayDeps) {
  const now = deps.now ?? Date.now;
  const r = repos(deps.db);

  async function start(c: GameConfig): Promise<GameSession> {
    const me = c.color === 'r' ? ((deps.rng ?? Math.random)() < 0.5 ? 'w' : 'b') : c.color;
    const tc = TCS()[c.tcIndex] ?? TCS()[0];
    const lv = levelById(c.levelId);
    const gameId = ulid(now());
    const startFen = c.startFen;
    const white = me === 'w' ? 'You' : `${lv.name} (${lv.elo})`;
    const black = me === 'w' ? `${lv.name} (${lv.elo})` : 'You';
    await r.addGame({
      id: gameId,
      source: 'mentor',
      pgn: '',
      startedAt: now(),
      white,
      black,
      playerColor: me,
      result: '*',
      mode:
        c.mode === 'critical'
          ? 'training'
          : c.mode === 'coach'
            ? 'coach'
            : c.mode === 'training'
              ? 'training'
              : 'normal',
      timeControl: tc[1] ? `${tc[1]}+${tc[2]}` : undefined,
      importedAt: now(),
    });
    const clock = newClock(tc[1], tc[2]);
    const chess0 = startFen ? new Chess(startFen) : new Chess();
    clock.turn = chess0.turn();
    const meta: Meta = {
      cfg: c,
      me,
      startFen,
      moves: [],
      clock,
      takebacksUsed: 0,
      hintsUsed: 0,
      lock: 0,
      lastInterruptMove: 0,
      interceptions: [],
      intents: [],
      intentState: { forkUsed: 0, lastThreatPly: -99, log: [] },
      evals: [],
      status: 'live',
      result: '*',
      gameId,
    };
    const s = new GameSession(deps, meta);
    if (startFen) s.chess.header('SetUp', '1', 'FEN', startFen);
    await s.save();
    if (me !== chess0.turn()) void s.botTurn();
    return s;
  }

  async function resume(gameId: string): Promise<GameSession | undefined> {
    const meta = (await deps.db.kv.get(`play.meta:${gameId}`))?.value as Meta | undefined;
    if (!meta || meta.status === 'ended') return undefined;
    const s = new GameSession(deps, meta);
    if (s.chess.turn() !== s.me) void s.botTurn();
    return s;
  }

  async function activeGame(): Promise<string | undefined> {
    const rows = await deps.db.kv.where('key').startsWith('play.meta:').toArray();
    return rows
      .map((x) => x.value as Meta)
      .filter((m) => m.status === 'live')
      .sort((a, b) => (b.moves.at(-1)?.at ?? 0) - (a.moves.at(-1)?.at ?? 0))[0]?.gameId;
  }

  async function results(): Promise<Played[]> {
    const rows = await deps.db.kv.where('key').startsWith('play.result:').toArray();
    return rows.map((x) => x.value as Played & { at: number }).sort((a, b) => a.at - b.at);
  }
  async function levelEstimate() {
    const res = await results();
    const est = estimateFrom(res);
    return {
      estimate: est,
      games: res.length,
      recommendation: recommendLevel(est, res.length),
      performance: performanceLine(res),
    };
  }
  return { start, resume, activeGame, results, levelEstimate, nameOf };
}
export type PlayService = ReturnType<typeof createPlayService>;
