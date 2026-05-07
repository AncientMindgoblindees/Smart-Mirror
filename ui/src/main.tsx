import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppRouter } from '@/app/AppRouter';
import '@/index.css';

// Hide cursor immediately, multiple times to ensure it sticks
document.documentElement.style.cursor = "none";
document.body.style.cursor = "none";
const root = document.getElementById('root');
if (root) root.style.cursor = "none";

// Force it again right before React renders
setTimeout(() => {
  document.documentElement.style.cursor = "none";
  document.body.style.cursor = "none";
  if (root) root.style.cursor = "none";
}, 0);

// Then render your app
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>,
)