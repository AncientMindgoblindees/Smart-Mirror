import { useEffect, useState } from 'react';

type TryOnNotice = {
  id: string;
  generationId: string;
  imageUrl: string;
};

type TryOnFailure = {
  id: string;
  queueJobId: string;
  error: string;
};

export function TryOnNotificationHost() {
  const [queue, setQueue] = useState<TryOnNotice[]>([]);
  const [failureQueue, setFailureQueue] = useState<TryOnFailure[]>([]);

  useEffect(() => {
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent<{ generation_id?: string; image_url?: string }>).detail;
      const generationId = detail?.generation_id;
      const imageUrl = detail?.image_url;
      if (!generationId || !imageUrl) return;
      setQueue((prev) => {
        const deduped = prev.filter((item) => item.generationId !== generationId);
        return [...deduped, { id: `${generationId}-${Date.now()}`, generationId, imageUrl }];
      });
    };
    window.addEventListener('mirror:tryon_result', onResult as EventListener);
    return () => window.removeEventListener('mirror:tryon_result', onResult as EventListener);
  }, []);

  useEffect(() => {
    const onQueueUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; queue_job_id?: string; error?: string }>).detail;
      if (detail?.type !== 'failed') return;
      const queueJobId = detail?.queue_job_id;
      const error = detail?.error;
      if (!queueJobId) return;
      setFailureQueue((prev) => [...prev, { id: `${queueJobId}-${Date.now()}`, queueJobId, error: error || 'Unknown error' }]);
    };
    window.addEventListener('mirror:tryon_queue_update', onQueueUpdate as EventListener);
    return () => window.removeEventListener('mirror:tryon_queue_update', onQueueUpdate as EventListener);
  }, []);

  useEffect(() => {
    if (!queue.length) return;
    const timer = window.setTimeout(() => {
      setQueue((prev) => prev.slice(1));
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [queue]);

  useEffect(() => {
    if (!failureQueue.length) return;
    const timer = window.setTimeout(() => {
      setFailureQueue((prev) => prev.slice(1));
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [failureQueue]);

  const activeFailure = failureQueue[0];
  const activeSuccess = queue[0];

  // Prioritize showing failures
  if (activeFailure) {
    return (
      <div className="fixed top-5 right-5 z-[140] max-w-sm rounded-xl border border-red-300/50 bg-black/80 px-4 py-3 shadow-[0_12px_35px_rgba(0,0,0,0.5)] backdrop-blur-md">
        <div className="text-[10px] uppercase tracking-[0.24em] text-red-200">Virtual Try-On Error</div>
        <div className="mt-1 text-sm text-white/90">{activeFailure.error}</div>
        <div className="mt-2 text-xs text-white/60">Try again from Virtual Try-On.</div>
      </div>
    );
  }

  if (!activeSuccess) return null;

  return (
    <div className="fixed top-5 right-5 z-[140] max-w-sm rounded-xl border border-cyan-300/50 bg-black/80 px-4 py-3 shadow-[0_12px_35px_rgba(0,0,0,0.5)] backdrop-blur-md">
      <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-200">Virtual Try-On Ready</div>
      <div className="mt-1 text-sm text-white/90">Generation #{activeSuccess.generationId} completed.</div>
      <div className="mt-2 text-xs text-cyan-100/70">Open Virtual Try-On and use View Try-On.</div>
    </div>
  );
}
