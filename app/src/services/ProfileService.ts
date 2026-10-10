import type { MentorDB } from '../data/db';
import type { Profile } from '../types/model';
import { cfg } from '../config';

export function createProfileService(db: MentorDB, now: () => number = Date.now) {
  const defaults = (): Profile => ({
    id: 'me',
    createdAt: now(),
    displayName: 'Learner',
    platformAccounts: {},
    dailyMinutes: cfg.get('settings.defaults.dailyMinutes'),
    restDay: cfg.get<number>('settings.defaults.restDay') as Profile['restDay'],
    goalRating: cfg.get('settings.defaults.goalRating'),
    settingsVersion: 1,
  });
  return {
    async get(): Promise<Profile | undefined> {
      return db.profile.get('me');
    },
    async getOrCreate(): Promise<Profile> {
      return (await db.profile.get('me')) ?? (await this.save(defaults()));
    },
    async save(p: Profile): Promise<Profile> {
      await db.profile.put(p);
      return p;
    },
    async update(patch: Partial<Profile>): Promise<Profile> {
      const cur = await this.getOrCreate();
      return this.save({
        ...cur,
        ...patch,
        platformAccounts: { ...cur.platformAccounts, ...(patch.platformAccounts ?? {}) },
      });
    },
    async onboardingDone(): Promise<boolean> {
      return !!(await db.kv.get('onboarding.done'));
    },
    async markOnboardingDone() {
      await db.kv.put({ key: 'onboarding.done', value: now() });
    },
  };
}
export type ProfileService = ReturnType<typeof createProfileService>;
