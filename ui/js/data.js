import { Chess } from '../vendor/chess.js';

// ALL DATA HERE IS PLACEHOLDER. It shows what each screen will display once the backend exists.
// Real shapes are specified in docs/backend/ (data-model phase).

export const user = {
  name: 'Learner', rating: 612, goal: 1000, streak: 4, freezeDays: 1,
  dailyMinutes: 40, focusSkill: 'Hanging pieces', level: 'Phase 1 · Survive & Aware',
};

export const sessionBlocks = [
  { id: 'recall', title: 'Warm-up recall', min: 5, icon: '🧠', desc: '5 cards from earlier material. Answer before any hint.', done: true },
  { id: 'lesson', title: "Today's lesson", min: 5, icon: '📖', desc: 'Undefended pieces: the one idea for today.', done: true },
  { id: 'drills', title: 'Guided drills', min: 12, icon: '🎯', desc: '8 positions. State checks, captures, threats first.', done: false },
  { id: 'play', title: 'Play block', min: 20, icon: '♟️', desc: 'One slow game with the Safety Check on.', done: false },
  { id: 'test', title: 'Daily test', min: 5, icon: '📝', desc: '10 mixed questions with confidence rating.', done: false },
  { id: 'note', title: 'Teacher note', min: 1, icon: '💬', desc: 'Three lines: went well, fix, tomorrow.', done: false },
];

export const stats = [
  { label: 'Blunders / game', value: 3.4, prev: 4.6, good: 'down', unit: '' },
  { label: 'Missed threats / game', value: 2.1, prev: 3.0, good: 'down', unit: '' },
  { label: 'Blunder Box cleared', value: 38, prev: 31, good: 'up', unit: '%' },
  { label: 'Card retention', value: 82, prev: 76, good: 'up', unit: '%' },
];

export const ratingTrend = [560, 575, 570, 590, 585, 600, 598, 612];
export const blunderTrend = [5.1, 4.8, 4.6, 4.4, 4.0, 3.9, 3.6, 3.4];

export const recentGames = [
  { id: 'g1', opp: 'Rook Rita (1000)', result: 'loss', date: 'Today', acc: 61, firstMistake: 'Move 11 · Nh4 left the knight hanging', tag: 'Hanging piece' },
  { id: 'g2', opp: 'Bishop Ben (800)', result: 'win', date: 'Yesterday', acc: 74, firstMistake: 'Move 14 · missed a check', tag: 'Missed check' },
  { id: 'g3', opp: 'Knight Nora (600)', result: 'win', date: '2 days ago', acc: 69, firstMistake: 'Move 9 · rushed trade', tag: 'Rushed' },
  { id: 'g4', opp: 'Rook Rita (1000)', result: 'loss', date: '4 days ago', acc: 55, firstMistake: 'Move 7 · fork missed', tag: 'Fork' },
];

// Sample game used by Review. Classification per ply is hand-set here; the real system computes it from engine data.
export const sampleGame = {
  white: 'You (612)', black: 'Rook Rita (1000)', result: '0-1',
  moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 O-O Nf6 d3 d6 Bg5 h6 Bxf6 Qxf6 Nc3 Bg4 h3 Bh5 g4 Bg6 Nh4 Qxh4 Nd5 Qd8 Nxc7+ Qxc7 Bb5 a6'.split(' '),
  // eval in pawns, White-positive, one per ply (index 0 = start)
  evals: [0.2, 0.3, 0.2, 0.3, 0.2, 0.3, 0.3, 0.2, 0.3, 0.2, 0.3, 0.1, 0.3, 0.2, 0.3, 0.2, 0.3, 0.2, 0.0, -0.1, -0.2, -3.4, -3.3, -3.4, -4.6, -6.8, -6.9, -7.0, -7.1],
  cls: ['book', 'book', 'book', 'book', 'book', 'book', 'book', 'book', 'best', 'good', 'good', 'good', 'excellent', 'good', 'good', 'good', 'good', 'good', 'inaccuracy', 'good', 'blunder', 'best', 'good', 'good', 'mistake', 'best', 'good', 'good'],
};
export const firstMistakePly = 21; // 1-indexed ply of 11.Nh4

