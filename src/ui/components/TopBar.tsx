import { useState } from 'react';
import { useGame } from '../../application/gameContext';
import { Gems } from './Currency';
import { Settings } from './Settings';
import { PatchNotes } from './PatchNotes';
import { Icon } from './Icon';

/**
 * The bar across the top of every menu: just the gem purse, the patch notes
 * and settings. Getting around happens on the screens themselves (the home
 * desk's objects, and a back button on each destination).
 */
export function TopBar() {
  const { state } = useGame();
  const [showSettings, setShowSettings] = useState(false);
  const [showPatchNotes, setShowPatchNotes] = useState(false);

  return (
    <header className="topbar">
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
