import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { generateTryOn, getClothingItems, getTryOnGeneration, updateClothingItem, uploadPersonImage } from '@/api/mirrorApi';
import type { ClothingItemRead } from '@/api/backendTypes';
import { useControlEvents } from '@/hooks/useControlEvents';
import CameraView from './CameraView';
import MirrorUI from './MirrorUI';
import type { FashionItem } from './types';
import { toFashionItems } from './constants';

const FAVORITES_KEY = 'mirror:outfit-favorites';
const TRYON_MAX_GENERATE_ATTEMPTS = 2;
const CAPTURE_COUNTDOWN_SECONDS = 3;
const TRYON_POLL_INTERVAL_MS = 1500;
const TRYON_POLL_TIMEOUT_MS = 8 * 60 * 1000;
const TRYON_HISTORY_LIMIT = 10;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function imageIdsFromSelection(selection: Record<string, FashionItem | null>): number[] {
  return Object.values(selection)
    .filter((item): item is FashionItem => item !== null)
    .map((item) => item.sourceImageId);
}

function tryOnPayloadFromSelection(selection: Record<string, FashionItem | null>, personImageId: number) {
  const payload = {
    person_image_id: personImageId,
    pants_image_id: null as number | null,
    shirt_image_id: null as number | null,
    shoes_image_id: null as number | null,
    hat_image_id: null as number | null,
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

async function captureLocalWebcamBlob(): Promise<Blob> {
  const video = document.getElementById('virtual-tryon-local-feed') as HTMLVideoElement | null;
  if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
    throw new Error('Local webcam feed not ready');
  }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new Error('Failed to capture webcam frame');
  return blob;
}

export function VirtualTryOnPage() {
  const perfZeroRef = useRef<number>(performance.now());
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
  const [tryOnHistory, setTryOnHistory] = useState<string[]>([]);
  const [tryOnHistoryIndex, setTryOnHistoryIndex] = useState<number>(-1);
  const [statusText, setStatusText] = useState<string | null>('Loading catalog...');
  const [cameraPhase, setCameraPhase] = useState<'idle' | 'loading' | 'countdown' | 'captured' | 'generating' | 'error'>('idle');
  const [remoteCaptureActive, setRemoteCaptureActive] = useState(false);
  const [countdownRemaining, setCountdownRemaining] = useState<number>(CAPTURE_COUNTDOWN_SECONDS);
  const localCountdownActiveRef = useRef(false);
  const generateInFlightRef = useRef(false);

  const fashionItems = useMemo(() => toFashionItems(catalogRows), [catalogRows]);

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
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await getClothingItems({ includeImages: true });
        if (cancelled) return;
        setCatalogRows(rows);
        setStatusText('Ready');
      } catch (error: unknown) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Could not load catalog';
        setStatusText(message);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
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
    setStatusText('Capturing image...');
    setCameraPhase('loading');
    setCountdownRemaining(CAPTURE_COUNTDOWN_SECONDS);
    try {
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
      setStatusText('Photo captured');

      setStatusText('Mapping digital twin...');
      setCameraPhase('generating');
      logFlow('tryon_generate_start');
      let result: Awaited<ReturnType<typeof generateTryOn>> | null = null;
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= TRYON_MAX_GENERATE_ATTEMPTS; attempt += 1) {
        try {
          const attemptStart = performance.now();
          const queued = await generateTryOn(tryOnPayloadFromSelection(selectedItems, personImage.id));
          const pollStartedAt = performance.now();
          while (true) {
            if (performance.now() - pollStartedAt > TRYON_POLL_TIMEOUT_MS) {
              throw new Error('Try-on generation timed out');
            }
            result = await getTryOnGeneration(queued.id);
            if (result.status === 'completed' || result.status === 'failed') break;
            await sleep(TRYON_POLL_INTERVAL_MS);
          }
          logFlow('tryon_generate_attempt_success', {
            attempt,
            duration_ms: Math.round(performance.now() - attemptStart),
            generation_id: result.id,
          });
          break;
        } catch (error: unknown) {
          lastError = error;
          logFlow('tryon_generate_attempt_failed', {
            attempt,
            message: error instanceof Error ? error.message : String(error),
          });
          if (attempt < TRYON_MAX_GENERATE_ATTEMPTS) await sleep(1500);
        }
      }
      if (!result) {
        const message = lastError instanceof Error ? lastError.message : 'Try-on generation failed';
        throw new Error(message);
      }

      if (!result.result_image_url) {
        throw new Error(result.error_message ?? 'Try-on generation did not return an image');
      }

      const resultImageUrl = result.result_image_url;
      setResultImageUrl(resultImageUrl);
      setTryOnHistory((prev) => [resultImageUrl, ...prev.filter((url) => url !== resultImageUrl)].slice(0, TRYON_HISTORY_LIMIT));
      window.dispatchEvent(
        new CustomEvent('mirror:tryon_result', {
          detail: { generation_id: String(result.id), image_url: resultImageUrl },
        }),
      );
      setTryOnHistoryIndex(0);
      setShowResult(true);
      setStatusText('Synthesized environment ready');
      logFlow('flow_complete_success');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Try-on generation failed';
      setStatusText(message);
      setCameraPhase('error');
      logFlow('flow_failed', { message });
    } finally {
      localCountdownActiveRef.current = false;
      setIsGenerating(false);
      generateInFlightRef.current = false;
      logFlow('flow_finalized');
    }
  }, [logFlow, selectedItems]);

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
      setCapturedImageUrl(URL.createObjectURL(blob));
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
    setResultImageUrl(tryOnHistory[0]);
    setShowResult(true);
    setStatusText(`Viewing try-on 1/${tryOnHistory.length}`);
  }, [tryOnHistory]);

  const handleNextTryOn = useCallback(() => {
    if (!tryOnHistory.length) {
      setStatusText('No generated try-ons yet');
      return;
    }
    const next = (tryOnHistoryIndex + 1 + tryOnHistory.length) % tryOnHistory.length;
    setTryOnHistoryIndex(next);
    setResultImageUrl(tryOnHistory[next]);
    setShowResult(true);
    setStatusText(`Viewing try-on ${next + 1}/${tryOnHistory.length}`);
  }, [tryOnHistory, tryOnHistoryIndex]);

  const fallbackImage = (Object.values(selectedItems).find((item) => item !== null) as FashionItem | undefined)?.image ?? null;
  const resultImage = resultImageUrl ?? fallbackImage;

  return (
    <main className="w-full h-screen bg-black relative">
      <div className="absolute inset-0 z-0">
        <CameraView hidden={showResult} />

        <AnimatePresence>
          {showResult && resultImage && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-10">
              <img src={resultImage} className="w-full h-full object-cover grayscale-[20%] brightness-75" alt="Synthesis Result" />
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

      {isGenerating && cameraPhase === 'generating' && (
        <div className="absolute inset-0 z-50 bg-black/45 flex flex-col items-center justify-center font-mono">
          <div className="space-y-4 text-center">
            <div className="w-64 h-1 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                className="w-1/2 h-full bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,1)]"
              />
            </div>
            <p className="text-[10px] tracking-[1em] text-white/40 uppercase">Mapping Digital Twin</p>
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