export const classMeta = {
  brilliant: { label: 'Brilliant', sym: '!!', color: '#26c2a3' },
  great: { label: 'Great', sym: '!', color: '#749bbf' },
  best: { label: 'Best', sym: '★', color: '#81b64c' },
  excellent: { label: 'Excellent', sym: '👍', color: '#81b64c' },
  good: { label: 'Good', sym: '✓', color: '#95b776' },
  book: { label: 'Book', sym: '📖', color: '#a88865' },
  inaccuracy: { label: 'Inaccuracy', sym: '?!', color: '#f7c631' },
  mistake: { label: 'Mistake', sym: '?', color: '#ffa459' },
  miss: { label: 'Miss', sym: '✕', color: '#ff7769' },
  blunder: { label: 'Blunder', sym: '??', color: '#fa412d' },
};

export const diagnosis = [
  { cause: "Didn't see the threat", conf: 'High', why: 'You moved in 2s on a critical position and skipped the Safety Check.' },
  { cause: 'Over-focused on your own plan', conf: 'Medium', why: 'Nh4 created an idea against g6 but ignored the queen on f6.' },
  { cause: 'Misjudged after seeing it', conf: 'Low', why: 'No threat statement was recorded, so we cannot rule this out.' },
];

export const puzzles = [
  { id: 'p1', fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', solution: ['Ra8#'], theme: 'Back-rank mate', rating: 400,
    hints: ['Look at the black king. Which squares can it move to?', 'Its own pawns block every escape. Which of your pieces can reach the 8th rank?', 'The rook on a1 can go to a8 with check.'],
    idea: 'The king is trapped behind its own pawns. A check on the back rank cannot be blocked or escaped.' },
  { id: 'p2', fen: '2r1k3/8/8/8/2N5/8/8/4K3 w - - 0 1', solution: ['Nd6+'], theme: 'Fork', rating: 500,
    hints: ['Find a square where your knight attacks two things at once.', 'Look at the king and the rook on c8. Which square hits both?', 'The knight on c4 jumps to d6.'],
    idea: 'A knight fork checks the king while attacking the rook. The king must move and the rook falls.' },
  { id: 'p3', fen: '4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1', solution: ['Rxd5'], theme: 'Undefended piece', rating: 300,
    hints: ['Which black piece is attacked by your rook?', 'Is the queen defended by anything?', 'Capture it with Rxd5.'],
    idea: 'An undefended piece is a free gift. Before every move ask: what is attacked and what is protected?' },
];

// position just before 11.Nh4?? in the sample game
const _c = new Chess();
sampleGame.moves.slice(0, 20).forEach((m) => _c.move(m));
export const fenBeforeBlunder = _c.fen();
puzzles.push({ id: 'p4', fen: fenBeforeBlunder, solution: ['Nd5'], theme: 'Hanging piece', rating: 600,
  hints: ['Before moving a knight, ask which enemy piece can capture on the target square.', 'The queen on f6 sees h4. Which move uses the knight without leaving it loose?', 'Nd5 attacks the queen and is protected twice.'],
  idea: 'Nh4 can be taken for free by the queen. Nd5 attacks the queen and is protected by the e4-pawn and the bishop.' });

