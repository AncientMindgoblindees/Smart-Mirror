import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import MirrorApp from '@/app/MirrorApp';
import { VirtualTryOnPage } from '@/features/tryon/VirtualTryOnPage';

export function AppRouter() {
  const basename = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return (
    <BrowserRouter basename={basename || '/'}>
      <Routes>
        <Route path="/" element={<MirrorApp />} />
        <Route path="/virtual-try-on" element={<VirtualTryOnPage />} />
        <Route path="*" element={<MirrorApp />} />
      </Routes>
    </BrowserRouter>
  );
}
