// AiService (docs/backend/07 §3.5): template first, AI wording only when it passes the verifier. Never blocks the UI:
// `explain` returns the template immediately and an optional upgrade that resolves with verified AI text.
import { cfg } from '../config';
import { PROMPT_VERSION, createTemplateProvider, AiFailure, type WordingProvider } from '../core/ai/providers';
import type { GroundedPackage } from '../core/ai/package';
import { verifyText } from '../core/ai/verify';
import type { MentorDB } from '../data/db';

export interface Explanation {
  text: string;
  source: 'template' | 'ai';
  verified: true;
}
export interface ExplainResult {
  /** always present, instant */
  now: Explanation;
  /** resolves with verified AI text, or null when AI is unavailable/rejected/out of quota */
  upgrade: Promise<Explanation | null>;
  cached: boolean;
}
export interface AiStats {
  ai: number;
  template: number;
  rejected: number;
  reasons: Record<string, number>;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const today = (now: number) => new Date(now).toISOString().slice(0, 10);

export function createAiService(deps: {
  db: MentorDB;
  providers: WordingProvider[];
  now?: () => number;
  motifOf?: (pkg: GroundedPackage) => string | undefined;
}) {
  const { db } = deps;
  const now = deps.now ?? Date.now;
  const template = createTemplateProvider();

  const stat = async (f: (s: AiStats) => void) => {
    const s = ((await db.kv.get('ai.stats'))?.value as AiStats | undefined) ?? {
      ai: 0,
      template: 0,
      rejected: 0,
      reasons: {},
    };
    f(s);
    await db.kv.put({ key: 'ai.stats', value: s });
  };

  async function underQuota(p: WordingProvider): Promise<boolean> {
    const until = ((await db.kv.get(`ai.backoff:${p.id}`))?.value as number | undefined) ?? 0;
    if (until > now()) return false;
    const used = ((await db.kv.get(`ai.quota:${p.id}:${today(now())}`))?.value as number | undefined) ?? 0;
    return used < cfg.get<number>(`ai.dailyCap.${p.id}`);
  }
  const bump = async (id: string) => {
    const k = `ai.quota:${id}:${today(now())}`;
    await db.kv.put({ key: k, value: (((await db.kv.get(k))?.value as number | undefined) ?? 0) + 1 });
  };

  async function viaProviders(pkg: GroundedPackage): Promise<Explanation | null> {
    for (const p of deps.providers) {
      if (!(await p.available()) || !(await underQuota(p))) continue;
      let note: string | undefined;
      for (let attempt = 0; attempt < cfg.get<number>('ai.maxAttempts'); attempt++) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), cfg.get<number>('ai.timeoutMs'));
        try {
          await bump(p.id);
          const text = await p.explainWithNote(pkg, note, ctl.signal);
          const v = verifyText(text, pkg);
          if (v.ok) {
            await stat((s) => void s.ai++);
            return { text, source: 'ai', verified: true };
          }
          note = v.problems.join('; ');
          await stat((s) => {
            s.rejected++;
            for (const r of v.problems)
              s.reasons[r.replace(/[a-h][1-8]|\d+/g, '#')] = (s.reasons[r.replace(/[a-h][1-8]|\d+/g, '#')] ?? 0) + 1;
          });
        } catch (e) {
          if (e instanceof AiFailure && e.reason === 'rate-limit') {
            const wait =
              (e.retryAfterSec ?? cfg.get<number>('ai.backoffMs') / 1000) * 1000 + Math.floor(Math.random() * 2000);
            await db.kv.put({ key: `ai.backoff:${p.id}`, value: now() + wait });
          }
          break; // provider failed: next provider, then the template
        } finally {
          clearTimeout(timer);
        }
      }
    }
    return null;
  }

  async function explain(pkg: GroundedPackage): Promise<ExplainResult> {
    const key = `ai.cache:${await sha256(JSON.stringify(pkg) + PROMPT_VERSION)}`;
    const hit = (await db.kv.get(key))?.value as Explanation | undefined;
    const tmpl: Explanation = { text: template.text(pkg, deps.motifOf?.(pkg)), source: 'template', verified: true };
    if (hit) return { now: hit, upgrade: Promise.resolve(null), cached: true };
    await stat((s) => void s.template++);
    const upgrade = viaProviders(pkg).then(async (r) => {
      if (r) await db.kv.put({ key, value: r });
      return r;
    });
    return { now: tmpl, upgrade, cached: false };
  }

  const stats = async () =>
    ((await db.kv.get('ai.stats'))?.value as AiStats | undefined) ?? { ai: 0, template: 0, rejected: 0, reasons: {} };
  return { explain, stats };
}
export type AiService = ReturnType<typeof createAiService>;
