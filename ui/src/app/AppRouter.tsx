import React, { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import MirrorApp from '@/app/MirrorApp';
import { SleepPage } from '@/app/SleepPage';
import { VirtualTryOnPage } from '@/features/tryon/VirtualTryOnPage';
import { TryOnNotificationHost } from '@/app/TryOnNotificationHost';

export function AppRouter() {
  const basename = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

  useEffect(() => {
    document.documentElement.style.cursor = "none";
    document.body.style.cursor = "none";
    const root = document.getElementById("root");
    if (root) root.style.cursor = "none";
  }, []);

  return (
    <BrowserRouter basename={basename || '/'}>
      <TryOnNotificationHost />
      <Routes>
        <Route path="/" element={<MirrorApp />} />
        <Route path="/sleep" element={<SleepPage />} />
        <Route path="/virtual-try-on" element={<VirtualTryOnPage />} />
        <Route path="*" element={<MirrorApp />} />
      </Routes>
    </BrowserRouter>
  );
}