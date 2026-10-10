// rebuildDerived(): attempts -> evidence -> skills (docs/backend/02 §5). Evidence ids are deterministic
// (derived from the attempt id + skill) so rebuilding twice yields identical rows.
import type { MentorDB } from './db';
import { evidenceFromAttempt, skillStatesFromEvidence } from '../core/skills/derive';
import type { SkillEvidence } from '../types/model';

export async function rebuildDerived(db: MentorDB) {
  await db.transaction('rw', db.attempts, db.evidence, db.skills, async () => {
    const attempts = await db.attempts.orderBy('at').toArray();
    const keep = (await db.evidence.toArray()).filter((e) => !e.sourceRef.attemptId); // evidence from games/mistakes is not derivable from attempts
    const fromAttempts: SkillEvidence[] = attempts.flatMap((a) =>
      evidenceFromAttempt(a).map((e) => ({ ...e, id: `${a.id}:${e.skill}`, sourceRef: { attemptId: a.id } })),
    );
    await db.evidence.clear();
    await db.evidence.bulkAdd([...keep, ...fromAttempts]);
    await db.skills.clear();
    await db.skills.bulkAdd(skillStatesFromEvidence([...keep, ...fromAttempts]));
  });
}
