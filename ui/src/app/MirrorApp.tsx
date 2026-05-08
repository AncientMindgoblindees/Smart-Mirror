import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Moon, Palette, Power, QrCode, Shirt, Shuffle, SlidersHorizontal, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  getUserSettings,
  requestPowerOff,
  putUserSettings,
} from '@/api/mirrorApi';
import type { UserSettingsOut } from '@/api/backendTypes';
import { applyUserSettings } from '@/userSettings';
import {
  WidgetFrame,
  useWidgetPersistence,
  type WidgetConfig,
} from '@/features/widgets';
import {
  DeviceConnectionOverlay,
  useDeviceConnectionState,
} from '@/features/connection';
import { AuthQROverlay, useAuthState } from '@/features/auth';
import { useControlEvents } from '@/hooks/useControlEvents';
import { useMirrorInput } from '@/hooks/useMirrorInput';
import { useMenuNavigation, type MenuNavigationLayer } from '@/hooks/useMenuNavigation';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';
import { useParallax } from '@/hooks/useParallax';
import { shouldUsePerformanceLiteMode } from './performanceMode';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { MenuOverlay, type MenuMainItem, type MenuOverlayItem, type MenuPreviewState } from '@/components/MenuOverlay';
import { useMirrorDisplayMode } from './hooks/useMirrorDisplayMode';
import { useAuthActions } from './hooks/useAuthActions';
import {
  cycleWidgetParameter,
  formatWidgetParameterValue,
  getWidgetDisplayName,
  getWidgetParametersForType,
  readWidgetParameterValue,
} from '@/config/widgetParameters';
import {
  WIDGET_THEME_PRESETS,
  BACKGROUND_THEME_PRESETS,
  parseThemeSelection,
  serializeThemeSelection,
  getWidgetThemePreset,
  getBackgroundThemePreset,
} from '@/config/themePresets';
import { randomizeWidgetsOnGrid } from '@/utils/widgetGrid';
import './mirror-app.css';

const THEME_CACHE_SESSION_KEY = 'mirror:theme-selection:session';

