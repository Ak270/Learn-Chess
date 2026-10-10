import mistake from './mistake_explanation.txt?raw';

/** Versioned: the cache key includes this, so a prompt change never serves stale text. */
export const PROMPT_VERSION = 'v1';
export const systemPrompt = (maxWords: number) => mistake.replace('{maxWords}', String(maxWords));
