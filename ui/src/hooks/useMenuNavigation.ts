import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type UseMenuNavigationOptions = {
  actionIds: string[];
  onAction: (actionId: string) => void;
};

type UseMenuNavigationResult = {
  isOpen: boolean;
  activeIndex: number;
  open: () => void;
  close: () => void;
  selectCurrent: () => void;
};

export function useMenuNavigation(options: UseMenuNavigationOptions): UseMenuNavigationResult {
  const { actionIds, onAction } = options;
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  const actionIdsRef = useRef(actionIds);
  actionIdsRef.current = actionIds;

  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  const itemCount = useMemo(() => actionIds.length, [actionIds.length]);

  useEffect(() => {
    if (itemCount === 0) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex((prev) => Math.min(prev, itemCount - 1));
  }, [itemCount]);

  const open = useCallback(() => {
    if (itemCount <= 0) return;
    setActiveIndex(0);
    setIsOpen(true);
  }, [itemCount]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const selectCurrent = useCallback(() => {
    if (!isOpenRef.current) return;
    const currentAction = actionIdsRef.current[activeIndexRef.current];
    if (!currentAction) return;
    onActionRef.current(currentAction);
  }, []);

  const move = useCallback((dir: -1 | 1) => {
    if (itemCount <= 0) return;
    setActiveIndex((prev) => {
      if (dir === -1) {
        return prev <= 0 ? itemCount - 1 : prev - 1;
      }
      return prev >= itemCount - 1 ? 0 : prev + 1;
    });
  }, [itemCount]);

  useEffect(() => {
    // TODO: Replace keyboard listeners with GPIO input.
    const onKeyDown = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return;

      if (!isOpenRef.current) {
        if (event.key === 'Enter') {
          event.preventDefault();
          open();
        }
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }

      if (event.key === 'ArrowUp') {
        move(-1);
        return;
      }
      if (event.key === 'ArrowDown') {
        move(1);
        return;
      }
      if (event.key === 'Enter') {
        selectCurrent();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [move, open, selectCurrent]);

  return {
    isOpen,
    activeIndex,
    open,
    close,
    selectCurrent,
  };
}
