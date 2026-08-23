import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../../application/gameContext';
import { ALL_UNITS } from '../../domain/units';
import { BOSS_ENEMIES, REGULAR_ENEMIES } from '../../domain/enemies';
import { LevelDesigner } from '../screens/LevelDesigner';

interface Props {
  onClose: () => void;
}

/** Skill-tree EXP granted to every champion by the debug settings control. */
const MASTERY_GRANT = 50;

/** Enemy Index kills granted to every enemy by the debug settings control. */
const KILLS_GRANT = 50;

/** Settings modal. Currently just the account-reset control (two-step confirm). */
export function Settings({ onClose }: Props) {
  const { resetAccount, grantGems, awardMastery, awardEnemyKills, state } = useGame();
  const [confirming, setConfirming] = useState(false);
  const [showDesigner, setShowDesigner] = useState(false);

  const doReset = () => {
    resetAccount();
    onClose();
  };

  const grantMasteryAll = () => {
    const gains: Record<string, number> = {};
    for (const u of ALL_UNITS) gains[u.id] = MASTERY_GRANT;
    awardMastery(gains);
  };

  const grantKillsAll = () => {
    const gains: Record<string, number> = {};
    for (const e of [...REGULAR_ENEMIES, ...BOSS_ENEMIES]) gains[e.id] = KILLS_GRANT;
    awardEnemyKills(gains);
  };

  // The designer is its own full-screen overlay rendered as a sibling (not
  // nested) so its backdrop clicks don't bubble up and close Settings too.
  if (showDesigner) {
    return <LevelDesigner onClose={() => setShowDesigner(false)} />;
  }

  // Portalled to <body> so the TopBar's backdrop-filter can't trap this fixed
  // overlay inside the header instead of covering the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <h2>⚙️ Settings</h2>

        <div className="settings-section gems">
          <div className="settings-row-title">Gems</div>
          <p className="hint">You currently have 💎 {state.gems.toLocaleString()}.</p>
          <button className="btn primary block" onClick={() => grantGems(100)}>
            💎 +100 Gems
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-row-title">Champion Mastery</div>
          <p className="hint">
            Grants ⭐ {MASTERY_GRANT} skill-tree EXP to every champion, to spend
            in their mastery trees.
          </p>
          <button className="btn primary block" onClick={grantMasteryAll}>
            ⭐ +{MASTERY_GRANT} EXP to All Champions
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-row-title">Enemy Index</div>
          <p className="hint">
            Grants +{KILLS_GRANT} kills toward every enemy and boss in the Enemy
            Index, to help unlock their entries.
          </p>
          <button className="btn primary block" onClick={grantKillsAll}>
            📖 +{KILLS_GRANT} Kills to All Enemies
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-row-title">Level Designer</div>
          <p className="hint">
            Draw a stage's enemy path on an interactive grid, then export the
            code to paste into a level in <code>domain/levels.ts</code>.
          </p>
          <button className="btn primary block" onClick={() => setShowDesigner(true)}>
            🗺️ Open Level Designer
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-row-title">Account Data</div>
          <p className="hint">
            Wipes all progress — gems, champions, and cleared realms — back to a
            brand-new account. This cannot be undone.
          </p>

          {!confirming ? (
            <button className="btn danger block" onClick={() => setConfirming(true)}>
              🗑️ Reset Account Data
            </button>
          ) : (
            <div className="settings-confirm">
              <p className="confirm-text">Are you sure? This erases everything.</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn danger" style={{ flex: 1 }} onClick={doReset}>
                  Yes, reset
                </button>
                <button className="btn ghost" style={{ flex: 1 }} onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
