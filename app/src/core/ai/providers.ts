// Providers (docs/backend/07 §3.5): GroqProvider (OpenAI-compatible, wording only) and TemplateProvider (always available).
import { cfg } from '../../config';
import templates from '../../content/templates/mistake_explanation.json';
import type { AiProvider } from '../../types/services';
import type { GroundedPackage } from './package';
import { PROMPT_VERSION, systemPrompt } from './prompts';

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export class AiFailure extends Error {
  constructor(
    public reason: 'no-key' | 'network' | 'rate-limit' | 'http' | 'timeout' | 'empty',
    public retryAfterSec?: number,
    public status?: number,
  ) {
    super(reason);
  }
}

export interface GroqDeps {
  getKey: () => string;
  getModel: () => string;
  fetchFn?: typeof fetch;
}

export interface WordingProvider extends AiProvider {
  /** `note` carries the verifier's problems from the previous attempt */
  explainWithNote(pkg: GroundedPackage, note?: string, signal?: AbortSignal): Promise<string>;
}

export function createGroqProvider(d: GroqDeps): WordingProvider {
  const f = d.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  async function explainWithNote(pkg: GroundedPackage, note?: string, signal?: AbortSignal): Promise<string> {
    const key = d.getKey();
    if (!key) throw new AiFailure('no-key');
    let res: Response;
    try {
      res = await f(GROQ_URL, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: d.getModel() || cfg.get<string>('ai.groq.defaultModel'),
          temperature: 0.3,
          max_tokens: 260,
          messages: [
            { role: 'system', content: systemPrompt(pkg.style.maxWords) },
            {
              role: 'user',
              content: JSON.stringify(pkg) + (note ? `\n\nFix these problems from your previous answer: ${note}` : ''),
            },
          ],
        }),
      });
    } catch (e) {
      throw new AiFailure((e as { name?: string }).name === 'AbortError' ? 'timeout' : 'network');
    }
    if (res.status === 429) throw new AiFailure('rate-limit', Number(res.headers.get('retry-after')) || undefined, 429);
    if (!res.ok) throw new AiFailure('http', undefined, res.status);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = (data.choices?.[0]?.message?.content ?? '').trim();
    if (!text) throw new AiFailure('empty');
    return text;
  }
  return {
    id: 'groq',
    available: async () => !!d.getKey(),
    explain: (pkg) => explainWithNote(pkg as GroundedPackage),
    explainWithNote,
  };
}

const hashStr = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

/** Template wording: same verified facts, fixed sentences. Must be good, not a stub. */
export function templateText(pkg: GroundedPackage, motifId?: string): string {
  const h = hashStr(pkg.position.fen);
  const leads = templates.leads as Record<string, string>;
  const lead = fill(leads[motifId ?? 'generic'] ?? leads.generic, {
    moveNo: pkg.played?.moveNo ?? '',
    san: pkg.played?.san ?? 'that move',
  });
  const line = pkg.facts.filter((f) => f.id.startsWith('F')).slice(1);
  const reply = line.length ? line.map((f) => f.text).join(' ') : '';
  const cs = (templates.causes as Record<string, string[]>)[pkg.cause?.top ?? 'unknown'] ?? templates.causes.unknown;
  const closing = fill(templates.closing[h % templates.closing.length], { habit: pkg.habit });
  const best = pkg.best ? `A better move was ${pkg.best.san}.` : '';
  // drop the optional sentences (best move, then cause) until the text fits the word limit
  const parts: (string | undefined)[] = [lead, reply, best, cs[h % cs.length], closing];
  const fits = () => parts.filter(Boolean).join(' ').split(/\s+/).length <= pkg.style.maxWords;
  for (const drop of [2, 3, 1]) if (!fits()) parts[drop] = undefined;
  return parts.filter(Boolean).join(' ');
}

export function createTemplateProvider(): AiProvider & { text(pkg: GroundedPackage, motifId?: string): string } {
  return {
    id: 'template',
    available: async () => true,
    explain: async (pkg) => templateText(pkg as GroundedPackage),
    text: templateText,
  };
}
export { PROMPT_VERSION };
