import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { cacheTryOnClothing, getClothingItems, getPersonImages, updateClothingItem, uploadPersonImage } from '@/api/mirrorApi';
import type { ClothingItemRead, TryOnRequest } from '@/api/backendTypes';
import { useControlEvents } from '@/hooks/useControlEvents';
import { enqueueTryOnGeneration, subscribeTryOnQueue, type TryOnQueueSnapshot } from '@/features/tryon/tryonQueue';
import CameraView from './CameraView';
import MirrorUI from './MirrorUI';
import type { FashionItem } from './types';
import { toFashionItems } from './constants';

const FAVORITES_KEY = 'mirror:outfit-favorites';
const TRYON_HISTORY_KEY = 'mirror:tryon-history';
const CAPTURE_COUNTDOWN_SECONDS = 8;
const TRYON_HISTORY_LIMIT = 10;
const CATALOG_REFRESH_INTERVAL_MS = 8000;
const TRYON_FRAME_WIDTH = 1440;
const TRYON_FRAME_HEIGHT = 2560;

type ConfirmKind = 'use_saved' | 'use_new';

type ConfirmState = {
  open: boolean;
  kind: ConfirmKind;
  prompt: string;
  yesLabel: string;
  noLabel: string;
};
type ConfirmChoice = 'yes' | 'no';

const DEFAULT_CONFIRM: ConfirmState = {
  open: false,
  kind: 'use_saved',
  prompt: '',
  yesLabel: 'Yes',
  noLabel: 'No',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function normalizeImageToTryOnFrame(sourceUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = TRYON_FRAME_WIDTH;
      canvas.height = TRYON_FRAME_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(sourceUrl);
        return;
      }
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const drawX = (canvas.width - drawW) / 2;
      const drawY = (canvas.height - drawH) / 2;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      resolve(dataUrl || sourceUrl);
    };
    img.onerror = () => resolve(sourceUrl);
    img.src = sourceUrl;
  });
}

function readFavoritesInitial(): Record<string, FashionItem | null>[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as Record<string, FashionItem | null>[];
  } catch {
    return [];
  }
}

