import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { generateOutfitTryOn, getClothingItems, updateClothingItem, uploadPersonImage } from '@/api/mirrorApi';
import type { ClothingItemRead } from '@/api/backendTypes';
import { useControlEvents } from '@/hooks/useControlEvents';
import CameraView from './CameraView';
import MirrorUI from './MirrorUI';
import type { FashionItem } from './types';
import { toFashionItems } from './constants';

const FAVORITES_KEY = 'mirror:outfit-favorites';
const TRYON_MAX_GENERATE_ATTEMPTS = 2;
const CAPTURE_COUNTDOWN_SECONDS = 3;

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

async function bridgeCaptureToBlob(payload: Blob | string | Uint8Array): Promise<Blob> {
  if (payload instanceof Blob) return payload;
  if (typeof payload === 'string') {
    const res = await fetch(payload);
    if (!res.ok) throw new Error('Native camera returned invalid data URL');
    const blob = await res.blob();
    return blob;
  }
  return new Blob([payload], { type: 'image/jpeg' });
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
  const [statusText, setStatusText] = useState<string | null>('Loading catalog...');
  const [cameraPhase, setCameraPhase] = useState<'idle' | 'loading' | 'countdown' | 'captured' | 'generating' | 'error'>('idle');
  const [cameraSourceMode, setCameraSourceMode] = useState<'bridge' | 'browser'>('browser');
  const [backendSourceLabel, setBackendSourceLabel] = useState<'picamera2' | 'rpicam' | 'none' | string>('none');
  const [countdownRemaining, setCountdownRemaining] = useState<number>(CAPTURE_COUNTDOWN_SECONDS);
  const localCountdownActiveRef = useRef(false);
  const generateInFlightRef = useRef(false);

  const fashionItems = useMemo(() => toFashionItems(catalogRows), [catalogRows]);

  useControlEvents({
    onCameraLoadingStarted: () => {
      logFlow('ws_camera_loading_started');
      setCameraPhase('loading');
      setStatusText('Starting camera...');
    },
    onCameraLoadingReady: () => {
      logFlow('ws_camera_loading_ready');
      setCameraPhase('loading');
      setStatusText('Camera ready');
    },
    onCameraCountdownStarted: (seconds) => {
      logFlow('ws_camera_countdown_started', { seconds });
      if (localCountdownActiveRef.current) return;
      setCameraPhase('countdown');
      setCountdownRemaining(seconds);
      setStatusText('Hold still');
    },
    onCameraCountdownTick: (remaining) => {
      logFlow('ws_camera_countdown_tick', { remaining });
      if (localCountdownActiveRef.current) return;
      setCameraPhase('countdown');
      setCountdownRemaining(remaining);
    },
    onCameraCaptured: () => {
      logFlow('ws_camera_captured');
      if (localCountdownActiveRef.current) return;
      setCameraPhase('captured');
      setCountdownRemaining(0);
      setStatusText('Photo captured');
    },
    onCameraError: (message) => {
      logFlow('ws_camera_error', { message });
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
    let cancelled = false;
    const bridge = window.smartMirrorCamera;
    const start = async () => {
      if (!bridge) {
        setCameraSourceMode('browser');
        setBackendSourceLabel('none');
        console.info('[virtual-tryon-camera]', { decision: 'browser_camera_fallback', reason: 'native_bridge_missing' });
        return;
      }
      try {
        const status = (await bridge.getStatus?.()) ?? { available: true, preferredSource: 'picamera2' };
        if (cancelled) return;
        if (!status.available) {
          setCameraSourceMode('browser');
          setBackendSourceLabel('none');
          console.info('[virtual-tryon-camera]', { decision: 'browser_camera_fallback', reason: 'native_bridge_unavailable' });
          return;
        }
        try {
          await bridge.startPreview?.();
        } catch (previewErr: unknown) {
          console.warn('[virtual-tryon-camera]', {
            decision: 'native_bridge_camera',
            preview_start: 'failed_continuing_with_native_capture',
            reason: previewErr instanceof Error ? previewErr.message : String(previewErr),
          });
        }
        if (cancelled) return;
        setCameraSourceMode('bridge');
        setBackendSourceLabel(status.preferredSource ?? 'picamera2');
        console.info('[virtual-tryon-camera]', {
          decision: 'native_bridge_camera',
          preferred_source: status.preferredSource ?? 'picamera2',
          camera_api_route: 'bypassed',
        });
      } catch (error: unknown) {
        if (cancelled) return;
        setCameraSourceMode('browser');
        setBackendSourceLabel('none');
        console.warn('[virtual-tryon-camera]', {
          decision: 'browser_camera_fallback',
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    };
    void start();
    return () => {
      cancelled = true;
      void bridge?.stopPreview?.();
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
      const preferBridgeCapture = cameraSourceMode === 'bridge' && !!window.smartMirrorCamera?.capturePhoto;
      logFlow(preferBridgeCapture ? 'native_bridge_capture_mode' : 'browser_camera_capture_mode', {
        source: preferBridgeCapture ? backendSourceLabel : 'browser',
      });
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

      if (!preferBridgeCapture) {
        const blob = await captureLocalWebcamBlob();
        logFlow('local_webcam_snapshot_captured', { bytes: blob.size });
        await uploadPersonImage(blob, `virtual-tryon-${Date.now()}.jpg`);
        logFlow('local_webcam_snapshot_uploaded');
        setStatusText('Photo captured');
      } else {
        const payload = await window.smartMirrorCamera!.capturePhoto!({ countdownSeconds: CAPTURE_COUNTDOWN_SECONDS });
        const blob = await bridgeCaptureToBlob(payload);
        logFlow('native_bridge_snapshot_captured', { bytes: blob.size, source: backendSourceLabel });
        await uploadPersonImage(blob, `virtual-tryon-native-${Date.now()}.jpg`);
        logFlow('native_bridge_snapshot_uploaded');
        setStatusText('Photo captured');
      }

      setStatusText('Mapping digital twin...');
      setCameraPhase('generating');
      logFlow('tryon_generate_start');
      let result: Awaited<ReturnType<typeof generateOutfitTryOn>> | null = null;
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= TRYON_MAX_GENERATE_ATTEMPTS; attempt += 1) {
        try {
          const attemptStart = performance.now();
          result = await generateOutfitTryOn({ clothing_image_ids: selectedImageIds });
          logFlow('tryon_generate_attempt_success', {
            attempt,
            duration_ms: Math.round(performance.now() - attemptStart),
            generation_id: result.generation_id,
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

      setResultImageUrl(result.image_url);
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
  }, [backendSourceLabel, cameraSourceMode, logFlow, selectedItems]);

  const fallbackImage = (Object.values(selectedItems).find((item) => item !== null) as FashionItem | undefined)?.image ?? null;
  const resultImage = resultImageUrl ?? fallbackImage;

  return (
    <main className="w-full h-screen bg-black relative">
      <div className="absolute inset-0 z-0">
        <CameraView hidden={showResult} sourceMode={cameraSourceMode} backendSourceLabel={backendSourceLabel} />

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

      {isGenerating && (cameraPhase === 'loading' || cameraPhase === 'countdown') && (
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
