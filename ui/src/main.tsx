import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppRouter } from '@/app/AppRouter';
import '@/index.css';

const TRYON_STORAGE_KEYS = ['mirror:outfit-favorites', 'mirror:tryon-history'] as const;

function clearTryOnBrowserState() {
  try {
    for (const key of TRYON_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access failures in restricted browser contexts.
  }
}

// Hide cursor immediately
document.documentElement.style.cursor = "none";
document.body.style.cursor = "none";
const root = document.getElementById('root');
if (root) root.style.cursor = "none";

// Trigger a mouse move event to force cursor state application
const mouseMove = new MouseEvent('mousemove', {
  bubbles: true,
  cancelable: true,
  view: window
});
document.dispatchEvent(mouseMove);

// Force it again after event
setTimeout(() => {
  document.documentElement.style.cursor = "none";
  document.body.style.cursor = "none";
  if (root) root.style.cursor = "none";
}, 0);

clearTryOnBrowserState();

// Then render your app
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>,
)