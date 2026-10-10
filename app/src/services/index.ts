// Registry wiring default implementations; tests inject fakes via `setServices`.
import type { AiProvider, EngineClient, Importer, Opponent } from '../types/services';

export interface Services {
  engine?: EngineClient;
  ai?: AiProvider;
  opponent?: Opponent;
  importers: Importer[];
}

let current: Services = { importers: [] };
export const getServices = (): Services => current;
export const setServices = (s: Partial<Services>): Services => (current = { ...current, ...s });
