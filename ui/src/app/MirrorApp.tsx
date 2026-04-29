import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronUp, Heart, Moon, Palette, Power, QrCode, Shirt, Shuffle, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  generateOutfitTryOn,
  getClothingItems,
  getPersonImages,
  getUserSettings,
  putUserSettings,
  triggerCameraCapture,
  updateClothingItem,
} from '@/api/mirrorApi';
import type { ClothingItemRead } from '@/api/backendTypes';
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

type OutfitFavoriteSnapshot = {
  id: string;
  name: string;
  clothingImageIds: number[];
  createdAt: string;
};

type ClothingSelectionOption = {
  imageId: number;
  itemId: number;
  itemName: string;
  category: string;
  imageUrl: string;
  favorite: boolean;
};

type TryOnSlotKey = 'top' | 'bottom' | 'accessories';

function makeMockImage(label: string, color: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='${color}'/><stop offset='100%' stop-color='#111827'/></linearGradient></defs><rect width='100%' height='100%' fill='url(#g)'/><text x='50%' y='52%' dominant-baseline='middle' text-anchor='middle' fill='white' font-family='Arial, sans-serif' font-size='48' font-weight='700'>${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function mockClothingItems(): ClothingItemRead[] {
  return [
    {
      id: -101,
      name: 'Mock Hoodie',
      category: 'top',
      color: 'charcoal',
      season: 'all',
      notes: 'mock',
      favorite: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      images: [{ id: -1001, clothing_item_id: -101, storage_provider: 'mock', storage_key: 'mock-top-1', image_url: makeMockImage('Top 1', '#0ea5e9'), created_at: new Date().toISOString() }],
    },
    {
      id: -102,
      name: 'Mock Jacket',
      category: 'top',
      color: 'navy',
      season: 'fall',
      notes: 'mock',
      favorite: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      images: [{ id: -1002, clothing_item_id: -102, storage_provider: 'mock', storage_key: 'mock-top-2', image_url: makeMockImage('Top 2', '#2563eb'), created_at: new Date().toISOString() }],
    },
    {
      id: -201,
      name: 'Mock Jeans',
      category: 'bottom',
      color: 'indigo',
      season: 'all',
      notes: 'mock',
      favorite: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      images: [{ id: -2001, clothing_item_id: -201, storage_provider: 'mock', storage_key: 'mock-bottom-1', image_url: makeMockImage('Bottom 1', '#4f46e5'), created_at: new Date().toISOString() }],
    },
    {
      id: -202,
      name: 'Mock Trousers',
      category: 'bottom',
      color: 'black',
      season: 'all',
      notes: 'mock',
      favorite: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      images: [{ id: -2002, clothing_item_id: -202, storage_provider: 'mock', storage_key: 'mock-bottom-2', image_url: makeMockImage('Bottom 2', '#7c3aed'), created_at: new Date().toISOString() }],
    },
    {
      id: -301,
      name: 'Mock Cap',
      category: 'accessories',
      color: 'red',
      season: 'all',
      notes: 'mock',
      favorite: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      images: [{ id: -3001, clothing_item_id: -301, storage_provider: 'mock', storage_key: 'mock-acc-1', image_url: makeMockImage('Accessory 1', '#f43f5e'), created_at: new Date().toISOString() }],
    },
    {
      id: -302,
      name: 'Mock Bag',
      category: 'accessories',
      color: 'tan',
      season: 'all',
      notes: 'mock',
      favorite: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      images: [{ id: -3002, clothing_item_id: -302, storage_provider: 'mock', storage_key: 'mock-acc-2', image_url: makeMockImage('Accessory 2', '#f59e0b'), created_at: new Date().toISOString() }],
    },
  ];
}

const OUTFIT_FAVORITES_STORAGE_KEY = 'mirror:outfit-favorites';
const THEME_CACHE_SESSION_KEY = 'mirror:theme-selection:session';
const TRYON_MAX_GENERATE_ATTEMPTS = 2; // initial attempt + 1 retry

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

function readOutfitFavoritesInitial(): OutfitFavoriteSnapshot[] {
  try {
    const raw = localStorage.getItem(OUTFIT_FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is OutfitFavoriteSnapshot => {
        if (!entry || typeof entry !== 'object') return false;
        const candidate = entry as OutfitFavoriteSnapshot;
        return (
          typeof candidate.id === 'string' &&
          typeof candidate.name === 'string' &&
          Array.isArray(candidate.clothingImageIds) &&
          typeof candidate.createdAt === 'string'
        );
      })
      .slice(0, 40);
  } catch {
    return [];
  }
}

function categoryToSlot(category: string): TryOnSlotKey | null {
  const c = category.trim().toLowerCase();
  if (!c) return null;
  if (c.includes('top') || c.includes('shirt') || c.includes('jacket') || c.includes('hoodie') || c.includes('coat')) {
    return 'top';
  }
  if (c.includes('bottom') || c.includes('pants') || c.includes('short') || c.includes('skirt') || c.includes('jean')) {
    return 'bottom';
  }
  if (c.includes('accessor') || c.includes('hat') || c.includes('shoe') || c.includes('bag') || c.includes('glass')) {
    return 'accessories';
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function prefetchImageUrls(urls: string[]): Promise<void> {
  const unique = Array.from(new Set(urls.filter((url) => url.trim().length > 0)));
  await Promise.allSettled(
    unique.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.decoding = 'async';
          img.referrerPolicy = 'no-referrer';
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = url;
        }),
    ),
  );
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
  { id: 'outfit_try_on', label: 'Virtual Try-On', icon: Shirt },
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
const OUTFIT_PANEL_TOP_UP_ID = 'outfit_panel:top_up';
const OUTFIT_PANEL_TOP_DOWN_ID = 'outfit_panel:top_down';
const OUTFIT_PANEL_BOTTOM_UP_ID = 'outfit_panel:bottom_up';
const OUTFIT_PANEL_BOTTOM_DOWN_ID = 'outfit_panel:bottom_down';
const OUTFIT_PANEL_ACCESSORIES_UP_ID = 'outfit_panel:accessories_up';
const OUTFIT_PANEL_ACCESSORIES_DOWN_ID = 'outfit_panel:accessories_down';
const OUTFIT_PANEL_FAVORITE_NEXT_ID = 'outfit_panel:favorite_next';
const OUTFIT_PANEL_LOAD_FAVORITE_ID = 'outfit_panel:favorite_load';
const OUTFIT_PANEL_SHUFFLE_ID = 'outfit_panel:shuffle';
const OUTFIT_PANEL_TAKE_PICTURE_ID = 'outfit_panel:take_picture';
const OUTFIT_PANEL_VIEW_PICTURE_ID = 'outfit_panel:view_picture';
const OUTFIT_PANEL_GENERATE_ID = 'outfit_panel:generate';
const OUTFIT_PANEL_SAVE_FAVORITE_ID = 'outfit_panel:save_favorite';
const OUTFIT_PANEL_BACK_ID = 'outfit_panel:back';
const OUTFIT_PANEL_EXIT_ID = 'outfit_panel:exit';
const OUTFIT_SELECTION_BACK_ID = 'outfit_selection:back';
const OUTFIT_SELECTION_EXIT_ID = 'outfit_selection:exit';
const OUTFIT_FAVORITES_BACK_ID = 'outfit_favorites:back';
const OUTFIT_FAVORITES_EXIT_ID = 'outfit_favorites:exit';

export default function MirrorApp() {
  const navigate = useNavigate();
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
  const [clothingItems, setClothingItems] = useState<ClothingItemRead[]>([]);
  const [clothingLoading, setClothingLoading] = useState(false);
  const [clothingCacheReady, setClothingCacheReady] = useState(false);
  const [clothingError, setClothingError] = useState<string | null>(null);
  const [selectedClothingImageIds, setSelectedClothingImageIds] = useState<number[]>([]);
  const [slotIndices, setSlotIndices] = useState<Record<TryOnSlotKey, number>>({
    top: 0,
    bottom: 0,
    accessories: 0,
  });
  const [outfitFavorites, setOutfitFavorites] = useState<OutfitFavoriteSnapshot[]>(readOutfitFavoritesInitial);
  const [selectedFavoriteIndex, setSelectedFavoriteIndex] = useState(0);
  const [latestPersonImageUrl, setLatestPersonImageUrl] = useState<string | null>(null);
  const [tryOnBusy, setTryOnBusy] = useState(false);
  const [tryOnStatus, setTryOnStatus] = useState<string | null>(null);

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
    const cachedTheme = readThemeSessionCache();
    if (cachedTheme) {
      setSelectedWidgetThemeId(cachedTheme.widgetTheme);
      setSelectedBackgroundThemeId(cachedTheme.backgroundTheme);
    }
    void getUserSettings()
      .then((settings) => {
        const parsed = parseThemeSelection(settings.theme);
        setSelectedWidgetThemeId(parsed.widgetTheme);
        setSelectedBackgroundThemeId(parsed.backgroundTheme);
        writeThemeSessionCache(parsed.widgetTheme, parsed.backgroundTheme);
      })
      .catch(() => {
        if (!cachedTheme) {
          setSelectedWidgetThemeId('glass-cyan');
          setSelectedBackgroundThemeId('noir');
        }
      });
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(OUTFIT_FAVORITES_STORAGE_KEY, JSON.stringify(outfitFavorites.slice(0, 40)));
    } catch {
      /* ignore */
    }
  }, [outfitFavorites]);
  useEffect(() => {
    setSelectedFavoriteIndex((prev) => {
      if (outfitFavorites.length <= 0) return 0;
      return Math.min(prev, outfitFavorites.length - 1);
    });
  }, [outfitFavorites]);
  const clothingOptions = useMemo<ClothingSelectionOption[]>(() => {
    const out: ClothingSelectionOption[] = [];
    for (const item of clothingItems) {
      for (const image of item.images ?? []) {
        out.push({
          imageId: image.id,
          itemId: item.id,
          itemName: item.name,
          category: item.category,
          imageUrl: image.image_url,
          favorite: item.favorite,
        });
      }
    }
    return out;
  }, [clothingItems]);
  const clothingOptionByImageId = useMemo(() => {
    const map = new Map<number, ClothingSelectionOption>();
    for (const option of clothingOptions) {
      map.set(option.imageId, option);
    }
    return map;
  }, [clothingOptions]);
  const slotOptions = useMemo<Record<TryOnSlotKey, ClothingSelectionOption[]>>(() => {
    const grouped: Record<TryOnSlotKey, ClothingSelectionOption[]> = {
      top: [],
      bottom: [],
      accessories: [],
    };
    for (const option of clothingOptions) {
      const slot = categoryToSlot(option.category);
      if (!slot) continue;
      grouped[slot].push(option);
    }
    return grouped;
  }, [clothingOptions]);
  useEffect(() => {
    setSlotIndices((prev) => ({
      top: Math.min(prev.top, Math.max(slotOptions.top.length - 1, 0)),
      bottom: Math.min(prev.bottom, Math.max(slotOptions.bottom.length - 1, 0)),
      accessories: Math.min(prev.accessories, Math.max(slotOptions.accessories.length - 1, 0)),
    }));
  }, [slotOptions]);
  const selectedSlotItems = useMemo(() => {
    const selectedTop = slotOptions.top[slotIndices.top] ?? null;
    const selectedBottom = slotOptions.bottom[slotIndices.bottom] ?? null;
    const selectedAccessories = slotOptions.accessories[slotIndices.accessories] ?? null;
    return {
      top: selectedTop,
      bottom: selectedBottom,
      accessories: selectedAccessories,
    };
  }, [slotIndices, slotOptions]);
  useEffect(() => {
    const ids = [selectedSlotItems.top, selectedSlotItems.bottom, selectedSlotItems.accessories]
      .filter((item): item is ClothingSelectionOption => item !== null)
      .map((item) => item.imageId);
    setSelectedClothingImageIds(ids);
  }, [selectedSlotItems]);
  const selectedClothingCount = selectedClothingImageIds.length;
  const selectedFavorite = outfitFavorites[selectedFavoriteIndex] ?? null;
  const refreshLatestPersonImage = useCallback(async () => {
    try {
      const rows = await getPersonImages();
      const latest = rows[0];
      if (!latest) {
        setLatestPersonImageUrl(null);
        return;
      }
      setLatestPersonImageUrl(`${getApiBase()}/tryon/person-image/${latest.id}?t=${Date.now()}`);
    } catch {
      setLatestPersonImageUrl(null);
    }
  }, []);
  const loadClothingCatalog = useCallback(async () => {
    setClothingLoading(true);
    setClothingError(null);
    setClothingCacheReady(false);
    try {
      let rows = await getClothingItems({ includeImages: true });
      const hasImages = rows.some((item) => (item.images?.length ?? 0) > 0);
      if (!hasImages) {
        rows = mockClothingItems();
        setTryOnStatus('Using mock clothing catalog (Cloudinary empty)');
      }
      const imageUrls = rows.flatMap((item) => (item.images ?? []).map((image) => image.image_url));
      await prefetchImageUrls(imageUrls);
      setClothingItems(rows);
      setClothingCacheReady(true);
      setTryOnStatus((prev) => prev ?? `Loaded ${rows.length} clothing items`);
    } catch (error: unknown) {
      const rows = mockClothingItems();
      const imageUrls = rows.flatMap((item) => (item.images ?? []).map((image) => image.image_url));
      await prefetchImageUrls(imageUrls);
      setClothingItems(rows);
      setTryOnStatus('Using mock clothing catalog (Cloudinary unavailable)');
      setClothingError(null);
      setClothingCacheReady(true);
    } finally {
      setClothingLoading(false);
    }
  }, []);
  const shuffleOutfitSelection = useCallback(() => {
    const hasAny = slotOptions.top.length || slotOptions.bottom.length || slotOptions.accessories.length;
    if (!hasAny) {
      setTryOnStatus('No clothing images available to shuffle');
      return;
    }
    setSlotIndices({
      top: slotOptions.top.length ? Math.floor(Math.random() * slotOptions.top.length) : 0,
      bottom: slotOptions.bottom.length ? Math.floor(Math.random() * slotOptions.bottom.length) : 0,
      accessories: slotOptions.accessories.length ? Math.floor(Math.random() * slotOptions.accessories.length) : 0,
    });
    setTryOnStatus('Shuffled outfit slots');
    logMenu('outfit_shuffled');
  }, [logMenu, slotOptions]);
  const cycleSlot = useCallback(
    (slot: TryOnSlotKey, direction: -1 | 1) => {
      const total = slotOptions[slot].length;
      if (total <= 0) return;
      setSlotIndices((prev) => {
        const current = prev[slot] ?? 0;
        const next = direction === 1 ? (current + 1) % total : (current - 1 + total) % total;
        return { ...prev, [slot]: next };
      });
    },
    [slotOptions],
  );
  const loadFavoriteSnapshot = useCallback(
    (favorite: OutfitFavoriteSnapshot) => {
      setSlotIndices((prev) => {
        const next = { ...prev };
        for (const imageId of favorite.clothingImageIds) {
          const option = clothingOptionByImageId.get(imageId);
          if (!option) continue;
          const slot = categoryToSlot(option.category);
          if (!slot) continue;
          const idx = slotOptions[slot].findIndex((entry) => entry.imageId === imageId);
          if (idx >= 0) {
            next[slot] = idx;
          }
        }
        return next;
      });
      setTryOnStatus(`Loaded favorite: ${favorite.name}`);
    },
    [clothingOptionByImageId, slotOptions],
  );
  const saveSelectedOutfitAsFavorite = useCallback(async () => {
    if (!selectedClothingImageIds.length) {
      setTryOnStatus('Select clothing before saving favorite');
      return;
    }
    const now = new Date();
    const snapshot: OutfitFavoriteSnapshot = {
      id: `fav-${now.getTime()}`,
      name: `Favorite ${now.toLocaleString()}`,
      clothingImageIds: [...selectedClothingImageIds],
      createdAt: now.toISOString(),
    };
    setOutfitFavorites((prev) => [snapshot, ...prev].slice(0, 40));
    const itemIds = Array.from(
      new Set(
        selectedClothingImageIds
          .map((imageId) => clothingOptionByImageId.get(imageId)?.itemId)
          .filter((value): value is number => typeof value === 'number'),
      ),
    );
    try {
      if (itemIds.length > 0) {
        await Promise.all(itemIds.map((itemId) => updateClothingItem(itemId, { favorite: true })));
        setClothingItems((prev) =>
          prev.map((item) => (itemIds.includes(item.id) ? { ...item, favorite: true } : item)),
        );
      }
      setTryOnStatus(`Saved favorite outfit (${selectedClothingImageIds.length} items)`);
      logMenu('outfit_favorite_saved', { imageCount: selectedClothingImageIds.length, itemCount: itemIds.length });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not save favorite flag';
      setTryOnStatus(message);
      logMenu('outfit_favorite_save_failed', { message }, 'error');
    }
  }, [clothingOptionByImageId, selectedClothingImageIds, logMenu]);
  const runSelectedOutfitTryOn = useCallback(async () => {
    if (!selectedClothingImageIds.length) {
      setTryOnStatus('Select clothing before generating try-on');
      return;
    }
    setTryOnBusy(true);
    setTryOnStatus('Capturing image...');
    try {
      let baselineLatestId: number | null = null;
      try {
        const existing = await getPersonImages();
        baselineLatestId = existing[0]?.id ?? null;
      } catch {
        baselineLatestId = null;
      }
      captureFlowActiveRef.current = true;
      setShowCamera(true);
      setCameraError(null);
      await triggerCameraCapture({
        countdown_seconds: 3,
        source: 'virtual-try-on-menu',
        session_id: `virtual-tryon-${Date.now()}`,
      });
      const deadline = Date.now() + 45000;
      let captureDetected = false;
      let capturedLatestId: number | null = null;
      while (Date.now() < deadline) {
        const rows = await getPersonImages();
        const latestId = rows[0]?.id ?? null;
        if (latestId !== null && (baselineLatestId === null || latestId > baselineLatestId)) {
          captureDetected = true;
          capturedLatestId = latestId;
          break;
        }
        await sleep(1000);
      }
      if (!captureDetected) {
        throw new Error('Camera capture did not complete in time');
      }
      if (capturedLatestId !== null) {
        setLatestPersonImageUrl(`${getApiBase()}/tryon/person-image/${capturedLatestId}?t=${Date.now()}`);
      }
      setTryOnStatus('Generating virtual try-on...');
      let lastError: unknown = null;
      let result: Awaited<ReturnType<typeof generateOutfitTryOn>> | null = null;
      for (let attempt = 1; attempt <= TRYON_MAX_GENERATE_ATTEMPTS; attempt += 1) {
        try {
          result = await generateOutfitTryOn({ clothing_image_ids: selectedClothingImageIds });
          break;
        } catch (error: unknown) {
          lastError = error;
          if (attempt >= TRYON_MAX_GENERATE_ATTEMPTS) {
            break;
          }
          setTryOnStatus(`Try-on failed (attempt ${attempt}). Retrying once...`);
          await sleep(1500);
        }
      }
      if (!result) {
        const message =
          lastError instanceof Error
            ? `Virtual try-on failed after ${TRYON_MAX_GENERATE_ATTEMPTS} attempts: ${lastError.message}`
            : `Virtual try-on failed after ${TRYON_MAX_GENERATE_ATTEMPTS} attempts`;
        throw new Error(message);
      }
      setFullScreenTryOnUrl(result.image_url);
      setTryOnStatus('Virtual try-on ready');
      logMenu('outfit_tryon_generated', {
        generationId: result.generation_id,
        selectedCount: selectedClothingImageIds.length,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Try-on generation failed';
      setTryOnStatus(message);
      logMenu('outfit_tryon_failed', { message }, 'error');
    } finally {
      setTryOnBusy(false);
    }
  }, [logMenu, selectedClothingImageIds, setCameraError, setShowCamera]);
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
  const outfitPanelItems = useMemo<MenuOverlayItem[]>(
    () => [
      {
        id: OUTFIT_PANEL_TOP_UP_ID,
        label: 'Top Up',
        hint: clothingError
          ? `Load error: ${clothingError}`
          : clothingLoading
            ? 'Loading + caching...'
            : !clothingCacheReady && clothingOptions.length > 0
              ? 'Caching images...'
              : selectedSlotItems.top?.itemName ?? 'No top item',
      },
      { id: OUTFIT_PANEL_TOP_DOWN_ID, label: 'Top Down', hint: 'Cycle top items' },
      { id: OUTFIT_PANEL_BOTTOM_UP_ID, label: 'Bottom Up', hint: selectedSlotItems.bottom?.itemName ?? 'No bottom item' },
      { id: OUTFIT_PANEL_BOTTOM_DOWN_ID, label: 'Bottom Down', hint: 'Cycle bottom items' },
      { id: OUTFIT_PANEL_ACCESSORIES_UP_ID, label: 'Accessories Up', hint: selectedSlotItems.accessories?.itemName ?? 'No accessory item' },
      { id: OUTFIT_PANEL_ACCESSORIES_DOWN_ID, label: 'Accessories Down', hint: 'Cycle accessories' },
      { id: OUTFIT_PANEL_SAVE_FAVORITE_ID, label: 'Favorite', icon: Heart, hint: `${outfitFavorites.length} saved` },
      {
        id: OUTFIT_PANEL_FAVORITE_NEXT_ID,
        label: 'Favorite Selector',
        hint: selectedFavorite ? selectedFavorite.name : 'No favorites',
      },
      {
        id: OUTFIT_PANEL_LOAD_FAVORITE_ID,
        label: 'Load Favorite',
        hint: selectedFavorite ? `${selectedFavorite.clothingImageIds.length} items` : 'Save first',
      },
      { id: OUTFIT_PANEL_SHUFFLE_ID, label: 'Randomize', icon: Shuffle, hint: 'Random by slot' },
      { id: OUTFIT_PANEL_TAKE_PICTURE_ID, label: 'Take Picture', hint: 'Capture person image only' },
      {
        id: OUTFIT_PANEL_VIEW_PICTURE_ID,
        label: 'View Picture',
        hint: latestPersonImageUrl ? 'Show captured picture overlay' : 'Take picture first',
      },
      {
        id: OUTFIT_PANEL_GENERATE_ID,
        label: tryOnBusy ? 'Generating...' : 'Generate',
        icon: Sparkles,
        hint: tryOnStatus ?? `${selectedClothingCount} selected`,
      },
      { id: OUTFIT_PANEL_BACK_ID, label: 'Back', kind: 'back' },
      { id: OUTFIT_PANEL_EXIT_ID, label: 'Exit' },
    ],
    [
      clothingCacheReady,
      clothingError,
      clothingLoading,
      clothingOptions.length,
      outfitFavorites.length,
      latestPersonImageUrl,
      selectedFavorite,
      selectedClothingCount,
      selectedSlotItems.accessories,
      selectedSlotItems.bottom,
      selectedSlotItems.top,
      tryOnBusy,
      tryOnStatus,
    ],
  );
  const outfitSelectionItems = useMemo<MenuOverlayItem[]>(() => {
    if (!clothingCacheReady) {
      return [
        {
          id: 'outfit_selection:caching',
          label: clothingLoading ? 'Preparing clothing preview...' : 'Load clothing to start',
          hint: clothingLoading ? 'Caching cloud images' : 'Open Select Clothing again after load',
        },
        { id: OUTFIT_SELECTION_BACK_ID, label: 'Back', kind: 'back' },
        { id: OUTFIT_SELECTION_EXIT_ID, label: 'Exit' },
      ];
    }
    const options: MenuOverlayItem[] = clothingOptions.map((option) => {
      const selected = selectedClothingImageIds.includes(option.imageId);
      return {
        id: `outfit_selection:image:${option.imageId}`,
        label: `${option.itemName} (${option.category})`,
        hint: selected ? 'Selected' : option.favorite ? 'Favorited in closet' : `Image ${option.imageId}`,
        imageUrl: option.imageUrl,
        selected,
      };
    });
    if (options.length === 0) {
      options.push({
        id: 'outfit_selection:empty',
        label: clothingLoading ? 'Loading clothing...' : 'No clothing images found',
        hint: 'Add clothing images to continue',
      });
    }
    return [
      ...options,
      { id: OUTFIT_SELECTION_BACK_ID, label: 'Back', kind: 'back' },
      { id: OUTFIT_SELECTION_EXIT_ID, label: 'Exit' },
    ];
  }, [clothingCacheReady, clothingLoading, clothingOptions, selectedClothingImageIds]);
  const outfitFavoritesItems = useMemo<MenuOverlayItem[]>(() => {
    const options = outfitFavorites.map((favorite) => ({
      id: `outfit_favorites:load:${favorite.id}`,
      label: favorite.name,
      hint: `${favorite.clothingImageIds.length} items`,
    }));
    if (options.length === 0) {
      options.push({
        id: 'outfit_favorites:empty',
        label: 'No saved outfit favorites',
        hint: 'Save an outfit first',
      });
    }
    return [
      ...options,
      { id: OUTFIT_FAVORITES_BACK_ID, label: 'Back', kind: 'back' },
      { id: OUTFIT_FAVORITES_EXIT_ID, label: 'Exit' },
    ];
  }, [outfitFavorites]);
  const getActionIds = useCallback(
    (
      layer:
        | 'main'
        | 'widget_list'
        | 'parameter_editor'
        | 'randomize_panel'
        | 'theme_panel'
        | 'theme_widget_list'
        | 'theme_background_list'
        | 'outfit_panel'
        | 'outfit_selection'
        | 'outfit_favorites',
    ) => {
      if (layer === 'widget_list') return widgetListItems.map((item) => item.id);
      if (layer === 'parameter_editor') return parameterEditorItems.map((item) => item.id);
      if (layer === 'randomize_panel') return randomizePanelItems.map((item) => item.id);
      if (layer === 'theme_panel') return themePanelItems.map((item) => item.id);
      if (layer === 'theme_widget_list') return themeWidgetItems.map((item) => item.id);
      if (layer === 'theme_background_list') return themeBackgroundItems.map((item) => item.id);
      if (layer === 'outfit_panel') return outfitPanelItems.map((item) => item.id);
      if (layer === 'outfit_selection') return outfitSelectionItems.map((item) => item.id);
      if (layer === 'outfit_favorites') return outfitFavoritesItems.map((item) => item.id);
      return MENU_ACTION_IDS;
    },
    [
      outfitFavoritesItems,
      outfitPanelItems,
      outfitSelectionItems,
      parameterEditorItems,
      randomizePanelItems,
      themeBackgroundItems,
      themePanelItems,
      themeWidgetItems,
      widgetListItems,
    ],
  );
  const setLayerRef = useRef<(
    layer:
      | 'main'
      | 'widget_list'
      | 'parameter_editor'
      | 'randomize_panel'
      | 'theme_panel'
      | 'theme_widget_list'
      | 'theme_background_list'
      | 'outfit_panel'
      | 'outfit_selection'
      | 'outfit_favorites',
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
        | 'theme_background_list'
        | 'outfit_panel'
        | 'outfit_selection'
        | 'outfit_favorites',
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

      if (layer === 'outfit_panel') {
        if (actionId === OUTFIT_PANEL_TOP_UP_ID) {
          cycleSlot('top', -1);
          return;
        }
        if (actionId === OUTFIT_PANEL_TOP_DOWN_ID) {
          cycleSlot('top', 1);
          return;
        }
        if (actionId === OUTFIT_PANEL_BOTTOM_UP_ID) {
          cycleSlot('bottom', -1);
          return;
        }
        if (actionId === OUTFIT_PANEL_BOTTOM_DOWN_ID) {
          cycleSlot('bottom', 1);
          return;
        }
        if (actionId === OUTFIT_PANEL_ACCESSORIES_UP_ID) {
          cycleSlot('accessories', -1);
          return;
        }
        if (actionId === OUTFIT_PANEL_ACCESSORIES_DOWN_ID) {
          cycleSlot('accessories', 1);
          return;
        }
        if (actionId === OUTFIT_PANEL_SHUFFLE_ID) {
          shuffleOutfitSelection();
          return;
        }
        if (actionId === OUTFIT_PANEL_TAKE_PICTURE_ID) {
          setTryOnBusy(true);
          setTryOnStatus('Capturing image...');
          captureFlowActiveRef.current = true;
          setShowCamera(true);
          setCameraError(null);
          void triggerCameraCapture({
            countdown_seconds: 3,
            source: 'virtual-try-on-menu',
            session_id: `virtual-tryon-${Date.now()}`,
          })
            .then(async () => {
              const rows = await getPersonImages().catch(() => []);
              const latestId = rows[0]?.id ?? null;
              if (latestId !== null) {
                setLatestPersonImageUrl(`${getApiBase()}/tryon/person-image/${latestId}?t=${Date.now()}`);
              }
              setTryOnStatus('Picture captured');
              setTryOnBusy(false);
            })
            .catch((error: unknown) => {
              const message = error instanceof Error ? error.message : 'Take picture failed';
              setTryOnStatus(message);
              setTryOnBusy(false);
              logMenu('outfit_take_picture_failed', { message }, 'error');
            });
          return;
        }
        if (actionId === OUTFIT_PANEL_VIEW_PICTURE_ID) {
          if (!latestPersonImageUrl) {
            setTryOnStatus('No captured picture yet');
            return;
          }
          setFullScreenTryOnUrl(latestPersonImageUrl);
          setTryOnStatus('Viewing captured picture');
          return;
        }
        if (actionId === OUTFIT_PANEL_GENERATE_ID) {
          void runSelectedOutfitTryOn();
          return;
        }
        if (actionId === OUTFIT_PANEL_SAVE_FAVORITE_ID) {
          void saveSelectedOutfitAsFavorite();
          return;
        }
        if (actionId === OUTFIT_PANEL_FAVORITE_NEXT_ID) {
          if (!outfitFavorites.length) {
            setTryOnStatus('No favorites saved yet');
            return;
          }
          setSelectedFavoriteIndex((prev) => (prev + 1) % outfitFavorites.length);
          return;
        }
        if (actionId === OUTFIT_PANEL_LOAD_FAVORITE_ID) {
          if (!selectedFavorite) {
            setTryOnStatus('No favorite selected');
            return;
          }
          loadFavoriteSnapshot(selectedFavorite);
          return;
        }
        if (actionId === OUTFIT_PANEL_BACK_ID) {
          setLayerRef.current('main', { resetIndex: false });
          return;
        }
        if (actionId === OUTFIT_PANEL_EXIT_ID) {
          closeMenuRef.current();
          return;
        }
        return;
      }

      if (layer === 'outfit_selection') {
        if (actionId === OUTFIT_SELECTION_BACK_ID) {
          setLayerRef.current('outfit_panel', { resetIndex: false });
          return;
        }
        if (actionId === OUTFIT_SELECTION_EXIT_ID) {
          closeMenuRef.current();
          return;
        }
        if (actionId.startsWith('outfit_selection:image:')) {
          const imageId = Number(actionId.replace('outfit_selection:image:', ''));
          if (!Number.isFinite(imageId)) return;
          setSelectedClothingImageIds((prev) => {
            if (prev.includes(imageId)) {
              return prev.filter((id) => id !== imageId);
            }
            return [...prev, imageId];
          });
          return;
        }
        return;
      }

      if (layer === 'outfit_favorites') {
        if (actionId === OUTFIT_FAVORITES_BACK_ID) {
          setLayerRef.current('outfit_panel', { resetIndex: false });
          return;
        }
        if (actionId === OUTFIT_FAVORITES_EXIT_ID) {
          closeMenuRef.current();
          return;
        }
        if (actionId.startsWith('outfit_favorites:load:')) {
          const favoriteId = actionId.replace('outfit_favorites:load:', '');
          const found = outfitFavorites.find((entry) => entry.id === favoriteId);
          if (!found) return;
          setSelectedClothingImageIds(found.clothingImageIds);
          setTryOnStatus(`Loaded ${found.name}`);
          setLayerRef.current('outfit_panel', { resetIndex: false });
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
      clothingItems,
      clothingLoading,
      loadClothingCatalog,
      refreshLatestPersonImage,
      pendingWidgetDraft,
      logMenu,
      outfitFavorites,
      latestPersonImageUrl,
      selectedFavorite,
      loadFavoriteSnapshot,
      randomizeWidgets,
      runSelectedOutfitTryOn,
      saveSelectedOutfitAsFavorite,
      shuffleOutfitSelection,
      navigate,
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
    if (menuNavigation.layer === 'outfit_panel') return outfitPanelItems;
    if (menuNavigation.layer === 'outfit_selection') return outfitSelectionItems;
    if (menuNavigation.layer === 'outfit_favorites') return outfitFavoritesItems;
    return MENU_ITEMS;
  }, [
    menuNavigation.layer,
    outfitFavoritesItems,
    outfitPanelItems,
    outfitSelectionItems,
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
      menuNavigation.layer === 'theme_background_list' ||
      menuNavigation.layer === 'outfit_panel' ||
      menuNavigation.layer === 'outfit_selection' ||
      menuNavigation.layer === 'outfit_favorites'
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
                : menuNavigation.layer === 'outfit_panel'
                  ? 'VIRTUAL TRY-ON'
                  : menuNavigation.layer === 'outfit_selection'
                    ? 'SELECT CLOTHING'
                    : menuNavigation.layer === 'outfit_favorites'
                      ? 'OUTFIT FAVORITES'
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
    dismissAuthOverlay: () => {
      if (pendingAuth) {
        void cancelPendingAuth();
      }
    },
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

      {menuNavigation.isOpen && menuNavigation.layer === 'outfit_panel' ? (
        <div className="virtual-tryon-overlay" role="dialog" aria-modal="true" aria-label="Virtual try-on menu">
          <div className="virtual-tryon-panel">
            <header className="virtual-tryon-title">Virtual Try-On Menu</header>
            <div className="virtual-tryon-layout">
              <div className="virtual-tryon-camera-col">
                <div className="virtual-tryon-camera-preview">
                  {latestPersonImageUrl ? (
                    <img src={latestPersonImageUrl} alt="Stored camera photo" referrerPolicy="no-referrer" />
                  ) : (
                    <span>Stored camera photo</span>
                  )}
                </div>
                <div className="virtual-tryon-actions">
                  <button type="button" className={`virtual-tryon-action${activeActionId === OUTFIT_PANEL_SAVE_FAVORITE_ID ? ' is-active' : ''}`}>Favorite</button>
                  <button type="button" className={`virtual-tryon-action${activeActionId === OUTFIT_PANEL_SHUFFLE_ID ? ' is-active' : ''}`}>Randomize</button>
                  <button type="button" className={`virtual-tryon-action${activeActionId === OUTFIT_PANEL_TAKE_PICTURE_ID ? ' is-active' : ''}`}>Take Picture</button>
                  <button type="button" className={`virtual-tryon-action${activeActionId === OUTFIT_PANEL_VIEW_PICTURE_ID ? ' is-active' : ''}`}>View Picture</button>
                  <button type="button" className={`virtual-tryon-action${activeActionId === OUTFIT_PANEL_GENERATE_ID ? ' is-active' : ''}`}>Generate</button>
                </div>
                <div className="virtual-tryon-favorite-picker">
                  <button type="button" className={`virtual-tryon-action${activeActionId === OUTFIT_PANEL_FAVORITE_NEXT_ID ? ' is-active' : ''}`}>Favorite Selector</button>
                  <button type="button" className={`virtual-tryon-action${activeActionId === OUTFIT_PANEL_LOAD_FAVORITE_ID ? ' is-active' : ''}`}>Load Favorite</button>
                  <div className="virtual-tryon-favorite-name">
                    {selectedFavorite ? selectedFavorite.name : 'No favorites yet'}
                  </div>
                </div>
              </div>
              <div className="virtual-tryon-slots">
                <div className="virtual-tryon-slot-row">
                  <div className="virtual-tryon-arrows">
                    <button type="button" className={`virtual-tryon-arrow${activeActionId === OUTFIT_PANEL_TOP_UP_ID ? ' is-active' : ''}`}><ChevronUp size={26} /></button>
                    <button type="button" className={`virtual-tryon-arrow${activeActionId === OUTFIT_PANEL_TOP_DOWN_ID ? ' is-active' : ''}`}><ChevronDown size={26} /></button>
                  </div>
                  <div className="virtual-tryon-preview">
                    {selectedSlotItems.top?.imageUrl ? <img src={selectedSlotItems.top.imageUrl} alt="Top clothing preview" referrerPolicy="no-referrer" /> : <span>No top item</span>}
                  </div>
                </div>
                <div className="virtual-tryon-slot-row">
                  <div className="virtual-tryon-arrows">
                    <button type="button" className={`virtual-tryon-arrow${activeActionId === OUTFIT_PANEL_BOTTOM_UP_ID ? ' is-active' : ''}`}><ChevronUp size={26} /></button>
                    <button type="button" className={`virtual-tryon-arrow${activeActionId === OUTFIT_PANEL_BOTTOM_DOWN_ID ? ' is-active' : ''}`}><ChevronDown size={26} /></button>
                  </div>
                  <div className="virtual-tryon-preview">
                    {selectedSlotItems.bottom?.imageUrl ? <img src={selectedSlotItems.bottom.imageUrl} alt="Bottom clothing preview" referrerPolicy="no-referrer" /> : <span>No bottom item</span>}
                  </div>
                </div>
                <div className="virtual-tryon-slot-row">
                  <div className="virtual-tryon-arrows">
                    <button type="button" className={`virtual-tryon-arrow${activeActionId === OUTFIT_PANEL_ACCESSORIES_UP_ID ? ' is-active' : ''}`}><ChevronUp size={26} /></button>
                    <button type="button" className={`virtual-tryon-arrow${activeActionId === OUTFIT_PANEL_ACCESSORIES_DOWN_ID ? ' is-active' : ''}`}><ChevronDown size={26} /></button>
                  </div>
                  <div className="virtual-tryon-preview">
                    {selectedSlotItems.accessories?.imageUrl ? <img src={selectedSlotItems.accessories.imageUrl} alt="Accessories clothing preview" referrerPolicy="no-referrer" /> : <span>No accessories item</span>}
                  </div>
                </div>
              </div>
            </div>
            <div className="virtual-tryon-status">{tryOnStatus ?? (clothingLoading ? 'Loading Cloudinary clothing...' : 'Ready')}</div>
            <div className="virtual-tryon-footer">
              <button type="button" className={`virtual-tryon-action${activeActionId === OUTFIT_PANEL_BACK_ID ? ' is-active' : ''}`}>Back</button>
              <button type="button" className={`virtual-tryon-action${activeActionId === OUTFIT_PANEL_EXIT_ID ? ' is-active' : ''}`}>Exit</button>
            </div>
          </div>
        </div>
      ) : (
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
      )}

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
