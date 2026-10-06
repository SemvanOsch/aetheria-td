import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../../application/gameContext';
import type { AudioSettings } from '../../application/gameState';
import { Developer } from './Developer';
import { Icon } from './Icon';

interface Props {
  onClose: () => void;
}

/** One labelled volume slider (0–100), disabled while everything is muted. */
function VolumeSlider({
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className={`volume-row ${disabled ? 'disabled' : ''}`}>
      <div className="volume-head">
        <span className="volume-label">{label}</span>
        <span className="volume-value">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p className="hint volume-hint">{hint}</p>}
    </div>
  );
}

/** The Sound block (mute + every volume slider); shared by Settings and the in-stage pause menu. */
export function SoundSettings() {
  const { state, setAudioSettings } = useGame();
  const audio = state.audio;

  const set = (patch: Partial<AudioSettings>) => setAudioSettings(patch);

  return (
    <div className="settings-section audio">
      <div className="settings-row-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span><Icon name="sound" /> Sound</span>
        <button
          className={`btn sort-toggle ${audio.muted ? 'off' : ''}`}
          onClick={() => set({ muted: !audio.muted })}
        >
          {audio.muted ? <><Icon name="mute" /> Muted</> : <><Icon name="sound" /> Mute</>}
        </button>
      </div>

      <VolumeSlider
        label="Master"
        hint="Scales all game sound."
        value={audio.master}
        disabled={audio.muted}
        onChange={(master) => set({ master })}
      />
      <VolumeSlider
        label="Interface"
        hint="Menus, the summoning altar and the journal intro."
        value={audio.ui}
        disabled={audio.muted}
        onChange={(ui) => set({ ui })}
      />
      <VolumeSlider
        label="Combat"
        hint="In-battle champion attacks and impacts."
        value={audio.combat}
        disabled={audio.muted}
        onChange={(combat) => set({ combat })}
      />
      <VolumeSlider
        label="Music"
        hint="The menu theme and each chapter's battle theme."
        value={audio.music}
        disabled={audio.muted}
        onChange={(music) => set({ music })}
      />
    </div>
  );
}

/**
 * Player-facing Settings modal: volume controls. The old debug/authoring
 * controls now live behind the Developer menu, opened from the bottom here.
 */
export function Settings({ onClose }: Props) {
  const [showDeveloper, setShowDeveloper] = useState(false);

  // The Developer menu is its own full-screen overlay rendered as a sibling (not
  // nested) so its backdrop clicks don't bubble up and close Settings too.
  if (showDeveloper) {
    return <Developer onClose={() => setShowDeveloper(false)} />;
  }

  // Portalled to <body> so the TopBar's backdrop-filter can't trap this fixed
  // overlay inside the header instead of covering the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        <h2><Icon name="gear" /> Settings</h2>

        <SoundSettings />

        <div className="settings-section">
          <div className="settings-row-title">Developer Menu</div>
          <p className="hint">
            Debug &amp; authoring tools — gem/EXP grants, the Level Designer, and
            account reset.
          </p>
          <button className="btn ghost block" onClick={() => setShowDeveloper(true)}>
            <Icon name="hammer" /> Open Developer Menu
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
