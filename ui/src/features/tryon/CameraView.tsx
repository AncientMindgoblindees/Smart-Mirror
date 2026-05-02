import { useEffect, useRef, useState } from 'react';
import { CameraOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const TRYON_FRAME_WIDTH = 1440;
const TRYON_FRAME_HEIGHT = 2560;

interface CameraViewProps {
  hidden?: boolean;
}

export default function CameraView({ hidden }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (hidden) {
      if (videoRef.current) videoRef.current.srcObject = null;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      return;
    }
    let cancelled = false;
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: TRYON_FRAME_WIDTH },
            height: { ideal: TRYON_FRAME_HEIGHT },
            aspectRatio: { ideal: 9 / 16 },
          } as MediaTrackConstraints,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const track = stream.getVideoTracks()[0];
        if (track) {
          const caps = track.getCapabilities?.() as MediaTrackCapabilities & { zoom?: { min?: number; max?: number } };
          if (caps?.zoom) {
            const minZoom = typeof caps.zoom.min === 'number' ? caps.zoom.min : 1;
            await track.applyConstraints({ advanced: [{ zoom: Math.max(1, minZoom) } as MediaTrackConstraintSet] }).catch(() => {});
          }
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setError(null);
        setIsReady(true);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Browser camera access denied';
        setIsReady(false);
        setError(message);
      }
    };
    void start();
    return () => {
      cancelled = true;
      if (videoRef.current) videoRef.current.srcObject = null;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [hidden]);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden z-0">
      <AnimatePresence mode="wait">
        {!isReady && !error && !hidden && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center space-y-4"
          >
            <div className="w-12 h-12 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </motion.div>
        )}

        {error && !hidden && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center"
          >
            <div className="p-6 glass-morphism rounded-full mb-6">
              <CameraOff className="w-10 h-10 text-white/60" />
            </div>
            <h2 className="font-serif text-3xl mb-2 italic">Mirror Occluded</h2>
            <p className="text-white/40 max-w-sm font-sans font-light leading-relaxed">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {!hidden ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <video
            id="virtual-tryon-local-feed"
            ref={videoRef}
            autoPlay
            playsInline
            muted
            width={TRYON_FRAME_WIDTH}
            height={TRYON_FRAME_HEIGHT}
            className={`max-w-full max-h-full object-contain bg-black transition-opacity duration-1000 ${isReady ? 'opacity-100 scale-x-[-1] rotate-180' : 'opacity-0'}`}
            aria-label="Local webcam feed"
          />
        </div>
      ) : null}
    </div>
  );
}
