import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type MenuNavigationLayer =
  | 'main'
  | 'widget_list'
  | 'parameter_editor'
  | 'randomize_panel'
  | 'theme_panel'
  | 'theme_widget_list'
  | 'theme_background_list';

type UseMenuNavigationOptions = {
  getActionIds: (layer: MenuNavigationLayer) => string[];
  onAction: (actionId: string, layer: MenuNavigationLayer) => void;
  initialLayer?: MenuNavigationLayer;
};

type UseMenuNavigationResult = {
  isOpen: boolean;
  layer: MenuNavigationLayer;
  activeIndex: number;
  setLayer: (layer: MenuNavigationLayer, options?: { resetIndex?: boolean }) => void;
  open: () => void;
  close: () => void;
  selectCurrent: () => void;
};

export function useMenuNavigation(options: UseMenuNavigationOptions): UseMenuNavigationResult {
  const { getActionIds, onAction, initialLayer = 'main' } = options;
  const [isOpen, setIsOpen] = useState(false);
  const [layer, setLayerState] = useState<MenuNavigationLayer>(initialLayer);
  const [activeByLayer, setActiveByLayer] = useState<Record<MenuNavigationLayer, number>>({
    main: 0,
    widget_list: 0,
    parameter_editor: 0,
    randomize_panel: 0,
    theme_panel: 0,
    theme_widget_list: 0,
    theme_background_list: 0,
  });
  const activeIndex = activeByLayer[layer] ?? 0;

  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  const getActionIdsRef = useRef(getActionIds);
  getActionIdsRef.current = getActionIds;

  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const layerRef = useRef(layer);
  layerRef.current = layer;

  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  const actionIds = useMemo(() => getActionIds(layer), [getActionIds, layer]);
  const itemCount = actionIds.length;

  useEffect(() => {
    if (itemCount === 0) {
      setActiveByLayer((prev) => ({ ...prev, [layer]: 0 }));
      return;
    }
    setActiveByLayer((prev) => ({
      ...prev,
      [layer]: Math.min(prev[layer] ?? 0, itemCount - 1),
    }));
  }, [itemCount, layer]);

  const setLayer = useCallback(
    (nextLayer: MenuNavigationLayer, options?: { resetIndex?: boolean }) => {
      setLayerState(nextLayer);
      if (options?.resetIndex) {
        setActiveByLayer((prev) => ({ ...prev, [nextLayer]: 0 }));
      }
    },
    [],
  );

  const open = useCallback(() => {
    const mainItems = getActionIdsRef.current('main');
    if (mainItems.length <= 0) return;
    setLayerState('main');
    setActiveByLayer((prev) => ({ ...prev, main: 0 }));
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setLayerState(initialLayer);
  }, [initialLayer]);

  const move = useCallback((dir: -1 | 1) => {
    const currentLayer = layerRef.current;
    const count = getActionIdsRef.current(currentLayer).length;
    if (count <= 0) return;
    setActiveByLayer((prev) => {
      const current = prev[currentLayer] ?? 0;
      if (dir === -1) {
        return { ...prev, [currentLayer]: current <= 0 ? count - 1 : current - 1 };
      }
      return { ...prev, [currentLayer]: current >= count - 1 ? 0 : current + 1 };
    });
  }, []);

  const selectCurrent = useCallback(() => {
    if (!isOpenRef.current) return;
    const currentLayer = layerRef.current;
    const items = getActionIdsRef.current(currentLayer);
    const currentAction = items[activeIndexRef.current];
    if (!currentAction) return;
    onActionRef.current(currentAction, currentLayer);
  }, []);

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
    layer,
    activeIndex,
    setLayer,
    open,
    close,
    selectCurrent,
  };
}
