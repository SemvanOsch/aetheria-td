import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameProvider } from './application/store';
import { App } from './ui/App';
import { EnemyStats } from './ui/screens/EnemyStats';
import './ui/styles.css';

// Developer-only enemy stat sheet, kept out of the game UI. Reach it with the
// `#enemies` hash, `npm run enemies`, or `enemyStats()` in the browser console.
declare global {
  interface Window {
    enemyStats: () => void;
  }
}
window.enemyStats = () => {
  location.hash = 'enemies';
};

function Root() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onHash = () => setHash(location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  if (hash === '#enemies') return <EnemyStats />;
  return (
    <GameProvider>
      <App />
    </GameProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
