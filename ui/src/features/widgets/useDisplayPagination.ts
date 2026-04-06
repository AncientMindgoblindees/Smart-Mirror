import { useEffect, useMemo, useState } from 'react';

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function computeDisplayScale(widthPct: number, heightPct: number): number {
  const area = Math.max(1, widthPct * heightPct);
  const base = 28 * 20;
  const scale = Math.sqrt(area / base);
  return clamp(scale, 0.72, 1.35);
}

export function estimatePageSize(widthPct: number, heightPct: number): number {
  const area = Math.max(1, widthPct * heightPct);
  if (area < 260) return 2;
  if (area < 430) return 3;
  if (area < 620) return 4;
  return 5;
}

export function useDisplayPagination<T>(
  items: T[],
  pageSize: number,
  intervalMs = 8000
): {
  pageItems: T[];
  pageIndex: number;
  pageCount: number;
} {
  const safePageSize = Math.max(1, pageSize);
  const pages = useMemo(() => {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += safePageSize) {
      out.push(items.slice(i, i + safePageSize));
    }
    return out.length > 0 ? out : [[]];
  }, [items, safePageSize]);
  const [pageIndex, setPageIndex] = useState(0);
  const pageCount = pages.length;

  useEffect(() => {
    setPageIndex(0);
  }, [pageCount]);

  useEffect(() => {
    if (pageCount <= 1) return;
    const id = window.setInterval(() => {
      setPageIndex((prev) => (prev + 1) % pageCount);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [pageCount, intervalMs]);

  return {
    pageItems: pages[pageIndex] ?? [],
    pageIndex,
    pageCount,
  };
}
