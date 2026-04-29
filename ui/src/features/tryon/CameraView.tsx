import { useEffect, useRef, useState } from 'react';
import { CameraOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CameraViewProps {
  hidden?: boolean;
  sourceMode: 'bridge' | 'browser';
  backendSourceLabel?: 'picamera2' | 'rpicam' | 'none' | string;
}

export default function CameraView({ hidden, sourceMode, backendSourceLabel }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const bridgeVideoRef = useRef<HTMLVideoElement | null>(null);
  const [bridgeStreamUrl, setBridgeStreamUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (sourceMode !== 'browser' || hidden) {
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
          video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
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
  }, [hidden, sourceMode]);

  useEffect(() => {
    if (sourceMode !== 'bridge' || hidden) return;
    let cancelled = false;
    const start = async () => {
      try {
        const url = await window.smartMirrorCamera?.getPreviewStreamUrl?.();
        if (cancelled || !url) return;
        setBridgeStreamUrl(url);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Native camera preview failed');
      }
    };
    void start();
    return () => {
      cancelled = true;
      setBridgeStreamUrl(null);
    };
  }, [hidden, sourceMode]);

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

      {!hidden && sourceMode === 'browser' ? (
        <video
          id="virtual-tryon-local-feed"
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-opacity duration-1000 ${isReady ? 'opacity-100 scale-x-[-1]' : 'opacity-0'}`}
          aria-label="Local webcam feed"
        />
      ) : null}

      {!hidden && sourceMode === 'bridge' && bridgeStreamUrl ? (
        <video
          ref={bridgeVideoRef}
          src={bridgeStreamUrl}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-opacity duration-1000 ${isReady ? 'opacity-100 scale-x-[-1]' : 'opacity-0'}`}
          onLoadedData={() => {
            setIsReady(true);
            setError(null);
          }}
          onError={() => {
            setIsReady(false);
            setError(`Native H264 stream unavailable (${backendSourceLabel || 'bridge'}).`);
          }}
        />
      ) : null}
    </div>
  );
}