function readTryOnHistoryInitial(): string[] {
  try {
    const raw = localStorage.getItem(TRYON_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string' && v.length > 0).slice(0, TRYON_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function imageIdsFromSelection(selection: Record<string, FashionItem | null>): number[] {
  return Object.values(selection)
    .filter((item): item is FashionItem => item !== null)
    .map((item) => item.sourceImageId);
}

function tryOnPayloadFromSelection(selection: Record<string, FashionItem | null>, personImageId: number): TryOnRequest {
  const payload: TryOnRequest = {
    person_image_id: personImageId,
    pants_image_id: null,
    shirt_image_id: null,
    shoes_image_id: null,
    hat_image_id: null,
  };
  for (const item of Object.values(selection)) {
    if (!item) continue;
    if (item.tryOnSlot === 'pants') payload.pants_image_id = item.sourceImageId;
    if (item.tryOnSlot === 'shirt') payload.shirt_image_id = item.sourceImageId;
    if (item.tryOnSlot === 'shoes') payload.shoes_image_id = item.sourceImageId;
    if (item.tryOnSlot === 'hat') payload.hat_image_id = item.sourceImageId;
  }
  return payload;
}

function reconcileSelectedItems(
  prev: Record<string, FashionItem | null>,
  nextItems: FashionItem[],
): Record<string, FashionItem | null> {
  const byImageId = new Map<number, FashionItem>(nextItems.map((item) => [item.sourceImageId, item]));
  return {
    TOP: prev.TOP ? byImageId.get(prev.TOP.sourceImageId) ?? null : null,
    BOTTOM: prev.BOTTOM ? byImageId.get(prev.BOTTOM.sourceImageId) ?? null : null,
    ACCESSORIES: prev.ACCESSORIES ? byImageId.get(prev.ACCESSORIES.sourceImageId) ?? null : null,
  };
}

async function captureLocalWebcamBlob(): Promise<Blob> {
  const video = document.getElementById('virtual-tryon-local-feed') as HTMLVideoElement | null;
  if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
    throw new Error('Local webcam feed not ready');
  }
  const canvas = document.createElement('canvas');
  canvas.width = TRYON_FRAME_WIDTH;
  canvas.height = TRYON_FRAME_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI);
  ctx.drawImage(video, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new Error('Failed to capture webcam frame');
  return blob;
}

export function VirtualTryOnPage() {
  const perfZeroRef = useRef<number>(performance.now());
  const confirmResolveRef = useRef<((value: boolean) => void) | null>(null);

  const logFlow = useCallback((event: string, details?: Record<string, unknown>) => {
    const t = performance.now();
    const elapsedMs = Math.round(t - perfZeroRef.current);
    const payload = {
      t_iso: new Date().toISOString(),
      t_elapsed_ms: elapsedMs,
      event,
      ...(details ?? {}),
    };
    console.info('[virtual-tryon-flow]', payload);
  }, []);

  const navigate = useNavigate();
  const [catalogRows, setCatalogRows] = useState<ClothingItemRead[]>([]);
  const [selectedItems, setSelectedItems] = useState<Record<string, FashionItem | null>>({
    TOP: null,
    BOTTOM: null,
    ACCESSORIES: null,
  });
  const [favoriteOutfits, setFavoriteOutfits] = useState<Record<string, FashionItem | null>[]>(readFavoritesInitial);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
  const [capturedImageUrl, setCapturedImageUrl] = useState<string | null>(null);
  const [tryOnHistory, setTryOnHistory] = useState<string[]>(readTryOnHistoryInitial);
  const [tryOnHistoryIndex, setTryOnHistoryIndex] = useState<number>(0);
  const [statusText, setStatusText] = useState<string | null>('Loading catalog...');
  const [cameraPhase, setCameraPhase] = useState<'idle' | 'loading' | 'countdown' | 'captured' | 'error'>('idle');
  const [remoteCaptureActive, setRemoteCaptureActive] = useState(false);
  const [countdownRemaining, setCountdownRemaining] = useState<number>(CAPTURE_COUNTDOWN_SECONDS);
  const [queueSnapshot, setQueueSnapshot] = useState<TryOnQueueSnapshot>({
    jobs: [],
    pendingCount: 0,
    runningCount: 0,
    completedCount: 0,
    failedCount: 0,
  });
  const [confirmState, setConfirmState] = useState<ConfirmState>(DEFAULT_CONFIRM);
  const [confirmChoice, setConfirmChoice] = useState<ConfirmChoice>('yes');

  const localCountdownActiveRef = useRef(false);
  const generateInFlightRef = useRef(false);

  const fashionItems = useMemo(() => toFashionItems(catalogRows), [catalogRows]);

  const askConfirm = useCallback((kind: ConfirmKind, prompt: string, yesLabel: string, noLabel: string): Promise<boolean> => {
    return new Promise((resolve) => {
      confirmResolveRef.current = resolve;
      setConfirmChoice('yes');
      setConfirmState({ open: true, kind, prompt, yesLabel, noLabel });
    });
  }, []);

  const closeConfirm = useCallback((answer: boolean) => {
    const resolve = confirmResolveRef.current;
    confirmResolveRef.current = null;
    setConfirmState(DEFAULT_CONFIRM);
    resolve?.(answer);
  }, []);

  useEffect(() => {
    if (!confirmState.open) return;
    const toggleChoice = () => setConfirmChoice((prev) => (prev === 'yes' ? 'no' : 'yes'));
    const confirmSelected = () => closeConfirm(confirmChoice === 'yes');
    const cancelConfirm = () => closeConfirm(false);

    const onKeyDown = (event: KeyboardEvent) => {
      if (!confirmState.open) return;
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        toggleChoice();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        confirmSelected();
        return;
      }
      if (event.key === 'Escape' || event.key.toLowerCase() === 'x') {
        event.preventDefault();
        cancelConfirm();
      }
    };

    const onMockButton = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string }>).detail;
      const action = String(detail?.action ?? '').toLowerCase();
      if (!action) return;
      if (action === 'up' || action === 'down') {
        toggleChoice();
        return;
      }
      if (action === 'enter') {
        confirmSelected();
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mirror:button', onMockButton as EventListener);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mirror:button', onMockButton as EventListener);
    };
  }, [closeConfirm, confirmChoice, confirmState.open]);

  useControlEvents({
    onCameraLoadingStarted: () => {
      logFlow('ws_camera_loading_started');
      setRemoteCaptureActive(true);
      setCameraPhase('loading');
      setStatusText('Starting camera...');
    },
    onCameraLoadingReady: () => {
      logFlow('ws_camera_loading_ready');
      setRemoteCaptureActive(true);
      setCameraPhase('loading');
      setStatusText('Camera ready');
    },
    onCameraCountdownStarted: (seconds) => {
      logFlow('ws_camera_countdown_started', { seconds });
      setRemoteCaptureActive(true);
      if (localCountdownActiveRef.current) return;
      setCameraPhase('countdown');
      setCountdownRemaining(seconds);
      setStatusText('Hold still');
    },
    onCameraCountdownTick: (remaining) => {
      logFlow('ws_camera_countdown_tick', { remaining });
      setRemoteCaptureActive(true);
      if (localCountdownActiveRef.current) return;
      setCameraPhase('countdown');
      setCountdownRemaining(remaining);
    },
    onCameraCaptured: () => {
      logFlow('ws_camera_captured');
      setRemoteCaptureActive(false);
      if (localCountdownActiveRef.current) return;
      setCameraPhase('captured');
      setCountdownRemaining(0);
      setStatusText('Photo captured');
    },
    onCameraError: (message) => {
      logFlow('ws_camera_error', { message });
      setRemoteCaptureActive(false);
      setCameraPhase('error');
      setStatusText(message || 'Camera error');
    },
  });

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteOutfits.slice(0, 40)));
    } catch {
      // ignore
    }
  }, [favoriteOutfits]);

  useEffect(() => {
    try {
      localStorage.setItem(TRYON_HISTORY_KEY, JSON.stringify(tryOnHistory.slice(0, TRYON_HISTORY_LIMIT)));
    } catch {
      // ignore
    }
  }, [tryOnHistory]);

  useEffect(() => {
    let cancelled = false;

    const refreshCatalog = async (reason: 'initial' | 'interval' | 'focus') => {
      try {
        const rows = await getClothingItems({ includeImages: true });
        if (cancelled) return;
        setCatalogRows(rows);
        const remapped = toFashionItems(rows);
        setSelectedItems((prev) => reconcileSelectedItems(prev, remapped));
        if (reason === 'initial') setStatusText('Ready');
      } catch (error: unknown) {
        if (cancelled) return;
        if (reason === 'initial') {
          const message = error instanceof Error ? error.message : 'Could not load catalog';
          setStatusText(message);
        }
      }
    };

    const onFocusRefresh = () => {
      if (document.visibilityState === 'visible') {
        void refreshCatalog('focus');
      }
    };

    void refreshCatalog('initial');
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshCatalog('interval');
      }
    }, CATALOG_REFRESH_INTERVAL_MS);
    window.addEventListener('focus', onFocusRefresh);
    document.addEventListener('visibilitychange', onFocusRefresh);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocusRefresh);
      document.removeEventListener('visibilitychange', onFocusRefresh);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeTryOnQueue((next) => {
      setQueueSnapshot(next);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    return () => {
      if (capturedImageUrl?.startsWith('blob:')) URL.revokeObjectURL(capturedImageUrl);
    };
  }, [capturedImageUrl]);

  useEffect(() => {
    console.info('[virtual-tryon-camera]', {
      decision: 'browser_camera_forced',
      reason: 'chromium_mode',
    });
  }, []);

  useEffect(() => {
    const selectedIds = imageIdsFromSelection(selectedItems);
    if (!selectedIds.length) return;
    void cacheTryOnClothing(selectedIds)
      .then((result) => {
        const hits = result.cache_hit_image_ids.length;
        const misses = result.cloudinary_fetch_image_ids.length;
        const failed = result.cache_failed_image_ids.length;
        if (failed > 0) {
          setStatusText(`Cache failed for ${failed}; using Cloudinary fallback`);
        } else if (misses > 0) {
          setStatusText(`Cache miss ${misses}; fetched from Cloudinary`);
        } else if (hits > 0) {
          setStatusText(`Cache hit ${hits}`);
        }
      })
      .catch(() => {
        setStatusText('Cache request failed; using Cloudinary fallback');
      });
  }, [selectedItems]);

  useEffect(() => {
    const onReady = (event: Event) => {
      const detail = (event as CustomEvent<{ image_url?: string }>).detail;
      const imageUrl = detail?.image_url;
      if (!imageUrl) return;
      void normalizeImageToTryOnFrame(imageUrl).then((normalizedUrl) => {
        setTryOnHistory((prev) => [imageUrl, ...prev.filter((url) => url !== imageUrl)].slice(0, TRYON_HISTORY_LIMIT));
        setTryOnHistoryIndex(0);
        setResultImageUrl(normalizedUrl);
        setStatusText('Try-on ready');
      });
    };

    const onOpenResult = (event: Event) => {
      const detail = (event as CustomEvent<{ image_url?: string }>).detail;
      const imageUrl = detail?.image_url;
      if (!imageUrl) return;
      void normalizeImageToTryOnFrame(imageUrl).then((normalizedUrl) => {
        setResultImageUrl(normalizedUrl);
        setShowResult(true);
        setStatusText('Viewing queued try-on result');
      });
    };

    window.addEventListener('mirror:tryon_result', onReady as EventListener);
    window.addEventListener('mirror:tryon_open_result', onOpenResult as EventListener);
    return () => {
      window.removeEventListener('mirror:tryon_result', onReady as EventListener);
      window.removeEventListener('mirror:tryon_open_result', onOpenResult as EventListener);
    };
  }, []);

  const handleToggleFavoriteOutfit = useCallback(async () => {
    const ids = imageIdsFromSelection(selectedItems);
    if (!ids.length) {
      setStatusText('Select at least one piece first');
      return;
    }
    setFavoriteOutfits((prev) => [...prev, { ...selectedItems }].slice(-40));
    const itemIds = Array.from(
      new Set(Object.values(selectedItems).filter((v): v is FashionItem => v !== null).map((v) => v.sourceItemId)),
    );
    try {
      await Promise.all(itemIds.map((id) => updateClothingItem(id, { favorite: true })));
      setStatusText('Saved look');
    } catch {
      setStatusText('Saved locally');
    }
  }, [selectedItems]);

  const handleLoadFavorite = useCallback((outfit: Record<string, FashionItem | null>) => {
    setSelectedItems(outfit);
    setStatusText('Loaded saved look');
  }, []);

  const handleSelectItem = useCallback((item: FashionItem | null, category: string) => {
    if (item?.sourceImageId) {
      void cacheTryOnClothing([item.sourceImageId]).catch(() => {});
    }
    setSelectedItems((prev) => ({ ...prev, [category]: item }));
  }, []);

  const handleGenerate = useCallback(async () => {
    if (generateInFlightRef.current) return;
    const selectedImageIds = imageIdsFromSelection(selectedItems);
    if (!selectedImageIds.length) {
      setStatusText('Pick clothing before generate');
      return;
    }

    generateInFlightRef.current = true;
    perfZeroRef.current = performance.now();
    logFlow('generate_clicked', { selected_count: selectedImageIds.length });
    setIsGenerating(true);
    setShowResult(false);
    setResultImageUrl(null);
    setStatusText('Preparing image...');
    setCameraPhase('loading');
    setCountdownRemaining(CAPTURE_COUNTDOWN_SECONDS);

    try {
      let personImageId: number | null = null;
      try {
        const existing = await getPersonImages();
        const savedLatestId = existing[0]?.id ?? null;
        if (savedLatestId !== null) {
          const useSaved = await askConfirm('use_saved', 'Use your latest saved picture for this try-on?', 'Use Saved', 'Take New');
          if (useSaved) {
            personImageId = savedLatestId;
            setStatusText('Using saved image');
          }
        }
      } catch {
        // ignore and proceed to capture
      }

      if (personImageId === null) {
        logFlow('browser_camera_capture_mode');
        setCameraPhase('countdown');
        localCountdownActiveRef.current = true;
        for (let remaining = CAPTURE_COUNTDOWN_SECONDS; remaining > 0; remaining -= 1) {
          logFlow('local_countdown_tick', { remaining });
          setCountdownRemaining(remaining);
          setStatusText(`Taking photo in ${remaining}...`);
          await sleep(1000);
        }
        localCountdownActiveRef.current = false;
        logFlow('local_countdown_complete');

        const blob = await captureLocalWebcamBlob();
        logFlow('local_webcam_snapshot_captured', { bytes: blob.size });
        const personImage = await uploadPersonImage(blob, `virtual-tryon-${Date.now()}.jpg`);
        logFlow('local_webcam_snapshot_uploaded');
        const useNew = await askConfirm('use_new', 'Use this newly captured picture for generation?', 'Use Photo', 'Retake Later');
        if (!useNew) {
          setStatusText('Generation cancelled');
          return;
        }
        personImageId = personImage.id;
        setStatusText('Photo captured');
      }

      if (personImageId === null) {
        throw new Error('No person image available');
      }

      const enqueued = enqueueTryOnGeneration(tryOnPayloadFromSelection(selectedItems, personImageId));
      if (!enqueued.ok) {
        setStatusText('Queue is full (10 pending). Wait for completion before adding more.');
        return;
      }

      window.dispatchEvent(new CustomEvent('mirror:tryon_generation_started'));
      setCameraPhase('captured');
      setStatusText(`Queued try-on request (${enqueued.pendingCount} pending)`);
      logFlow('tryon_queued', { queue_job_id: enqueued.queueJobId, pending_count: enqueued.pendingCount });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Try-on generation failed';
      setStatusText(message);
      setCameraPhase('error');
      logFlow('flow_failed', { message });
    } finally {
      localCountdownActiveRef.current = false;
      setIsGenerating(false);
      generateInFlightRef.current = false;
      window.dispatchEvent(new CustomEvent('mirror:tryon_generation_completed'));
      logFlow('flow_finalized');
    }
  }, [askConfirm, logFlow, selectedItems]);

  const handleTakePicture = useCallback(async () => {
    if (generateInFlightRef.current) return;
    generateInFlightRef.current = true;
    setIsGenerating(true);
    setCameraPhase('loading');
    setCountdownRemaining(CAPTURE_COUNTDOWN_SECONDS);
    setStatusText('Capturing image...');
    try {
      for (let remaining = CAPTURE_COUNTDOWN_SECONDS; remaining > 0; remaining -= 1) {
        setCameraPhase('countdown');
        setCountdownRemaining(remaining);
        setStatusText(`Taking photo in ${remaining}...`);
        await sleep(1000);
      }
      const blob = await captureLocalWebcamBlob();
      await uploadPersonImage(blob, `virtual-tryon-${Date.now()}.jpg`);
      if (capturedImageUrl?.startsWith('blob:')) URL.revokeObjectURL(capturedImageUrl);
      const capturedUrl = URL.createObjectURL(blob);
      const normalizedCaptured = await normalizeImageToTryOnFrame(capturedUrl);
      if (capturedUrl.startsWith('blob:')) URL.revokeObjectURL(capturedUrl);
      setCapturedImageUrl(normalizedCaptured);
      setStatusText('Picture captured');
      setCameraPhase('captured');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Take picture failed';
      setStatusText(message);
      setCameraPhase('error');
    } finally {
      setIsGenerating(false);
      generateInFlightRef.current = false;
    }
  }, [capturedImageUrl]);

  const handleViewPicture = useCallback(() => {
    if (!capturedImageUrl) {
      setStatusText('No captured picture yet');
      return;
    }
    setResultImageUrl(capturedImageUrl);
    setShowResult(true);
    setStatusText('Viewing captured picture');
  }, [capturedImageUrl]);

  const handleViewTryOn = useCallback(() => {
    if (!tryOnHistory.length) {
      setStatusText('No generated try-ons yet');
      return;
    }
    setTryOnHistoryIndex(0);
    void normalizeImageToTryOnFrame(tryOnHistory[0]).then((normalizedUrl) => {
      setResultImageUrl(normalizedUrl);
      setShowResult(true);
      setStatusText(`Viewing try-on 1/${tryOnHistory.length}`);
    });
  }, [tryOnHistory]);

  const handleNextTryOn = useCallback(() => {
    if (!tryOnHistory.length) {
      setStatusText('No generated try-ons yet');
      return;
    }
    const next = (tryOnHistoryIndex + 1 + tryOnHistory.length) % tryOnHistory.length;
    setTryOnHistoryIndex(next);
    void normalizeImageToTryOnFrame(tryOnHistory[next]).then((normalizedUrl) => {
      setResultImageUrl(normalizedUrl);
      setShowResult(true);
      setStatusText(`Viewing try-on ${next + 1}/${tryOnHistory.length}`);
    });
  }, [tryOnHistory, tryOnHistoryIndex]);

  const fallbackImage = (Object.values(selectedItems).find((item) => item !== null) as FashionItem | undefined)?.image ?? null;
  const resultImage = resultImageUrl ?? fallbackImage;

  return (
    <main className="w-full h-screen bg-black relative">
      <div className="absolute inset-0 z-0">
        <CameraView hidden={showResult} />

        <AnimatePresence>
          {showResult && resultImage && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-10 flex items-center justify-center">
              <img
                src={resultImage}
                width={TRYON_FRAME_WIDTH}
                height={TRYON_FRAME_HEIGHT}
                className="w-[1440px] h-[2560px] max-w-full max-h-full object-cover grayscale-[20%] brightness-75"
                alt="Synthesis Result"
              />
              <div className="absolute inset-0 shadow-[inset_0_0_150px_rgba(0,0,0,0.8)]" />
              <div className="absolute top-12 left-1/2 -translate-x-1/2 px-6 py-2 glass-morphism rounded-full border border-blue-500/30">
                <span className="font-mono text-[10px] uppercase tracking-[0.6em] text-blue-400">Synthesized Environment</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {(isGenerating || remoteCaptureActive) && (cameraPhase === 'loading' || cameraPhase === 'countdown') && (
        <div className="absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center font-mono">
          <div className="space-y-4 text-center">
            {cameraPhase === 'loading' ? (
              <>
                <div className="w-12 h-12 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto" />
                <p className="text-[10px] tracking-[1em] text-white/40 uppercase">Initializing Camera</p>
              </>
            ) : (
              <>
                <div className="text-8xl font-bold text-white drop-shadow-[0_0_22px_rgba(59,130,246,0.85)]">{countdownRemaining || 1}</div>
                <p className="text-[10px] tracking-[1em] text-white/40 uppercase">Hold Still</p>
              </>
            )}
          </div>
        </div>
      )}

      {(queueSnapshot.runningCount > 0 || queueSnapshot.pendingCount > 0) && (
        <div className="absolute top-5 right-5 z-50 bg-black/70 border border-blue-500/40 rounded-xl px-4 py-3 font-mono pointer-events-none">
          <div className="w-44 h-1 bg-white/15 rounded-full overflow-hidden mb-2">
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: '100%' }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              className="w-1/2 h-full bg-blue-500"
            />
          </div>
          <p className="text-[9px] tracking-[0.35em] text-white/70 uppercase">Queue {queueSnapshot.pendingCount} Pending</p>
        </div>
      )}

      <div className="absolute top-5 left-5 z-50 rounded-full border border-cyan-300/40 bg-black/65 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-100">
        Q {queueSnapshot.pendingCount} | R {queueSnapshot.runningCount} | D {queueSnapshot.completedCount}
      </div>

      {confirmState.open && (
        <div className="absolute inset-0 z-[70] bg-black/65 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl border border-cyan-400/40 bg-black/85 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.65)]">
            <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-200">Virtual Try-On</div>
            <p className="mt-3 text-sm text-white/90">{confirmState.prompt}</p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                className={`flex-1 rounded-lg border px-3 py-2 text-xs uppercase tracking-[0.2em] ${
                  confirmChoice === 'yes'
                    ? 'border-cyan-300/90 bg-cyan-500/35 text-cyan-50'
                    : 'border-cyan-300/45 bg-cyan-500/15 text-cyan-100'
                }`}
                onClick={() => closeConfirm(true)}
              >
                {confirmState.yesLabel}
              </button>
              <button
                type="button"
                className={`flex-1 rounded-lg border px-3 py-2 text-xs uppercase tracking-[0.2em] ${
                  confirmChoice === 'no'
                    ? 'border-white/70 bg-white/25 text-white'
                    : 'border-white/20 bg-white/10 text-white/85'
                }`}
                onClick={() => closeConfirm(false)}
              >
                {confirmState.noLabel}
              </button>
            </div>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white/55">
              Use Up/Down to switch, Enter to select
            </p>
          </div>
        </div>
      )}

      <MirrorUI
        items={fashionItems}
        selectedItems={selectedItems}
        onSelectItem={handleSelectItem}
        favoritesCount={favoriteOutfits.length}
        favoriteOutfits={favoriteOutfits}
        onToggleFavorite={handleToggleFavoriteOutfit}
        onLoadFavorite={handleLoadFavorite}
        onTakePicture={handleTakePicture}
        onViewPicture={handleViewPicture}
        canViewPicture={!!capturedImageUrl}
        onViewTryOn={handleViewTryOn}
        onNextTryOn={handleNextTryOn}
        canViewTryOn={tryOnHistory.length > 0}
        tryOnCount={tryOnHistory.length}
        onGenerate={handleGenerate}
        onExit={() => navigate('/')}
        statusText={statusText}
        isLocked={isGenerating}
        showResult={showResult}
        onCloseResult={() => setShowResult(false)}
      />
    </main>
  );
}
