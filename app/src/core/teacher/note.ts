// Teacher note facts (docs/backend/05 §12). Structured facts first; the template fallback always exists, Phase 7 may reword.
import type { SkillId } from '../../types/ids';
import { skillTitle } from '../planner/plan';

export interface Fact {
  text: string;
}
export interface TeacherNoteFacts {
  wentWell: Fact[];
  fixThis: Fact;
  tomorrow: Fact;
}
export interface DayStats {
  testRight: number;
  testTotal: number;
  cardsClean: number;
  cardsTotal: number;
  drillsRight: number;
  drillsTotal: number;
  wrongSure: number;
  focus: SkillId;
  weakest?: { skill: SkillId; right: number; total: number };
  nextFocus: SkillId;
  streak?: number;
}

export function noteFacts(s: DayStats): TeacherNoteFacts {
  const well: Fact[] = [];
  if (s.drillsTotal && s.drillsRight / s.drillsTotal >= 0.6)
    well.push({ text: `${skillTitle(s.focus).toLowerCase()} drills: ${s.drillsRight} of ${s.drillsTotal} right` });
  if (s.cardsTotal && s.cardsClean)
    well.push({ text: `${s.cardsClean} of ${s.cardsTotal} Blunder Box cards solved cleanly` });
  if (s.testTotal && s.testRight / s.testTotal >= 0.6)
    well.push({ text: `${s.testRight} of ${s.testTotal} test answers right` });
  if (!well.length) well.push({ text: 'you showed up and did the work' });
  const fix: Fact =
    s.wrongSure > 0
      ? {
          text: `${s.wrongSure} answer${s.wrongSure > 1 ? 's' : ''} felt sure but missed, so tomorrow starts with a short look at why`,
        }
      : s.weakest
        ? {
            text: `${skillTitle(s.weakest.skill).toLowerCase()} was the shakiest today (${s.weakest.right} of ${s.weakest.total})`,
          }
        : { text: `keep asking what they can take before every move` };
  return {
    wentWell: well.slice(0, 2),
    fixThis: fix,
    tomorrow: { text: `tomorrow's focus: ${skillTitle(s.nextFocus).toLowerCase()}` },
  };
}

/** Three-line template (no AI). */
export function noteTemplate(f: TeacherNoteFacts): string[] {
  return [
    `Went well: ${f.wentWell.map((x) => x.text).join('; ')}.`,
    `Worth fixing: ${f.fixThis.text}.`,
    `Next: ${f.tomorrow.text}.`,
  ];
}
