// Lesson loader: authored JSON is bundled at build time (small; lazy chunk).
import type { Lesson } from './validate';

const mods = import.meta.glob('../../content/lessons/*.json', { eager: true, import: 'default' }) as Record<
  string,
  Lesson
>;
export const LESSONS: Lesson[] = Object.values(mods).sort((a, b) => a.phase - b.phase || a.id.localeCompare(b.id));
export const lessonById = (id: string) => LESSONS.find((l) => l.id === id);
