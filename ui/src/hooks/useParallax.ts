import { useState, useEffect, useCallback, useRef } from 'react';

interface ParallaxOffset {
  x: number;
  y: number;
}

const SPRING_FACTOR = 0.08;
const MAX_OFFSET = 12;
const MIN_DELTA_TO_RENDER = 0.2;

export function useParallax(enabled = true): ParallaxOffset {
  const [offset, setOffset] = useState<ParallaxOffset>({ x: 0, y: 0 });
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(0);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const nx = (e.clientX / window.innerWidth - 0.5) * 2;
    const ny = (e.clientY / window.innerHeight - 0.5) * 2;
    targetRef.current = {
      x: nx * MAX_OFFSET,
      y: ny * MAX_OFFSET,
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const animate = () => {
      const cur = currentRef.current;
      const tgt = targetRef.current;
      cur.x += (tgt.x - cur.x) * SPRING_FACTOR;
      cur.y += (tgt.y - cur.y) * SPRING_FACTOR;

      if (Math.abs(cur.x - tgt.x) > MIN_DELTA_TO_RENDER || Math.abs(cur.y - tgt.y) > MIN_DELTA_TO_RENDER) {
        setOffset({ x: cur.x, y: cur.y });
      }
      rafRef.current = requestAnimationFrame(animate);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, onPointerMove]);

  return offset;
}
