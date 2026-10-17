import '@kvnsys/ui/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConnectScreen } from './connection/ConnectScreen';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConnectScreen />
  </StrictMode>,
);
