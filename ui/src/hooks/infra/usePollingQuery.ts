import { useCallback, useEffect, useRef, useState } from 'react';

import { useIntervalWhen } from './useIntervalWhen';

type UsePollingQueryOpts<T> = {
  fetcher: () => Promise<T>;
  pollMs: number;
  enabled?: boolean;
  refreshEventName?: string;
  onData: (value: T) => void;
  onError?: (error: unknown) => void;
};

export function usePollingQuery<T>(opts: UsePollingQueryOpts<T>): { loading: boolean; refresh: () => void } {
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const fetcherRef = useRef(opts.fetcher);
  const onDataRef = useRef(opts.onData);
  const onErrorRef = useRef(opts.onError);
  fetcherRef.current = opts.fetcher;
  onDataRef.current = opts.onData;
  onErrorRef.current = opts.onError;

  const run = useCallback(async () => {
    try {
      const data = await fetcherRef.current();
      if (!mountedRef.current) return;
      onDataRef.current(data);
    } catch (e) {
      onErrorRef.current?.(e);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void run();
    return () => {
      mountedRef.current = false;
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
