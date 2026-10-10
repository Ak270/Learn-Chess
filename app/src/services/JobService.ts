// Long jobs (import + review) with progress and cancel, shown as a chip in the nav (docs/backend/08 §5).
import { emit, on } from '../data/bus';

export interface Job {
  id: string;
  label: string;
  stage: string;
  done: number;
  total: number;
  state: 'running' | 'done' | 'failed' | 'cancelled';
  error?: string;
  link?: string;
  cancel(): void;
}
const jobs = new Map<string, Job>();

export function startJob(
  label: string,
  link: string,
  work: (ctl: {
    signal: { cancelled: boolean };
    update(p: Partial<Pick<Job, 'stage' | 'done' | 'total'>>): void;
  }) => Promise<void>,
): Job {
  const signal = { cancelled: false };
  const job: Job = {
    id: `${Date.now()}-${jobs.size}`,
    label,
    stage: 'starting',
    done: 0,
    total: 0,
    state: 'running',
    link,
    cancel: () => (signal.cancelled = true),
  };
  jobs.set(job.id, job);
  emit('job:update', job);
  work({
    signal,
    update: (p) => {
      Object.assign(job, p);
      emit('job:update', job);
    },
  })
    .then(() => {
      job.state = signal.cancelled ? 'cancelled' : 'done';
    })
    .catch((e: unknown) => {
      job.state = 'failed';
      job.error = e instanceof Error ? e.message : String(e);
    })
    .finally(() => emit('job:update', job));
  return job;
}
export const activeJobs = () => [...jobs.values()].filter((j) => j.state === 'running');
export const latestJob = () => [...jobs.values()].at(-1);
export const onJobUpdate = (f: (j: Job) => void) => on('job:update', (j) => f(j as Job));
