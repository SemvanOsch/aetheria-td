import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameProvider } from './application/store';
import { App } from './ui/App';
import { EnemyStats } from './ui/screens/EnemyStats';
import { ChampionStats, findChampion } from './ui/screens/ChampionStats';
import { ChampionStatDetail } from './ui/screens/ChampionStatDetail';
import { StageStats } from './ui/screens/StageStats';
import './ui/styles.css';

// Developer-only enemy, champion & stage stat sheets, kept out of the game UI.
// Reach them with the `#enemies`/`#champions`/`#stages` hash, `npm run
// enemies`/`champions`/`stages`, or `enemyStats()`/`championStats()`/
// `stageStats()` in the browser console.
declare global {
  interface Window {
    enemyStats: () => void;
    championStats: () => void;
    stageStats: () => void;
  }
}
window.enemyStats = () => {
  location.hash = 'enemies';
};
window.championStats = () => {
  location.hash = 'champions';
};
window.stageStats = () => {
  location.hash = 'stages';
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
  if (hash === '#stages') return <StageStats />;
  if (hash.startsWith('#champions/')) {
    const unit = findChampion(decodeURIComponent(hash.slice('#champions/'.length)));
    return unit ? <ChampionStatDetail key={hash} unit={unit} /> : <ChampionStats />;
  }
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
