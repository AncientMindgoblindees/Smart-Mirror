import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, Palette, Moon, Power, QrCode, Shuffle, SlidersHorizontal, X } from 'lucide-react';
import { getUserSettings, putUserSettings, triggerCameraCapture } from '@/api/mirrorApi';
import { applyUserSettings } from '@/userSettings';
import {
  WidgetFrame,
  useWidgetPersistence,
  DEV_PANEL_STORAGE_KEY,
  type WidgetConfig,
} from '@/features/widgets';
import { ToolsPanel } from '@/features/dev-panel';
import { CameraOverlay } from '@/features/camera';
import {
  DeviceConnectionOverlay,
  useDeviceConnectionState,
} from '@/features/connection';
import { AuthQROverlay, useAuthState } from '@/features/auth';
import { useControlEvents } from '@/hooks/useControlEvents';
import { useMirrorInput } from '@/hooks/useMirrorInput';
import { useMenuNavigation } from '@/hooks/useMenuNavigation';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';
import { useParallax } from '@/hooks/useParallax';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { MenuOverlay, type MenuMainItem, type MenuOverlayItem, type MenuPreviewState } from '@/components/MenuOverlay';
import { useMirrorDisplayMode } from './hooks/useMirrorDisplayMode';
import { useAuthActions } from './hooks/useAuthActions';
import { useOverlayState } from './hooks/useOverlayState';
import { getApiBase } from '@/config/backendOrigin';
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

function readDevPanelInitial(): boolean {
  try {
    const v = localStorage.getItem(DEV_PANEL_STORAGE_KEY);
    if (v === 'false') return false;
  } catch {
    /* ignore */
  }
  return true;
}

function summarizeCameraError(message: string): string {
  const raw = (message || '').trim();
  if (!raw) return 'Camera error';
  const busyHint = /resource busy|pipeline handler in use|failed to acquire camera/i.test(raw);
  if (!busyHint) {
    return raw.slice(0, 280);
  }
  const mediaMatch = raw.match(/holders-[a-z]+\.holders_media=([^|]+)/i);
  const backendMatch = raw.match(/holders-[a-z]+\.holders_backend=([^|]+)/i);
  const media = mediaMatch?.[1]?.trim();
  const backend = backendMatch?.[1]?.trim();
  const mediaText = media && media !== 'none' ? `media: ${media.slice(0, 180)}` : '';
  const backendText = backend && backend !== 'none' ? `backend: ${backend.slice(0, 180)}` : '';
  const details = [mediaText, backendText].filter(Boolean).join(' | ');
  if (details) return `Camera busy (${details})`;
  return 'Camera busy (owned by another process)';
}

