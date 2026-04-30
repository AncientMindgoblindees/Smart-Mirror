import { useEffect, useRef } from 'react';

export function useWindowEvent<T = unknown>(eventName: string, handler: (payload: T) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const wrapped = (e: Event) => {
      const ce = e as CustomEvent<T>;
      handlerRef.current(ce.detail);
    };
    window.addEventListener(eventName, wrapped);
    return () => window.removeEventListener(eventName, wrapped);
  }, [eventName]);
}
