/** Maps DOMException / Error from getUserMedia to user-facing text. */
export function getCameraErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return 'Camera blocked — allow permission in your browser settings.';
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return 'No camera found.';
    }
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      return 'Camera is in use by another app.';
    }
    return err.message || 'Could not open camera.';
  }
  if (err instanceof Error) return err.message;
  return 'Could not open camera.';
}