function withPreviewMockData(widget: WidgetConfig): WidgetConfig {
  const mockByType: Partial<WidgetConfig> = {
    title: widget.title ?? 'Preview Widget',
    text: widget.text ?? 'Sample preview content',
    location: widget.location ?? 'Chicago',
    unit: widget.unit ?? 'imperial',
    format: widget.format ?? '12h',
    timeFormat: widget.timeFormat ?? '12h',
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
  { id: 'take_picture', label: 'Take Picture', icon: Camera },
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
  const { widgets, setWidgets } = useWidgetPersistence();
  const {
    showCamera,
    setShowCamera,
    cameraError,
    setCameraError,
  } =
    useOverlayState();
  const captureFlowActiveRef = useRef(false);
  const [showDevPanel, setShowDevPanel] = useState(readDevPanelInitial);
  const [fullScreenTryOnUrl, setFullScreenTryOnUrl] = useState<string | null>(null);
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const [pendingWidgetDraft, setPendingWidgetDraft] = useState<WidgetConfig | null>(null);
  const [selectedWidgetThemeId, setSelectedWidgetThemeId] = useState<string>('glass-cyan');
  const [selectedBackgroundThemeId, setSelectedBackgroundThemeId] = useState<string>('noir');

  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  const {
    displayDimmed,
    sleepMode,
    sleepModeRef,
    toggleDim,
    toggleSleep,
    setSleepMode,
  } = useMirrorDisplayMode();

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
  const parallax = useParallax();
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
  useEffect(() => {
    void getUserSettings()
      .then((settings) => {
        const parsed = parseThemeSelection(settings.theme);
        setSelectedWidgetThemeId(parsed.widgetTheme);
        setSelectedBackgroundThemeId(parsed.backgroundTheme);
      })
      .catch(() => {
        setSelectedWidgetThemeId('glass-cyan');
        setSelectedBackgroundThemeId('noir');
      });
  }, []);
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
    (
      layer:
        | 'main'
        | 'widget_list'
        | 'parameter_editor'
        | 'randomize_panel'
        | 'theme_panel'
        | 'theme_widget_list'
        | 'theme_background_list',
    ) => {
      if (layer === 'widget_list') return widgetListItems.map((item) => item.id);
      if (layer === 'parameter_editor') return parameterEditorItems.map((item) => item.id);
      if (layer === 'randomize_panel') return randomizePanelItems.map((item) => item.id);
      if (layer === 'theme_panel') return themePanelItems.map((item) => item.id);
      if (layer === 'theme_widget_list') return themeWidgetItems.map((item) => item.id);
      if (layer === 'theme_background_list') return themeBackgroundItems.map((item) => item.id);
      return MENU_ACTION_IDS;
    },
    [parameterEditorItems, randomizePanelItems, themeBackgroundItems, themePanelItems, themeWidgetItems, widgetListItems],
  );
  const setLayerRef = useRef<(
    layer:
      | 'main'
      | 'widget_list'
      | 'parameter_editor'
      | 'randomize_panel'
      | 'theme_panel'
      | 'theme_widget_list'
      | 'theme_background_list',
    options?: { resetIndex?: boolean },
  ) => void>(() => {});
  const handleMenuAction = useCallback(
    (
      actionId: string,
      layer:
        | 'main'
        | 'widget_list'
        | 'parameter_editor'
        | 'randomize_panel'
        | 'theme_panel'
        | 'theme_widget_list'
        | 'theme_background_list',
    ) => {
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
      if (actionId === 'take_picture') {
        closeMenuRef.current();
        logMenu('take_picture_started', { source: 'mirror-menu' });
        setShowCamera(true);
        setCameraError(null);
        void triggerCameraCapture({
          countdown_seconds: 3,
          source: 'mirror-menu',
          session_id: `menu-${Date.now()}`,
        })
          .then((result) => {
            logMenu('take_picture_accepted', { result });
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : 'Unknown error';
            setCameraError(summarizeCameraError(message));
            logMenu('take_picture_failed', { message }, 'error');
          });
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
        setSleepMode(true);
        logMenu('sleep_enabled', { source: 'mirror-menu' });
        return;
      }
      if (actionId === 'power_down') {
        closeMenuRef.current();
        if (!displayDimmed) toggleDim();
        setSleepMode(true);
        logMenu(
          'power_down_requested',
          {
            mode: 'simulated',
            behavior: 'display_dimmed_and_sleep_enabled',
          },
          'warn',
        );
        return;
      }
      logMenu('action_unhandled', { actionId }, 'warn');
    },
    [
      widgets.length,
      displayDimmed,
      editingDefinition,
      editingWidget,
      pendingWidgetDraft,
      logMenu,
      randomizeWidgets,
      initiateLogin,
      disconnectGoogle,
      setWidgets,
      selectedBackgroundThemeId,
      selectedWidgetThemeId,
      setAuthError,
      setCameraError,
      setSelectedBackgroundThemeId,
      setSelectedWidgetThemeId,
      setShowCamera,
      setSleepMode,
      toggleDim,
      widgets,
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

  const toggleDevPanel = useCallback(() => {
    setShowDevPanel((v) => {
      const next = !v;
      try {
        localStorage.setItem(DEV_PANEL_STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const startDevNativePreview = useCallback(async () => {
    const res = await fetch(`${getApiBase()}/camera/preview/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'mirror-dev-panel' }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { detail?: string };
      throw new Error(payload.detail || `Preview start failed (${res.status})`);
    }
  }, []);

  const stopDevNativePreview = useCallback(async () => {
    await fetch(`${getApiBase()}/camera/preview/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'mirror-dev-panel' }),
    }).catch(() => {});
  }, []);

  useMirrorInput({
    toggleDim,
    toggleSleep,
    toggleDevPanel,
    dismissTryOnOverlay: () => setFullScreenTryOnUrl(null),
    getSleepMode: () => sleepModeRef.current,
    isInputBlocked: () => menuNavigation.isOpen,
  });

  useControlEvents({
    onCameraLoadingStarted: () => {
      captureFlowActiveRef.current = true;
      setShowCamera(true);
      setCameraError(null);
    },
    onCameraLoadingReady: () => {
      setShowCamera(true);
      setCameraError(null);
    },
    onCameraCountdownStarted: () => {
      captureFlowActiveRef.current = true;
      setShowCamera(true);
      setCameraError(null);
    },
    onCameraCountdownTick: () => {
      captureFlowActiveRef.current = true;
      setShowCamera(true);
    },
    onCameraCaptured: () => {
      captureFlowActiveRef.current = false;
      setCameraError(null);
      setShowCamera(false);
    },
    onCameraError: (message) => {
      const hadCaptureFlow = captureFlowActiveRef.current;
      captureFlowActiveRef.current = false;
      setCameraError(summarizeCameraError(message));
      // If this error happened during an active capture flow, return to UI instead of leaving camera overlay stuck.
      if (hadCaptureFlow) {
        setShowCamera(false);
        return;
      }
      setShowCamera(true);
    },
    onTryOnResult: (payload) => {
      if (payload.image_url) setFullScreenTryOnUrl(payload.image_url);
    },
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
      <div className="mirror-shell">
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
            <WidgetFrame key={w.id} config={w} canvasRect={canvasRect} />
          ))}
        </AnimatePresence>
      </motion.div>

      {showDevPanel && (
        <ToolsPanel
          onToggleCamera={() => {
            const shouldOpen = !showCamera;
            if (shouldOpen) {
              setShowCamera(true);
              setCameraError(null);
              void startDevNativePreview()
                .catch((err: unknown) => {
                  setCameraError(err instanceof Error ? err.message : 'Native preview failed to start');
                });
              return;
            }
            setCameraError(null);
            setShowCamera(false);
            void stopDevNativePreview();
          }}
          onToggleDim={toggleDim}
          onToggleSleep={toggleSleep}
          widgets={widgets}
          onToggleWidget={toggleWidget}
          authProviders={authProviders}
          authPending={Boolean(pendingAuth)}
          authError={authError}
          onSignInGoogle={signInGoogle}
          onDisconnectGoogle={disconnectGoogle}
        />
      )}

      {showCamera && (
        <CameraOverlay
          errorMessage={cameraError}
          onClose={() => {
            setCameraError(null);
            setShowCamera(false);
            void stopDevNativePreview();
          }}
        />
      )}

      <AnimatePresence>
        {fullScreenTryOnUrl && (
          <motion.div
            className="camera-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="camera-stage">
              <div className="camera-video-wrap">
                <img
                  src={fullScreenTryOnUrl}
                  className="camera-video"
                  aria-label="Full-screen virtual try-on result"
                  referrerPolicy="no-referrer"
                />
              </div>
              <button
                type="button"
                className="camera-exit-btn"
                onClick={() => setFullScreenTryOnUrl(null)}
              >
                <X size={20} /> Hide Try-On
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
      />

      <AnimatePresence>
        {sleepMode && (
          <motion.div
            className="mirror-sleep-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
            aria-hidden="true"
          >
            <motion.span
              className="mirror-sleep-hint"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 1, ease: [0.16, 1, 0.3, 1] }}
            >
              Sleep - tap or press any key to wake
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </TooltipProvider>
  );
}
