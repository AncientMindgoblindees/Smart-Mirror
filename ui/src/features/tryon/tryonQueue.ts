import { generateTryOn, getTryOnGeneration } from '@/api/mirrorApi';
import { withApiTokenIfProtectedMedia } from '@/api/authMediaUrl';
import type { TryOnRequest } from '@/api/backendTypes';

const TRYON_POLL_INTERVAL_MS = 1500;
const TRYON_POLL_TIMEOUT_MS = 8 * 60 * 1000;
const MAX_PENDING = 10;

export type TryOnQueueJobState = 'pending' | 'running' | 'completed' | 'failed';

export type TryOnQueueJob = {
  id: string;
  payload: TryOnRequest;
  state: TryOnQueueJobState;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  generationId?: number;
  imageUrl?: string;
  error?: string;
};

export type TryOnQueueSnapshot = {
  jobs: TryOnQueueJob[];
  pendingCount: number;
  runningCount: number;
  completedCount: number;
  failedCount: number;
};

type QueueListener = (snapshot: TryOnQueueSnapshot) => void;

const listeners = new Set<QueueListener>();
let jobs: TryOnQueueJob[] = [];
let workerRunning = false;
let sequence = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function snapshot(): TryOnQueueSnapshot {
  return {
    jobs: jobs.slice(),
    pendingCount: jobs.filter((job) => job.state === 'pending').length,
    runningCount: jobs.filter((job) => job.state === 'running').length,
    completedCount: jobs.filter((job) => job.state === 'completed').length,
    failedCount: jobs.filter((job) => job.state === 'failed').length,
  };
}

function emit() {
  const next = snapshot();
  for (const listener of listeners) listener(next);
}

function nextPending(): TryOnQueueJob | undefined {
  return jobs.find((job) => job.state === 'pending');
}

function trimTerminalJobs() {
  const terminal = jobs.filter((job) => job.state === 'completed' || job.state === 'failed');
  if (terminal.length <= MAX_PENDING) return;
  const staleIds = new Set(terminal.slice(0, terminal.length - MAX_PENDING).map((job) => job.id));
  jobs = jobs.filter((job) => !staleIds.has(job.id));
}

async function runJob(job: TryOnQueueJob): Promise<void> {
  job.state = 'running';
  job.startedAt = Date.now();
  emit();
  try {
    const queued = await generateTryOn(job.payload);
    const pollStarted = performance.now();
    while (true) {
      if (performance.now() - pollStarted > TRYON_POLL_TIMEOUT_MS) {
        throw new Error('Try-on generation timed out');
      }
      const result = await getTryOnGeneration(queued.id);
      if (result.status === 'failed') {
        throw new Error(result.error_message ?? 'Try-on generation failed');
      }
      if (result.status === 'completed') {
        if (!result.result_image_url) {
          throw new Error('Try-on completed without an image URL');
        }
        const imageUrl = withApiTokenIfProtectedMedia(result.result_image_url);
        job.state = 'completed';
        job.completedAt = Date.now();
        job.generationId = result.id;
        job.imageUrl = imageUrl;
        window.dispatchEvent(
          new CustomEvent('mirror:tryon_result', {
            detail: { generation_id: String(result.id), image_url: imageUrl },
          }),
        );
        window.dispatchEvent(
          new CustomEvent('mirror:tryon_queue_update', {
            detail: { type: 'completed', queue_job_id: job.id, generation_id: String(result.id), image_url: imageUrl },
          }),
        );
        emit();
        trimTerminalJobs();
        emit();
        return;
      }
      await sleep(TRYON_POLL_INTERVAL_MS);
    }
  } catch (error: unknown) {
    job.state = 'failed';
    job.completedAt = Date.now();
    job.error = error instanceof Error ? error.message : 'Unknown queue error';
    window.dispatchEvent(
      new CustomEvent('mirror:tryon_queue_update', {
        detail: { type: 'failed', queue_job_id: job.id, error: job.error },
      }),
    );
    emit();
    trimTerminalJobs();
    emit();
  }
}

async function ensureWorker() {
  if (workerRunning) return;
  workerRunning = true;
  try {
    while (true) {
      const job = nextPending();
      if (!job) break;
      await runJob(job);
    }
  } finally {
    workerRunning = false;
  }
}

export function enqueueTryOnGeneration(payload: TryOnRequest): { ok: true; queueJobId: string; pendingCount: number } | { ok: false; reason: 'queue_full' } {
  const pending = jobs.filter((job) => job.state === 'pending').length;
  if (pending >= MAX_PENDING) return { ok: false, reason: 'queue_full' };
  sequence += 1;
  const queueJobId = `tryon-job-${Date.now()}-${sequence}`;
  jobs.push({
    id: queueJobId,
    payload,
    state: 'pending',
    createdAt: Date.now(),
  });
  emit();
  void ensureWorker();
  return { ok: true, queueJobId, pendingCount: pending + 1 };
}

export function subscribeTryOnQueue(listener: QueueListener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function getTryOnQueueSnapshot(): TryOnQueueSnapshot {
  return snapshot();
}

export async function __waitForQueueIdle(timeoutMs = 10000): Promise<void> {
  const started = Date.now();
  while (workerRunning || jobs.some((job) => job.state === 'pending' || job.state === 'running')) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('Timed out waiting for queue to become idle');
    }
    await sleep(25);
  }
}

export function __resetTryOnQueueForTests(): void {
  jobs = [];
  workerRunning = false;
  sequence = 0;
  listeners.clear();
}
