// "Ask Mentor" intent router (docs/backend/07 §4): rules, no LLM. Each intent has a verified answer source.
export type Intent = 'why_lost' | 'practise' | 'explain_concept' | 'is_move_good' | 'greeting' | 'out_of_scope';

export function routeIntent(q: string, o: { positionOnScreen?: boolean } = {}): { intent: Intent; concept?: string } {
  const t = q.toLowerCase().trim();
  if (!t) return { intent: 'out_of_scope' };
  if (/\b(hi|hello|hey)\b/.test(t) && t.split(/\s+/).length <= 3) return { intent: 'greeting' };
  if (/(why|how).*(lose|lost|blunder|mistake|go wrong)|what went wrong/.test(t)) return { intent: 'why_lost' };
  if (/(practi[sc]e|train|work on|study|focus|what should i do|today)/.test(t)) return { intent: 'practise' };
  if (o.positionOnScreen && /(is|was).*(good|bad|best|ok|okay|blunder)|should i (play|move)|what about/.test(t))
    return { intent: 'is_move_good' };
  const concept = /(explain|what is|what's|what are|how does|tell me about)\s+(an?\s+|the\s+)?(.+?)\??$/.exec(t);
  if (concept) return { intent: 'explain_concept', concept: concept[3] };
  return { intent: 'out_of_scope' };
}

export const CONCEPT_ALIASES: Record<string, string> = {
  fork: 'tactic_fork',
  forks: 'tactic_fork',
  pin: 'tactic_pin',
  pins: 'tactic_pin',
  skewer: 'tactic_skewer',
  skewers: 'tactic_skewer',
  'back rank': 'tactic_backrank',
  'back-rank mate': 'tactic_backrank',
  'back rank mate': 'tactic_backrank',
  'hanging piece': 'piece_safety',
  'hanging pieces': 'piece_safety',
  'undefended piece': 'piece_safety',
  'safety check': 'piece_safety',
  stalemate: 'eg_basic_mates',
  'discovered attack': 'tactic_discovered',
  checkmate: 'mate_patterns',
};
