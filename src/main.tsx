import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameProvider } from './application/store';
import { App } from './ui/App';
import { EnemyStats } from './ui/screens/EnemyStats';
import { ChampionStats } from './ui/screens/ChampionStats';
import './ui/styles.css';

// Developer-only enemy & champion stat sheets, kept out of the game UI. Reach
// them with the `#enemies`/`#champions` hash, `npm run enemies`/`champions`, or
// `enemyStats()`/`championStats()` in the browser console.
declare global {
  interface Window {
    enemyStats: () => void;
    championStats: () => void;
  }
}
window.enemyStats = () => {
  location.hash = 'enemies';
};
window.championStats = () => {
  location.hash = 'champions';
};

function Root() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onHash = () => setHash(location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  if (hash === '#enemies') return <EnemyStats />;
  if (hash === '#champions') return <ChampionStats />;
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
