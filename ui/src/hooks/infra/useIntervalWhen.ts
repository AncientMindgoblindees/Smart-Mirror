import { useEffect, useRef } from 'react';

export function useIntervalWhen(fn: () => void, ms: number, enabled: boolean): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => fnRef.current(), ms);
    return () => window.clearInterval(id);
  }, [ms, enabled]);
}
