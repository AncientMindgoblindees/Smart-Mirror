/**
 * Camera feed service for mirror fullscreen mode.
 * Prefers provided stream URL and falls back to local camera device.
 */

/**
 * @typedef {{ stream_url?: string | null, mode?: string | null }} CameraSource
 */

/**
 * @param {HTMLVideoElement} videoEl
 * @param {{ preferredSource?: CameraSource | null, onStatus?: (status: string) => void }} options
 */
export async function startCameraFeed(videoEl, options = {}) {
  const { preferredSource = null, onStatus = () => {} } = options;
  if (!(videoEl instanceof HTMLVideoElement)) {
    throw new Error("Camera video element is required");
  }

  onStatus("starting");

  if (preferredSource && preferredSource.stream_url) {
    videoEl.srcObject = null;
    videoEl.src = preferredSource.stream_url;
    onStatus("stream-url");
    return () => {
      videoEl.pause();
      videoEl.removeAttribute("src");
      videoEl.load();
    };
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    onStatus("unsupported");
    throw new Error("Browser camera API unavailable");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "environment",
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  });

  videoEl.srcObject = stream;
  onStatus("live");

  return () => {
    stream.getTracks().forEach((track) => track.stop());
    videoEl.srcObject = null;
  };
}
