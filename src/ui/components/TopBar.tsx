import { useState } from 'react';
import type { Screen } from '../App';
import { useGame } from '../../application/gameContext';
import { Gems } from './Currency';
import { Settings } from './Settings';
import { PatchNotes } from './PatchNotes';
import { Icon, type IconName } from './Icon';
import { Crest } from './Crest';

interface Props {
  active: Screen;
  onNavigate: (screen: Screen) => void;
  /** Open the journal on its Champions bookmark. */
  onChampions: () => void;
}

const TABS: { id: Screen; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'keep' },
  { id: 'modes', label: 'Play', icon: 'swords' },
  { id: 'summon', label: 'Summon', icon: 'orb' },
];

export function TopBar({ active, onNavigate, onChampions }: Props) {
  const { state } = useGame();
  const [showSettings, setShowSettings] = useState(false);
  const [showPatchNotes, setShowPatchNotes] = useState(false);

  return (
    <header className="topbar">
      <button className="brand" onClick={() => onNavigate('home')}>
        <Crest className="brand-crest" />
        <span className="brand-word">Aetheria</span>
      </button>
      <nav>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`nav-btn ${active === t.id ? 'active' : ''}`}
            onClick={() => onNavigate(t.id)}
            aria-label={t.label}
          >
            <Icon name={t.icon} />
            <span className="nav-label">{t.label}</span>
          </button>
        ))}
        {/* Champions live in the journal now; this opens it on their bookmark. */}
        <button className="nav-btn" onClick={onChampions} aria-label="Champions">
          <Icon name="helm" />
          <span className="nav-label">Champions</span>
        </button>
      </nav>
      <Gems amount={state.gems} />
      <button
        className="settings-btn"
        onClick={() => setShowPatchNotes(true)}
        aria-label="Patch notes"
        title="Patch notes"
      >
        <Icon name="scroll" />
      </button>
      <button
        className="settings-btn gear"
        onClick={() => setShowSettings(true)}
        aria-label="Settings"
        title="Settings"
      >
        <Icon name="gear" />
      </button>
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      {showPatchNotes && <PatchNotes onClose={() => setShowPatchNotes(false)} />}
    </header>
  );
}
