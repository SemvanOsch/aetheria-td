import { useState } from 'react';
import type { Screen } from '../App';
import { useGame } from '../../application/gameContext';
import { Gems } from './Currency';
import { Settings } from './Settings';

interface Props {
  active: Screen;
  onNavigate: (screen: Screen) => void;
}

const TABS: { id: Screen; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'modes', label: 'Play' },
  { id: 'summon', label: 'Summon' },
  { id: 'collection', label: 'Champions' },
];

export function TopBar({ active, onNavigate }: Props) {
  const { state } = useGame();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <header className="topbar">
      <button className="brand" onClick={() => onNavigate('home')}>
        <span>🛡️</span> Aetheria
      </button>
      <nav>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`nav-btn ${active === t.id ? 'active' : ''}`}
            onClick={() => onNavigate(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <Gems amount={state.gems} />
      <button
        className="settings-btn"
        onClick={() => setShowSettings(true)}
        aria-label="Settings"
        title="Settings"
      >
        ⚙️
      </button>
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </header>
  );
}
