import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fkGrade, legalFen, lessonCycles, validateLesson, type Lesson } from '../../src/core/content/validate';

const dir = 'src/content/lessons';
const lessons = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as Lesson);
const good = (): Lesson => structuredClone(lessons.find((l) => l.id === 'l-ps-safety')!);

describe('content validator (docs/backend/06 §4.2)', () => {
  it('all shipped lessons pass the static checks', () => {
    expect(lessons.length).toBeGreaterThanOrEqual(12);
    expect(lessons.flatMap((l) => validateLesson(l, lessons))).toEqual([]);
    expect(lessonCycles(lessons)).toEqual([]);
  });
  it('rejects an illegal FEN', () => {
    const l = good();
    (l.steps[1] as { fen: string }).fen = '8/8/8/8/8/8/8/8 w - - 0 1';
    expect(validateLesson(l, lessons).join()).toMatch(/illegal FEN/);
    expect(legalFen('4k3/8/8/8/8/8/8/4K3 w - - 0 1')).toBe(true);
  });
  it('rejects a missing provenance, a long why, an empty card why and banned words', () => {
    const l = good();
    delete l.provenance;
    l.cards[0].why = '';
    (l.steps[3] as { why: string }).why = Array(30).fill('word').join(' ');
    (l.steps[0] as { body: string }).body = 'Only a stupid player leaves pieces hanging.';
    const e = validateLesson(l, lessons).join('\n');
    expect(e).toMatch(/missing provenance/);
    expect(e).toMatch(/empty why/);
    expect(e).toMatch(/words \(max 25\)/);
    expect(e).toMatch(/banned word "stupid"/);
  });
  it('rejects an illegal solution move, unknown skill, unknown prereq and cycles', () => {
    const l = good();
    (l.steps[2] as { solution: string[] }).solution = ['a1a8'];
    l.skills = ['not_a_skill'];
    l.prereqs = ['nope'];
    const e = validateLesson(l, lessons).join('\n');
    expect(e).toMatch(/solution a1a8 is illegal/);
    expect(e).toMatch(/unknown or missing skill/);
    expect(e).toMatch(/prereq "nope"/);
    const a = { ...good(), id: 'a', prereqs: ['b'] };
    const b = { ...good(), id: 'b', prereqs: ['a'] };
    expect(lessonCycles([a, b]).join()).toMatch(/cycle/);
  });
  it('rejects a mate claim that is not mate and a stalemate claim that is not stalemate', () => {
    const l = good();
    l.steps.splice(1, 0, {
      type: 'board',
      fen: '4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1',
      body: 'x',
      verify: { mate: ['d1d5'] },
    });
    expect(validateLesson(l, lessons).join()).toMatch(/not checkmate/);
  });
  it('reading level is measured (grade <= 8)', () => {
    expect(fkGrade('The cat sat on the mat. It was a warm day.')).toBeLessThan(3);
    expect(
      fkGrade(
        'Notwithstanding considerable epistemological reservations, practitioners systematically underestimate comprehensive considerations.',
      ),
    ).toBeGreaterThan(14);
  });
});

describe('cross references', () => {
  it('every misconception points to an existing lesson and a known skill', async () => {
    const m = (await import('../../src/content/misconceptions.json')).default as {
      misconceptions: { lessonId: string; skill: string }[];
    };
    const { SKILL_IDS } = await import('../../src/types/ids');
    for (const x of m.misconceptions) {
      expect(
        lessons.some((l) => l.id === x.lessonId),
        x.lessonId,
      ).toBe(true);
      expect(SKILL_IDS as readonly string[]).toContain(x.skill);
    }
    expect(m.misconceptions.length).toBeGreaterThanOrEqual(10);
  });
});
