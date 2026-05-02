import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

type TryOnNotice = {
  id: string;
  generationId: string;
  imageUrl: string;
};

export function TryOnNotificationHost() {
  const [queue, setQueue] = useState<TryOnNotice[]>([]);
  const navigate = useNavigate();
  const location = useLocation();

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
    if (!queue.length) return;
    const timer = window.setTimeout(() => {
      setQueue((prev) => prev.slice(1));
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [queue]);

  const active = queue[0];
  if (!active) return null;
  const inTryOnRoute = location.pathname.includes('/virtual-try-on');

  return (
    <div className="fixed top-5 right-5 z-[140] max-w-sm rounded-xl border border-cyan-300/50 bg-black/80 px-4 py-3 shadow-[0_12px_35px_rgba(0,0,0,0.5)] backdrop-blur-md">
      <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-200">Virtual Try-On Ready</div>
      <div className="mt-1 text-sm text-white/90">Generation #{active.generationId} completed.</div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          className="rounded-md border border-cyan-300/60 bg-cyan-400/20 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-cyan-100"
          onClick={() => {
            if (!inTryOnRoute) navigate('/virtual-try-on');
            window.dispatchEvent(new CustomEvent('mirror:tryon_open_result', { detail: { image_url: active.imageUrl } }));
            setQueue((prev) => prev.slice(1));
          }}
        >
          View Now
        </button>
        <button
          type="button"
          className="rounded-md border border-white/25 bg-white/10 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-white/85"
          onClick={() => setQueue((prev) => prev.slice(1))}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
