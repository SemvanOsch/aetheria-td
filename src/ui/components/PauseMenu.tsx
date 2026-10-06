import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../../application/gameContext';
import { Icon } from './Icon';
import { SoundSettings } from './Settings';

interface Props {
  /** True in an endless run: the leave button concedes the run instead of retreating. */
  endless: boolean;
  onResume: () => void;
  onLeave: () => void;
}

/**
 * In-stage pause menu: the battle is frozen while it's open. Holds the volume
 * sliders (the same block as Settings), the auto-start-waves switch and a way
 * out of the stage.
 */
export function PauseMenu({ endless, onResume, onLeave }: Props) {
  const { state, setPrefs } = useGame();
  const autoStart = state.prefs.autoStartWaves;
  // Conceding an endless run asks for a second click, like the HUD's End run.
  const [confirmLeave, setConfirmLeave] = useState(false);

  const leave = () => {
    if (endless && !confirmLeave) {
      setConfirmLeave(true);
      return;
    }
    onLeave();
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onResume}>
      <div className="panel modal settings-modal pause-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onResume} aria-label="Resume"><Icon name="close" /></button>
        <h2><Icon name="pause" /> Paused</h2>

        <button className="btn primary block pause-resume" onClick={onResume}>
          <Icon name="play" /> Resume
        </button>

        <SoundSettings />

        <div className="settings-section audio">
          <div className="pause-toggle-row">
            <span className="settings-row-title"><Icon name="swords" /> Auto-start next wave</span>
            <button
              className={`btn sort-toggle ${autoStart ? '' : 'off'}`}
              onClick={() => setPrefs({ autoStartWaves: !autoStart })}
              aria-pressed={autoStart}
            >
              {autoStart ? 'On' : 'Off'}
            </button>
          </div>
          <p className="hint" style={{ margin: 0 }}>
            After you clear a wave, the next one starts right away.
            You start the first wave yourself.
          </p>
        </div>

        <button
          className={`btn ghost block pause-leave${confirmLeave ? ' confirm-end' : ''}`}
          onClick={leave}
          onBlur={() => setConfirmLeave(false)}
        >
          {endless ? (
            <><Icon name="flag" /> {confirmLeave ? 'Confirm end run?' : 'End run'}</>
          ) : (
            <><Icon name="back" /> Retreat</>
          )}
        </button>
      </div>
    </div>,
    document.body,
  );
}
