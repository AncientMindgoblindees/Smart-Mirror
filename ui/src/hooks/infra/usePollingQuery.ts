import { useCallback, useEffect, useRef, useState } from 'react';

import { useIntervalWhen } from './useIntervalWhen';

type UsePollingQueryOpts<T> = {
  fetcher: (signal: AbortSignal) => Promise<T>;
  pollMs: number;
  enabled?: boolean;
  refreshEventName?: string;
  onData: (value: T) => void;
  onError?: (error: unknown) => void;
};

export function usePollingQuery<T>(opts: UsePollingQueryOpts<T>): { loading: boolean; refresh: () => void } {
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const enabledRef = useRef(opts.enabled !== false);
  const fetcherRef = useRef(opts.fetcher);
  const onDataRef = useRef(opts.onData);
  const onErrorRef = useRef(opts.onError);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  fetcherRef.current = opts.fetcher;
  onDataRef.current = opts.onData;
  onErrorRef.current = opts.onError;
  enabledRef.current = opts.enabled !== false;

  const run = useCallback(async () => {
    if (!enabledRef.current) return;
    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    inFlightRef.current = true;

    try {
      const data = await fetcherRef.current(controller.signal);
      if (!mountedRef.current) return;
      onDataRef.current(data);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        onErrorRef.current?.(e);
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      inFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
      if (queuedRef.current && enabledRef.current) {
        queuedRef.current = false;
        void run();
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    void run();
    return () => {
      mountedRef.current = false;
      queuedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [run]);

  useIntervalWhen(() => void run(), opts.pollMs, opts.enabled !== false);

  useEffect(() => {
    const eventName = opts.refreshEventName;
    if (!eventName) return;
    const handler = () => void run();
    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  }, [opts.refreshEventName, run]);

  return { loading, refresh: () => void run() };
}
