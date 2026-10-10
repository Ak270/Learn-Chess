// Tiny event bus (docs/backend/01 §5).
type Handler = (payload: unknown) => void;
const handlers = new Map<string, Set<Handler>>();
export const on = (event: string, h: Handler) => {
  (handlers.get(event) ?? handlers.set(event, new Set()).get(event)!).add(h);
  return () => handlers.get(event)?.delete(h);
};
export const emit = (event: string, payload?: unknown) => handlers.get(event)?.forEach((h) => h(payload));
