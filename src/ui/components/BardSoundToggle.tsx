import { useGame } from '../../application/gameContext';
import { Icon } from './Icon';

/**
 * On/off switch for the Bard's lute tune in battle. A saved preference, so the
 * Champion sheet and the in-stage panel show and flip the same setting.
 * `compact` drops the label and renders just a small switch (the in-stage card corner).
 */
export function BardSoundToggle({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const { state, setPrefs } = useGame();
  const muted = state.prefs.bardSoundMuted;
  const toggle = () => setPrefs({ bardSoundMuted: !muted });
  const title = muted ? 'Tune sound off: click to play the Bard’s tune again' : 'Tune sound on: click to silence the Bard’s tune';

  if (compact) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={!muted}
        aria-label="Tune sound"
        title={title}
        className={`bard-sound-switch ${muted ? '' : 'on'} ${className}`}
        onClick={toggle}
      >
        <Icon name={muted ? 'mute' : 'music'} />
        <span className="bard-sound-track">
          <span className="bard-sound-knob" />
        </span>
      </button>
    );
  }

  return (
    <div className={`bard-sound-toggle ${className}`}>
      <span className="bard-sound-label">
        <Icon name="music" /> Tune sound
      </span>
      <button
        type="button"
        className={`btn sort-toggle ${muted ? 'off' : ''}`}
        onClick={toggle}
        aria-pressed={!muted}
        title={title}
      >
        {muted ? <><Icon name="mute" /> Off</> : <><Icon name="sound" /> On</>}
      </button>
    </div>
  );
}
