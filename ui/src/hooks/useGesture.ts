import { useRef, useCallback } from 'react';

interface GestureCallbacks {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onTap?: () => void;
  onLongPress?: () => void;
}

interface GestureHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: () => void;
}

const SWIPE_THRESHOLD = 50;
const LONG_PRESS_MS = 500;

export function useGesture(callbacks: GestureCallbacks): GestureHandlers {
  const startRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    startRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    clearLongPress();
    if (callbacks.onLongPress) {
      longPressTimerRef.current = setTimeout(() => {
        callbacks.onLongPress?.();
        startRef.current = null;
      }, LONG_PRESS_MS);
    }
  }, [callbacks]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    clearLongPress();
    const start = startRef.current;
    if (!start) return;
    startRef.current = null;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx < SWIPE_THRESHOLD && absDy < SWIPE_THRESHOLD) {
      callbacks.onTap?.();
      return;
    }

    if (absDx > absDy) {
      if (dx > 0) callbacks.onSwipeRight?.();
      else callbacks.onSwipeLeft?.();
    } else {
      if (dy > 0) callbacks.onSwipeDown?.();
      else callbacks.onSwipeUp?.();
    }
  }, [callbacks]);

  const onPointerCancel = useCallback(() => {
    clearLongPress();
    startRef.current = null;
  }, []);

  return { onPointerDown, onPointerUp, onPointerCancel };
}
