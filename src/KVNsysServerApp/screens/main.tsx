import '@kvnsys/ui/styles.css';
import { ToastProvider } from '@kvnsys/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Dashboard } from './Dashboard';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <Dashboard />
    </ToastProvider>
  </StrictMode>,
);