function readThemeSessionCache(): { widgetTheme: string; backgroundTheme: string } | null {
  try {
    const raw = sessionStorage.getItem(THEME_CACHE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { widgetTheme?: string; backgroundTheme?: string };
    if (!parsed.widgetTheme || !parsed.backgroundTheme) return null;
    return { widgetTheme: parsed.widgetTheme, backgroundTheme: parsed.backgroundTheme };
  } catch {
    return null;
  }
}

function writeThemeSessionCache(widgetTheme: string, backgroundTheme: string): void {
  try {
    sessionStorage.setItem(THEME_CACHE_SESSION_KEY, JSON.stringify({ widgetTheme, backgroundTheme }));
  } catch {
    /* ignore */
  }
}

function withPreviewMockData(widget: WidgetConfig): WidgetConfig {
  const mockByType: Partial<WidgetConfig> = {
    title: widget.title ?? 'Preview Widget',
    text: widget.text ?? 'Sample preview content',
    location: widget.location ?? 'Chicago',
    unit: widget.unit ?? 'imperial',
    format: widget.format ?? '12h',
    timeFormat: widget.timeFormat ?? '12h',
    view: widget.view ?? 'week',
    mode: widget.mode ?? 'unread_or_high',
  };
  return {
    ...widget,
    ...mockByType,
    freeform: {
      ...widget.freeform,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    },
  };
}

const MENU_ITEMS: MenuMainItem[] = [
  { id: 'outfit_try_on', label: 'Virtual Try-On / Camera', icon: Shirt },
  { id: 'randomize_widgets', label: 'Randomize Widgets', icon: Shuffle },
  { id: 'widget_settings', label: 'Widget Settings', icon: SlidersHorizontal },
  { id: 'change_theme', label: 'Theme Styles', icon: Palette },
  { id: 'link_google_qr', label: 'Link Google (QR)', icon: QrCode },
  { id: 'unlink_google', label: 'Unlink Google', icon: QrCode },
  { id: 'sleep', label: 'Sleep', icon: Moon },
  { id: 'power_down', label: 'Power Down', icon: Power },
  { id: 'exit', label: 'Exit', icon: X },
];
const MENU_ACTION_IDS = MENU_ITEMS.map((item) => item.id);
const WIDGET_LIST_BACK_ID = 'widget_list:back';
const WIDGET_LIST_EXIT_ID = 'widget_list:exit';
const PARAM_BACK_ID = 'parameter_editor:back';
const PARAM_EXIT_ID = 'parameter_editor:exit';
const RANDOMIZE_APPLY_ID = 'randomize_panel:apply';
const RANDOMIZE_BACK_ID = 'randomize_panel:back';
const RANDOMIZE_EXIT_ID = 'randomize_panel:exit';
const THEME_WIDGET_SELECTOR_ID = 'theme_panel:widget';
const THEME_BACKGROUND_SELECTOR_ID = 'theme_panel:background';
const THEME_BACK_ID = 'theme_panel:back';
const THEME_EXIT_ID = 'theme_panel:exit';
const THEME_WIDGET_BACK_ID = 'theme_widget_list:back';
const THEME_WIDGET_EXIT_ID = 'theme_widget_list:exit';
const THEME_BACKGROUND_BACK_ID = 'theme_background_list:back';
const THEME_BACKGROUND_EXIT_ID = 'theme_background_list:exit';

export default function MirrorApp() {
  const navigate = useNavigate();
  const enterSleep = useCallback(() => {
    navigate('/sleep');
  }, [navigate]);
  const { widgets, setWidgets } = useWidgetPersistence();
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const [pendingWidgetDraft, setPendingWidgetDraft] = useState<WidgetConfig | null>(null);
  const [selectedWidgetThemeId, setSelectedWidgetThemeId] = useState<string>('glass-cyan');
  const [selectedBackgroundThemeId, setSelectedBackgroundThemeId] = useState<string>('noir');

  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  const { toggleDim } = useMirrorDisplayMode();

  const {
    connectionState,
    handlers: deviceHandlers,
    retry: retryConnection,
  } = useDeviceConnectionState();

  const {
    providers: authProviders,
    pendingAuth,
    initiateLogin,
    cancelPendingAuth,
    disconnectProvider,
    refresh: refreshAuth,
  } = useAuthState();
  const {
    authError,
    setAuthError,
    signInGoogle,
    disconnectGoogle,
  } = useAuthActions(initiateLogin, disconnectProvider);

  useTimeOfDay();
  const performanceLiteMode = useMemo(
    () =>
      shouldUsePerformanceLiteMode({
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
      }),
    [],
  );
  const parallax = useParallax(!performanceLiteMode);
  const logMenu = useCallback(
    (
      event: string,
      details?: Record<string, unknown> | string,
      level: 'info' | 'warn' | 'error' = 'info',
    ) => {
      const payload = {
        at: new Date().toISOString(),
        event,
        ...(typeof details === 'string' ? { message: details } : details ?? {}),
      };
      const out = `[mirror-menu] ${payload.event}`;
      if (level === 'warn') {
        console.warn(out, payload);
        return;
      }
      if (level === 'error') {
        console.error(out, payload);
        return;
      }
      console.info(out, payload);
    },
    [],
  );
  const applySyncedUserSettings = useCallback((settings: UserSettingsOut) => {
    applyUserSettings(settings);
    const parsed = parseThemeSelection(settings.theme);
    setSelectedWidgetThemeId(parsed.widgetTheme);
    setSelectedBackgroundThemeId(parsed.backgroundTheme);
    writeThemeSessionCache(parsed.widgetTheme, parsed.backgroundTheme);
  }, []);

  useEffect(() => {
    const cachedTheme = readThemeSessionCache();
    if (cachedTheme) {
      setSelectedWidgetThemeId(cachedTheme.widgetTheme);
      setSelectedBackgroundThemeId(cachedTheme.backgroundTheme);
    }
    void getUserSettings()
      .then(applySyncedUserSettings)
      .catch(() => {
        if (!cachedTheme) {
          setSelectedWidgetThemeId('glass-cyan');
          setSelectedBackgroundThemeId('noir');
        }
      });
  }, [applySyncedUserSettings]);
  const randomizeWidgets = useCallback(() => {
    let summary:
      | {
          totalWidgets: number;
          randomPlacements: number;
          fallbackPlacements: number;
          resizedPlacements: number;
          totalAttempts: number;
        }
      | null = null;
    setWidgets((prev) => {
      const out = randomizeWidgetsOnGrid(prev, { rows: 12, cols: 12 });
      summary = out.summary;
      return out.widgets;
    });
    if (summary) {
      logMenu('widgets_randomized', summary);
    }
  }, [logMenu, setWidgets]);
  const activeWidgets = useMemo(
    () => widgets.filter((widget) => widget.enabled),
    [widgets],
  );
  const widgetListItems = useMemo<MenuOverlayItem[]>(
    () => [
      ...widgets.map((widget) => ({
        id: `widget_list:${widget.id}`,
        label: getWidgetDisplayName(widget.type),
        hint: widget.enabled ? 'Visible' : 'Hidden',
      })),
      { id: WIDGET_LIST_BACK_ID, label: 'Back', kind: 'back' },
      { id: WIDGET_LIST_EXIT_ID, label: 'Exit' },
    ],
    [widgets],
  );
  const editingWidget = useMemo(() => {
    if (!editingWidgetId) return null;
    if (pendingWidgetDraft?.id === editingWidgetId) return pendingWidgetDraft;
    return widgets.find((widget) => widget.id === editingWidgetId) ?? null;
  }, [editingWidgetId, pendingWidgetDraft, widgets]);
  const editingDefinition = useMemo(
    () => (editingWidget ? getWidgetParametersForType(editingWidget.type) : null),
    [editingWidget],
  );
  const parameterEditorItems = useMemo<MenuOverlayItem[]>(() => {
    if (!editingDefinition) {
      return [
        { id: PARAM_BACK_ID, label: 'Back', kind: 'back' },
        { id: PARAM_EXIT_ID, label: 'Exit' },
      ];
    }
    const options = editingDefinition.parameters.map((parameter) => {
      const currentValue = editingWidget
        ? readWidgetParameterValue(editingWidget, parameter.key)
        : parameter.options[0]?.value ?? '';
      return {
        id: `parameter_editor:${parameter.key}`,
        label: parameter.name,
        hint: formatWidgetParameterValue(parameter, currentValue),
      };
    });
    return [
      ...options,
      { id: PARAM_BACK_ID, label: 'Back', kind: 'back' },
      { id: PARAM_EXIT_ID, label: 'Exit' },
    ];
  }, [editingDefinition, editingWidget]);
  const randomizePanelItems = useMemo<MenuOverlayItem[]>(
    () => [
      { id: RANDOMIZE_APPLY_ID, label: 'Randomize' },
      { id: RANDOMIZE_BACK_ID, label: 'Back', kind: 'back' },
      { id: RANDOMIZE_EXIT_ID, label: 'Exit' },
    ],
    [],
  );
  const themePanelItems = useMemo<MenuOverlayItem[]>(
    () => [
      { id: THEME_WIDGET_SELECTOR_ID, label: 'Widget Themes', hint: getWidgetThemePreset(selectedWidgetThemeId).label },
      { id: THEME_BACKGROUND_SELECTOR_ID, label: 'Background Themes', hint: getBackgroundThemePreset(selectedBackgroundThemeId).label },
      { id: THEME_BACK_ID, label: 'Back', kind: 'back' },
      { id: THEME_EXIT_ID, label: 'Exit' },
    ],
    [selectedBackgroundThemeId, selectedWidgetThemeId],
  );
  const themeWidgetItems = useMemo<MenuOverlayItem[]>(
    () => [
      ...WIDGET_THEME_PRESETS.map((theme) => ({
        id: `theme_widget_list:${theme.id}`,
        label: theme.label,
        hint: selectedWidgetThemeId === theme.id ? 'Selected' : theme.hint,
      })),
      { id: THEME_WIDGET_BACK_ID, label: 'Back', kind: 'back' },
      { id: THEME_WIDGET_EXIT_ID, label: 'Exit' },
    ],
    [selectedWidgetThemeId],
  );
  const themeBackgroundItems = useMemo<MenuOverlayItem[]>(
    () => [
      ...BACKGROUND_THEME_PRESETS.map((theme) => ({
        id: `theme_background_list:${theme.id}`,
        label: theme.label,
        hint: selectedBackgroundThemeId === theme.id ? 'Selected' : theme.hint,
      })),
      { id: THEME_BACKGROUND_BACK_ID, label: 'Back', kind: 'back' },
      { id: THEME_BACKGROUND_EXIT_ID, label: 'Exit' },
    ],
    [selectedBackgroundThemeId],
  );
  const getActionIds = useCallback(
    (layer: MenuNavigationLayer) => {
      if (layer === 'widget_list') return widgetListItems.map((item) => item.id);
      if (layer === 'parameter_editor') return parameterEditorItems.map((item) => item.id);
      if (layer === 'randomize_panel') return randomizePanelItems.map((item) => item.id);
      if (layer === 'theme_panel') return themePanelItems.map((item) => item.id);
      if (layer === 'theme_widget_list') return themeWidgetItems.map((item) => item.id);
      if (layer === 'theme_background_list') return themeBackgroundItems.map((item) => item.id);
      return MENU_ACTION_IDS;
    },
    [
      parameterEditorItems,
      randomizePanelItems,
      themeBackgroundItems,
      themePanelItems,
      themeWidgetItems,
      widgetListItems,
    ],
  );
  const setLayerRef = useRef<(
    layer: MenuNavigationLayer,
    options?: { resetIndex?: boolean },
  ) => void>(() => {});
  const handleMenuAction = useCallback(
    (actionId: string, layer: MenuNavigationLayer) => {
      logMenu('action_invoked', { layer, actionId });
      if (layer === 'widget_list') {
        if (actionId === WIDGET_LIST_BACK_ID) {
          setEditingWidgetId(null);
          setPendingWidgetDraft(null);
          setLayerRef.current('main', { resetIndex: false });
          logMenu('widget_settings_closed');
          return;
        }
        if (actionId === WIDGET_LIST_EXIT_ID) {
          setEditingWidgetId(null);
          setPendingWidgetDraft(null);
          closeMenuRef.current();
          logMenu('widget_settings_exit_menu');
          return;
        }
        if (actionId.startsWith('widget_list:')) {
          const widgetId = actionId.replace('widget_list:', '');
          const selected = widgets.find((widget) => widget.id === widgetId) ?? null;
          if (!selected) {
            logMenu('widget_selection_missing', { widgetId }, 'warn');
            return;
          }
          setEditingWidgetId(widgetId);
          setPendingWidgetDraft({ ...selected, freeform: { ...selected.freeform }, grid: { ...selected.grid } });
          setLayerRef.current('parameter_editor', { resetIndex: true });
          logMenu('widget_selected', { widgetId, widgetType: selected.type });
        }
        return;
      }

      if (layer === 'parameter_editor') {
        if (!editingWidget) {
          setLayerRef.current('widget_list', { resetIndex: false });
          return;
        }
        if (actionId === PARAM_BACK_ID) {
          if (pendingWidgetDraft?.id === editingWidget.id) {
            setWidgets((prev) =>
              prev.map((widget) => (widget.id === editingWidget.id ? pendingWidgetDraft : widget)),
            );
            logMenu('widget_settings_committed', { widgetId: editingWidget.id, widgetType: editingWidget.type });
          }
          setLayerRef.current('widget_list', { resetIndex: false });
          setEditingWidgetId(null);
          setPendingWidgetDraft(null);
          return;
        }
        if (actionId === PARAM_EXIT_ID) {
          if (pendingWidgetDraft?.id === editingWidget.id) {
            setWidgets((prev) =>
              prev.map((widget) => (widget.id === editingWidget.id ? pendingWidgetDraft : widget)),
            );
            logMenu('widget_settings_committed', { widgetId: editingWidget.id, widgetType: editingWidget.type });
          }
          setEditingWidgetId(null);
          setPendingWidgetDraft(null);
          closeMenuRef.current();
          logMenu('widget_settings_exit_menu');
          return;
        }
        if (actionId.startsWith('parameter_editor:') && editingDefinition && pendingWidgetDraft) {
          const key = actionId.replace('parameter_editor:', '');
          const parameter = editingDefinition.parameters.find((entry) => entry.key === key);
          if (!parameter) return;
          const out = cycleWidgetParameter(pendingWidgetDraft, parameter);
          setPendingWidgetDraft(out.widget);
          logMenu('widget_parameter_preview_changed', {
            widgetId: pendingWidgetDraft.id,
            widgetType: pendingWidgetDraft.type,
            parameter: parameter.name,
            from: out.previousValue,
            to: out.nextValue,
          });
        }
        return;
      }

      if (layer === 'randomize_panel') {
        if (actionId === RANDOMIZE_APPLY_ID) {
          randomizeWidgets();
          logMenu('randomize_panel_applied');
          return;
        }
        if (actionId === RANDOMIZE_BACK_ID) {
          setLayerRef.current('main', { resetIndex: false });
          logMenu('randomize_panel_back');
          return;
        }
        if (actionId === RANDOMIZE_EXIT_ID) {
          closeMenuRef.current();
          logMenu('randomize_panel_exit_menu');
          return;
        }
        return;
      }

      if (layer === 'theme_panel') {
        if (actionId === THEME_WIDGET_SELECTOR_ID) {
          setLayerRef.current('theme_widget_list', { resetIndex: true });
          logMenu('theme_widget_list_opened');
          return;
        }
        if (actionId === THEME_BACKGROUND_SELECTOR_ID) {
          setLayerRef.current('theme_background_list', { resetIndex: true });
          logMenu('theme_background_list_opened');
          return;
        }
        if (actionId === THEME_BACK_ID) {
          setLayerRef.current('main', { resetIndex: false });
          logMenu('theme_picker_back');
          return;
        }
        if (actionId === THEME_EXIT_ID) {
          closeMenuRef.current();
          logMenu('theme_picker_exit_menu');
          return;
        }
        return;
      }

      if (layer === 'theme_widget_list') {
        if (actionId === THEME_WIDGET_BACK_ID) {
          setLayerRef.current('theme_panel', { resetIndex: false });
          logMenu('theme_widget_list_closed');
          return;
        }
        if (actionId === THEME_WIDGET_EXIT_ID) {
          closeMenuRef.current();
          logMenu('theme_widget_list_exit_menu');
          return;
        }
        if (actionId.startsWith('theme_widget_list:')) {
          const widgetTheme = actionId.replace('theme_widget_list:', '');
          void (async () => {
            try {
              const serialized = serializeThemeSelection({
                widgetTheme,
                backgroundTheme: selectedBackgroundThemeId,
              });
              const updated = await putUserSettings({ theme: serialized });
              applyUserSettings(updated);
              const parsed = parseThemeSelection(updated.theme);
              setSelectedWidgetThemeId(parsed.widgetTheme);
              setSelectedBackgroundThemeId(parsed.backgroundTheme);
              writeThemeSessionCache(parsed.widgetTheme, parsed.backgroundTheme);
              logMenu('theme_widget_selected', { widgetTheme: parsed.widgetTheme });
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : 'Unknown error';
              logMenu('theme_widget_select_failed', { widgetTheme, message }, 'error');
            }
          })();
          return;
        }
        return;
      }

      if (layer === 'theme_background_list') {
        if (actionId === THEME_BACKGROUND_BACK_ID) {
          setLayerRef.current('theme_panel', { resetIndex: false });
          logMenu('theme_background_list_closed');
          return;
        }
        if (actionId === THEME_BACKGROUND_EXIT_ID) {
          closeMenuRef.current();
          logMenu('theme_background_list_exit_menu');
          return;
        }
        if (actionId.startsWith('theme_background_list:')) {
          const backgroundTheme = actionId.replace('theme_background_list:', '');
          void (async () => {
            try {
              const serialized = serializeThemeSelection({
                widgetTheme: selectedWidgetThemeId,
                backgroundTheme,
              });
              const updated = await putUserSettings({ theme: serialized });
              applyUserSettings(updated);
              const parsed = parseThemeSelection(updated.theme);
              setSelectedWidgetThemeId(parsed.widgetTheme);
              setSelectedBackgroundThemeId(parsed.backgroundTheme);
              writeThemeSessionCache(parsed.widgetTheme, parsed.backgroundTheme);
              logMenu('theme_background_selected', { backgroundTheme: parsed.backgroundTheme });
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : 'Unknown error';
              logMenu('theme_background_select_failed', { backgroundTheme, message }, 'error');
            }
          })();
          return;
        }
        return;
      }

      if (actionId === 'exit') {
        setEditingWidgetId(null);
        setPendingWidgetDraft(null);
        closeMenuRef.current();
        return;
      }
      if (actionId === 'outfit_try_on') {
        navigate('/virtual-try-on');
        return;
      }
      if (actionId === 'randomize_widgets') {
        setLayerRef.current('randomize_panel', { resetIndex: true });
        logMenu('randomize_panel_opened');
        return;
      }
      if (actionId === 'widget_settings') {
        setEditingWidgetId(null);
        setPendingWidgetDraft(null);
        setLayerRef.current('widget_list', { resetIndex: true });
        logMenu('widget_settings_opened', {
          configurableCount: widgets.length,
        });
        return;
      }
      if (actionId === 'change_theme') {
        setLayerRef.current('theme_panel', { resetIndex: true });
        logMenu('theme_picker_opened', {
          selectedWidgetThemeId,
          selectedBackgroundThemeId,
        });
        return;
      }
      if (actionId === 'link_google_qr') {
        closeMenuRef.current();
        setAuthError(null);
        logMenu('google_qr_link_started', { source: 'mirror-menu' });
        void initiateLogin('google')
          .then(() => {
            logMenu('google_qr_link_prompted', { source: 'mirror-menu' });
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : 'Unknown error';
            setAuthError(message);
            logMenu('google_qr_link_failed', { message }, 'error');
          });
        return;
      }
      if (actionId === 'unlink_google') {
        closeMenuRef.current();
        setAuthError(null);
        logMenu('google_unlink_started', { source: 'mirror-menu' });
        void disconnectGoogle()
          .then(() => {
            logMenu('google_unlink_completed', { source: 'mirror-menu' });
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : 'Unknown error';
            setAuthError(message);
            logMenu('google_unlink_failed', { message }, 'error');
          });
        return;
      }
      if (actionId === 'sleep') {
        closeMenuRef.current();
        enterSleep();
        logMenu('sleep_enabled', { source: 'mirror-menu' });
        return;
      }
      if (actionId === 'power_down') {
        closeMenuRef.current();
        void requestPowerOff('mirror-menu')
          .then(() => {
            logMenu('power_down_requested', { source: 'mirror-menu', command: 'sudo poweroff' }, 'warn');
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : 'Power off request failed';
            logMenu('power_down_failed', { message }, 'error');
          });
        return;
      }
      logMenu('action_unhandled', { actionId }, 'warn');
    },
    [
      widgets.length,
      editingDefinition,
      editingWidget,
      pendingWidgetDraft,
      logMenu,
      randomizeWidgets,
      navigate,
      initiateLogin,
      disconnectGoogle,
      setWidgets,
      selectedBackgroundThemeId,
      selectedWidgetThemeId,
      setAuthError,
      setSelectedBackgroundThemeId,
      setSelectedWidgetThemeId,
      toggleDim,
      widgets,
      enterSleep,
    ],
  );
  const closeMenuRef = useRef<() => void>(() => {});
  const menuNavigation = useMenuNavigation({
    getActionIds,
    onAction: handleMenuAction,
  });
  setLayerRef.current = menuNavigation.setLayer;
  closeMenuRef.current = menuNavigation.close;
  const currentMenuItems = useMemo<MenuOverlayItem[]>(() => {
    if (menuNavigation.layer === 'widget_list') return widgetListItems;
    if (menuNavigation.layer === 'parameter_editor') return parameterEditorItems;
    if (menuNavigation.layer === 'randomize_panel') return randomizePanelItems;
    if (menuNavigation.layer === 'theme_panel') return themePanelItems;
    if (menuNavigation.layer === 'theme_widget_list') return themeWidgetItems;
    if (menuNavigation.layer === 'theme_background_list') return themeBackgroundItems;
    return MENU_ITEMS;
  }, [
    menuNavigation.layer,
    parameterEditorItems,
    randomizePanelItems,
    themeBackgroundItems,
    themePanelItems,
    themeWidgetItems,
    widgetListItems,
  ]);
  const currentActionIds = useMemo(
    () => currentMenuItems.map((item) => item.id),
    [currentMenuItems],
  );
  const activeActionId = currentActionIds[menuNavigation.activeIndex] ?? null;
  const selectedListWidget = useMemo(() => {
    if (menuNavigation.layer !== 'widget_list') return null;
    const selected = widgetListItems[menuNavigation.activeIndex];
    if (!selected || selected.id === WIDGET_LIST_BACK_ID) return null;
    const selectedId = selected.id.replace('widget_list:', '');
    return widgets.find((widget) => widget.id === selectedId) ?? null;
  }, [widgets, menuNavigation.activeIndex, menuNavigation.layer, widgetListItems]);
  const selectedWidgetForPreview = editingWidget ?? selectedListWidget;
  const menuPreview = useMemo<MenuPreviewState | null>(() => {
    if (
      menuNavigation.layer === 'main' ||
      menuNavigation.layer === 'randomize_panel' ||
      menuNavigation.layer === 'theme_panel' ||
      menuNavigation.layer === 'theme_widget_list' ||
      menuNavigation.layer === 'theme_background_list'
    ) {
      return null;
    }
    if (!selectedWidgetForPreview) {
      return { title: 'Widget Preview', lines: [] };
    }
    const definition = getWidgetParametersForType(selectedWidgetForPreview.type);
    const lines = (definition?.parameters ?? []).map((parameter) => {
      const value = readWidgetParameterValue(selectedWidgetForPreview, parameter.key);
      return {
        key: parameter.name,
        value: formatWidgetParameterValue(parameter, value),
      };
    });
    return {
      title: `${getWidgetDisplayName(selectedWidgetForPreview.type)} Preview`,
      lines,
      widget: withPreviewMockData(selectedWidgetForPreview),
    };
  }, [menuNavigation.layer, selectedWidgetForPreview]);
  const menuTitle =
    menuNavigation.layer === 'main'
      ? 'MIRROR MENU'
      : menuNavigation.layer === 'widget_list'
        ? 'WIDGET SETTINGS'
        : menuNavigation.layer === 'parameter_editor'
          ? 'EDIT WIDGET'
          : menuNavigation.layer === 'theme_panel'
            ? 'THEME STYLES'
          : menuNavigation.layer === 'theme_widget_list'
              ? 'WIDGET THEMES'
              : menuNavigation.layer === 'theme_background_list'
                ? 'BACKGROUND THEMES'
                : 'RANDOMIZE';
  const prevMenuOpenRef = useRef<boolean>(false);
  useEffect(() => {
    if (prevMenuOpenRef.current !== menuNavigation.isOpen) {
      logMenu(menuNavigation.isOpen ? 'menu_opened' : 'menu_closed', {
        layer: menuNavigation.layer,
        activeIndex: menuNavigation.activeIndex,
      });
      prevMenuOpenRef.current = menuNavigation.isOpen;
    }
  }, [logMenu, menuNavigation.activeIndex, menuNavigation.isOpen, menuNavigation.layer]);
  const prevLayerRef = useRef(menuNavigation.layer);
  useEffect(() => {
    if (!menuNavigation.isOpen) return;
    if (prevLayerRef.current !== menuNavigation.layer) {
      logMenu('menu_layer_changed', {
        from: prevLayerRef.current,
        to: menuNavigation.layer,
      });
      prevLayerRef.current = menuNavigation.layer;
    }
  }, [logMenu, menuNavigation.isOpen, menuNavigation.layer]);
  const prevActiveIndexRef = useRef<number>(menuNavigation.activeIndex);
  useEffect(() => {
    if (!menuNavigation.isOpen) return;
    if (prevActiveIndexRef.current !== menuNavigation.activeIndex) {
      logMenu('cursor_moved', {
        layer: menuNavigation.layer,
        activeIndex: menuNavigation.activeIndex,
        actionId: currentActionIds[menuNavigation.activeIndex],
      });
      prevActiveIndexRef.current = menuNavigation.activeIndex;
    }
  }, [currentActionIds, logMenu, menuNavigation.activeIndex, menuNavigation.isOpen, menuNavigation.layer]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const updateRect = () => setCanvasRect(el.getBoundingClientRect());
    updateRect();
    const ro = new ResizeObserver(updateRect);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useMirrorInput({
    toggleDim,
    toggleSleep: enterSleep,
    openMenu: menuNavigation.open,
    dismissAuthOverlay: () => {
      if (pendingAuth) {
        void cancelPendingAuth();
      }
    },
    isAuthOverlayOpen: () => Boolean(pendingAuth),
    getSleepMode: () => false,
    isMenuOpen: () => menuNavigation.isOpen,
    isInputBlocked: () => menuNavigation.isOpen,
  });

  useControlEvents({
    onCameraLoadingStarted: () => {
      navigate('/virtual-try-on');
    },
    onUserSettingsUpdated: applySyncedUserSettings,
    ...deviceHandlers,
    onAuthStateChanged: () => {
      refreshAuth();
    },
  });

  const toggleWidget = (id: string) => {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w)));
  };

  return (
    <TooltipProvider delayDuration={400}>
      <div className={`mirror-shell${performanceLiteMode ? ' performance-lite' : ''}`}>
        <div className="mirror-ambient-layer" aria-hidden="true" />

      <motion.div
        ref={canvasRef}
        className="mirror-canvas mirror-canvas-freeform"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        style={{
          transform: `translate3d(${parallax.x * 0.3}px, ${parallax.y * 0.3}px, 0)`,
        }}
      >
        <AnimatePresence mode="popLayout">
          {activeWidgets.map((w) => (
            <WidgetFrame key={w.id} config={w} canvasRect={canvasRect} disableAnimations={performanceLiteMode} />
          ))}
        </AnimatePresence>
      </motion.div>

      <DeviceConnectionOverlay
        state={connectionState}
        onRetry={retryConnection}
      />

      <AuthQROverlay
        pendingAuth={pendingAuth}
        onCancel={() => {
          void cancelPendingAuth();
        }}
      />

      <MenuOverlay
        isOpen={menuNavigation.isOpen}
        layer={menuNavigation.layer}
        title={menuTitle}
        activeIndex={menuNavigation.activeIndex}
        items={currentMenuItems}
        preview={menuPreview}
        previewWidgetThemeId={selectedWidgetThemeId}
        previewBackgroundThemeId={selectedBackgroundThemeId}
        compactTopRight={
          menuNavigation.layer === 'randomize_panel' ||
          menuNavigation.layer === 'theme_panel' ||
          menuNavigation.layer === 'theme_widget_list' ||
          menuNavigation.layer === 'theme_background_list'
        }
        performanceLiteMode={performanceLiteMode}
      />

    </div>
    </TooltipProvider>
  );
}
