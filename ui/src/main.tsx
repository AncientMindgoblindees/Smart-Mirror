import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppRouter } from '@/app/AppRouter';
import '@/index.css';

// Hide cursor immediately on load
document.documentElement.style.cursor = "none";
document.body.style.cursor = "none";

// Then render your app
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>,
)