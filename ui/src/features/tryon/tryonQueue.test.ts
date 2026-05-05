import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetTryOnQueueForTests, __waitForQueueIdle, enqueueTryOnGeneration, getTryOnQueueSnapshot, subscribeTryOnQueue } from './tryonQueue';

vi.mock('@/api/authMediaUrl', () => ({
  withApiTokenIfProtectedMedia: (url: string) => url,
}));

const generateTryOnMock = vi.fn();
const getTryOnGenerationMock = vi.fn();

vi.mock('@/api/mirrorApi', () => ({
  generateTryOn: (...args: unknown[]) => generateTryOnMock(...args),
  getTryOnGeneration: (...args: unknown[]) => getTryOnGenerationMock(...args),
}));

describe('tryonQueue', () => {
  beforeEach(() => {
    if (typeof CustomEvent === 'undefined') {
      class CustomEventPolyfill<T = unknown> extends Event {
        detail: T;
        constructor(type: string, params?: CustomEventInit<T>) {
          super(type, params);
          this.detail = (params?.detail as T) ?? (undefined as T);
        }
      }
      (globalThis as unknown as { CustomEvent: typeof CustomEventPolyfill }).CustomEvent = CustomEventPolyfill;
    }
    const events = new EventTarget();
    (globalThis as unknown as { window: Window & typeof globalThis }).window = {
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      dispatchEvent: events.dispatchEvent.bind(events),
    } as unknown as Window & typeof globalThis;
    __resetTryOnQueueForTests();
    generateTryOnMock.mockReset();
    getTryOnGenerationMock.mockReset();
  });

  afterEach(async () => {
    await __waitForQueueIdle().catch(() => {});
    __resetTryOnQueueForTests();
  });

  it('processes jobs in FIFO order', async () => {
    const seen: number[] = [];
    generateTryOnMock.mockImplementation(async (payload: { person_image_id: number }) => {
      seen.push(payload.person_image_id);
      return { id: payload.person_image_id };
    });
    getTryOnGenerationMock.mockImplementation(async (id: number) => ({
      id,
      status: 'completed',
      result_image_url: `https://img/${id}.jpg`,
    }));

    enqueueTryOnGeneration({ person_image_id: 1 });
    enqueueTryOnGeneration({ person_image_id: 2 });
    enqueueTryOnGeneration({ person_image_id: 3 });
    await __waitForQueueIdle();

    expect(seen).toEqual([1, 2, 3]);
    expect(getTryOnQueueSnapshot().completedCount).toBe(3);
  });

  it('enforces max pending size of 10', () => {
    generateTryOnMock.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { id: 1 };
    });
    getTryOnGenerationMock.mockResolvedValue({
      id: 1,
      status: 'completed',
      result_image_url: 'https://img/ok.jpg',
    });

    const accepted: boolean[] = [];
    for (let i = 0; i < 12; i += 1) {
      accepted.push(enqueueTryOnGeneration({ person_image_id: i + 1 }).ok);
    }
    expect(accepted.filter(Boolean).length).toBe(11);
    expect(accepted.filter((v) => !v).length).toBe(1);
  });

  it('continues processing after a failed job', async () => {
    let call = 0;
    generateTryOnMock.mockImplementation(async (payload: { person_image_id: number }) => ({ id: payload.person_image_id }));
    getTryOnGenerationMock.mockImplementation(async (id: number) => {
      call += 1;
      if (id === 1) {
        return { id, status: 'failed', error_message: 'failed' };
      }
      return { id, status: 'completed', result_image_url: `https://img/${id}.jpg` };
    });

    enqueueTryOnGeneration({ person_image_id: 1 });
    enqueueTryOnGeneration({ person_image_id: 2 });
    await __waitForQueueIdle();

    const snapshot = getTryOnQueueSnapshot();
    expect(snapshot.failedCount).toBe(1);
    expect(snapshot.completedCount).toBe(1);
    expect(call).toBeGreaterThanOrEqual(2);
  });

  it('publishes state updates to subscribers', async () => {
    generateTryOnMock.mockResolvedValue({ id: 88 });
    getTryOnGenerationMock.mockResolvedValue({
      id: 88,
      status: 'completed',
      result_image_url: 'https://img/88.jpg',
    });
    const pendingCounts: number[] = [];
    const unsub = subscribeTryOnQueue((snapshot) => {
      pendingCounts.push(snapshot.pendingCount);
    });

    enqueueTryOnGeneration({ person_image_id: 88 });
    await __waitForQueueIdle();
    unsub();

    expect(pendingCounts.some((count) => count > 0)).toBe(true);
    expect(pendingCounts[pendingCounts.length - 1]).toBe(0);
  });

  it('emits tryon_result event on completion', async () => {
    generateTryOnMock.mockResolvedValue({ id: 21 });
    getTryOnGenerationMock.mockResolvedValue({
      id: 21,
      status: 'completed',
      result_image_url: 'https://img/21.jpg',
    });
    const handler = vi.fn();
    window.addEventListener('mirror:tryon_result', handler);

    enqueueTryOnGeneration({ person_image_id: 21 });
    await __waitForQueueIdle();
    window.removeEventListener('mirror:tryon_result', handler);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not run two workers concurrently under rapid enqueue', async () => {
    const inFlight: number[] = [];
    let maxInFlight = 0;
    generateTryOnMock.mockImplementation(async (payload: { person_image_id: number }) => {
      inFlight.push(payload.person_image_id);
      maxInFlight = Math.max(maxInFlight, inFlight.length);
      await new Promise((resolve) => setTimeout(resolve, 30));
      inFlight.shift();
      return { id: payload.person_image_id };
    });
    getTryOnGenerationMock.mockImplementation(async (id: number) => ({
      id,
      status: 'completed',
      result_image_url: `https://img/${id}.jpg`,
    }));

    for (let i = 0; i < 6; i += 1) {
      enqueueTryOnGeneration({ person_image_id: i + 1 });
    }
    await __waitForQueueIdle();
    expect(maxInFlight).toBe(1);
  });
});
