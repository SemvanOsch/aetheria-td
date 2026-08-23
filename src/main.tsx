import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GameProvider } from './application/store';
import { App } from './ui/App';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameProvider>
      <App />
    </GameProvider>
  </StrictMode>,
);
