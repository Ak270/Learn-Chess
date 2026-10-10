import { cfg } from '../../config';
import type { MotifHit } from '../../types/model';

/** motif -> SkillId (config/skillmap.json). Unknown motifs map to nothing. */
export function skillForMotif(id: string): string | undefined {
  try {
    return cfg.get<string>(id);
  } catch {
    return undefined;
  }
}
export const skillTagsFor = (hits: MotifHit[]): string[] => [
  ...new Set(hits.map((h) => skillForMotif(h.id)).filter((x): x is string => !!x)),
];