export const blunderCards = [
  { id: 'b1', fen: fenBeforeBlunder, title: 'Nh4 left the knight hanging', tag: 'Hanging piece', step: 1, nextDue: 'Today', clears: 1 },
  { id: 'b2', fen: '4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1', title: 'Missed a free queen', tag: 'Missed capture', step: 2, nextDue: 'Tomorrow', clears: 2 },
  { id: 'b3', fen: '2r1k3/8/8/8/2N5/8/8/4K3 w - - 0 1', title: 'Missed a knight fork', tag: 'Fork', step: 0, nextDue: 'Today', clears: 0 },
  { id: 'b4', fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', title: 'Missed back-rank mate', tag: 'Mating pattern', step: 3, nextDue: 'in 5 days', clears: 3 },
];
export const ladder = ['1 day', '3 days', '7 days', '21 days'];

export const roadmap = [
  { id: 1, title: 'Survive & Aware', state: 'current', pct: 55, skills: ['Piece safety', 'Opponent threats', 'Checks · Captures · Threats'] },
  { id: 2, title: 'Tactical Vision', state: 'next', pct: 12, skills: ['Forks', 'Pins & skewers', 'Back-rank mates', 'Removing defenders'] },
  { id: 3, title: 'Thinking Process', state: 'locked', pct: 0, skills: ['Candidate moves', 'Blunder check', '2–3 move calculation'] },
  { id: 4, title: 'Opening Basics', state: 'locked', pct: 0, skills: ['Centre & development', 'King safety', 'A small repertoire'] },
  { id: 5, title: 'Middlegame Plans', state: 'locked', pct: 0, skills: ['Targets', 'Worst piece', 'Pawn breaks', 'Good trades'] },
  { id: 6, title: 'Endgame Foundations', state: 'locked', pct: 0, skills: ['Basic mates', 'Opposition', 'Pawn races', 'Rook endings'] },
  { id: 7, title: 'Transfer & Consolidation', state: 'locked', pct: 0, skills: ['Mixed positions', 'Conversion', 'Defence'] },
];

export const lessons = [
  { id: 'l1', phase: 1, title: 'The Safety Check', min: 5, state: 'done' },
  { id: 'l2', phase: 1, title: 'Undefended pieces', min: 5, state: 'current' },
  { id: 'l3', phase: 1, title: "What did their last move do?", min: 6, state: 'new' },
  { id: 'l4', phase: 1, title: 'Checks, captures, threats', min: 6, state: 'new' },
  { id: 'l5', phase: 2, title: 'The knight fork', min: 5, state: 'locked' },
  { id: 'l6', phase: 2, title: 'Pins and skewers', min: 6, state: 'locked' },
];

export const openings = [
  { id: 'o1', side: 'White', name: 'Sample repertoire A (placeholder)', due: 6, mastery: 48,
    line: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
    why: ['Take the centre.', 'Black mirrors.', 'Develop and attack e5.', 'Defends the pawn.', 'Aim at f7 and prepare to castle.'] },
  { id: 'o2', side: 'Black', name: 'Sample vs 1.e4 (placeholder)', due: 3, mastery: 31, line: ['e4', 'e5', 'Nf3', 'Nc6'], why: ['', 'Claim the centre too.', '', 'Defend e5 with a developing move.'] },
  { id: 'o3', side: 'Black', name: 'Sample vs 1.d4 (placeholder)', due: 0, mastery: 0, line: ['d4', 'd5'], why: ['', 'Stop e4 and fight for the centre.'] },
];
export const leftBook = [
  { n: 4, text: 'Left your line at move 4 in 3 games (you played h3).' },
  { n: 6, text: 'Opponent deviated at move 6 in 2 games (…a6).' },
];

export const skills = [
  { name: 'Piece safety', v: 38, trend: '+6' }, { name: 'Opponent threats', v: 31, trend: '+9' },
  { name: 'Checks/captures/threats', v: 44, trend: '+3' }, { name: 'Forks & pins', v: 22, trend: '+2' },
  { name: 'Calculation', v: 15, trend: '0' }, { name: 'Opening recall', v: 41, trend: '+5' },
  { name: 'Endgames', v: 9, trend: '0' }, { name: 'Planning', v: 12, trend: '0' },
];

export const dailyTest = [
  { puzzle: 'p3', q: 'White to move. What does Black leave unprotected?' },
  { puzzle: 'p2', q: 'White to move. Find the double attack.' },
  { puzzle: 'p1', q: 'White to move. Is there a forced finish?' },
];

export const teacherNotes = [
  'You now check your own pieces before moving. Keep going.',
  'Your knight moves are risky when the queen sees the target square.',
  'Tomorrow: 8 hanging-piece drills, then one slow game.',
];

export const profileExt = {
  motivation: 'understand', goal: 'Reach 1000', pace: 'steady', askBeforeTell: true, ownBoard: true,
  availability: 'Weekdays 40 min · best time: evening',
};
export const memories = [
  { id: 'm1', text: 'You play faster after losing a piece (3 of your last 5 games).', ev: 5, since: '3 weeks ago' },
  { id: 'm2', text: 'Your first big mistake is usually between moves 10 and 14.', ev: 6, since: '2 weeks ago' },
  { id: 'm3', text: 'Hanging-piece errors dropped from 40% to 22% in 6 weeks.', ev: 12, since: 'this week' },
];
export const misconceptions = [
  { id: 'M01', title: 'A protected piece is safe', truth: 'A protected piece can still be lost if the attacker is worth less.', status: 'active', hits: 3 },
  { id: 'M04', title: 'I can ignore their last move if my plan is faster', truth: 'Their threat usually arrives first. Check it before your own idea.', status: 'active', hits: 4 },
  { id: 'M03', title: 'Always capture when you can', truth: 'Some captures lose to a recapture or a trap.', status: 'watching', hits: 1 },
];
