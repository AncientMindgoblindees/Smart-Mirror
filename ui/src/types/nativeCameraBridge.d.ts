export {};

declare global {
  interface SmartMirrorCameraBridge {
    getStatus?: () => Promise<{
      available: boolean;
      preferredSource?: 'picamera2' | 'rpicam' | 'none' | string;
    }>;
    startPreview?: () => Promise<void>;
    stopPreview?: () => Promise<void>;
    capturePhoto?: (opts?: { countdownSeconds?: number }) => Promise<Blob | string | Uint8Array>;
    getPreviewFrame?: () => Promise<Blob | string | Uint8Array>;
  }

  interface Window {
    smartMirrorCamera?: SmartMirrorCameraBridge;
  }
}
