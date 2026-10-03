import { useState } from 'react';
import {
  SPRITE_CATEGORIES,
  SPRITE_GROUPS,
  randomPlayerSprite,
  type PlayerSpriteConfig,
  type SpriteCategory,
  type SpriteGroup,
} from '../../domain/playerSprite';
import type { PlayerWeapon } from '../../engine/sprites';
import { PlayerSprite } from './PlayerSprite';
import { Icon, type IconName } from './Icon';
import { playIntroSound } from '../introAudio';

interface Props {
  /** The config to start editing from (the live preview's initial state). */
  initial: PlayerSpriteConfig;
  onConfirm: (config: PlayerSpriteConfig) => void;
  onCancel: () => void;
  /**
   * The champion weapon this adventurer fights with, once their proficiency is
   * known. Offers a "with gear" toggle on the preview; omitted before a path is
   * chosen.
   */
  weapon?: PlayerWeapon;
}

/** Icon for the gear toggle, per weapon. */
const WEAPON_ICON: Record<PlayerWeapon, IconName> = {
  none: 'sword',
  'dual-swords': 'swords',
  bow: 'bow',
  magic: 'staff',
};

/**
 * Preset-based sprite creator, styled as a sketchbook leaf beside the journal.
 * Every category is a closed list of interchangeable parts (see
 * domain/playerSprite), so the player only ever picks from valid options — no
 * free drawing. Parts are grouped into tabs (Body / Face / Hair / Attire /
 * Gear); each option is a tile with its own thumbnail of the adventurer wearing
 * it, colours are swatch rows plus a free custom picker. The large preview
 * breathes, turns to face either way and can be shown holding the champion's
 * weapon. Randomize rolls a fresh valid combination, Reset returns to where the
 * sketch started, Confirm hands the finished config back to the journal.
 */
export function PlayerSpriteCreator({ initial, onConfirm, onCancel, weapon }: Props) {
  const [config, setConfig] = useState<PlayerSpriteConfig>(initial);
  const [group, setGroup] = useState<SpriteGroup>('body');
  const [faceLeft, setFaceLeft] = useState(false);
  const [showGear, setShowGear] = useState(false);

  const setPart = (cat: SpriteCategory, id: string) => {
    playIntroSound('quill');
    setConfig((c) => ({ ...c, [cat.key]: id }));
  };

  const pickGroup = (g: SpriteGroup) => {
    if (g === group) return;
    playIntroSound('pageTurn');
    setGroup(g);
  };

  const randomize = () => {
    playIntroSound('pageTurn');
    setConfig(randomPlayerSprite());
  };

  const reset = () => {
    playIntroSound('pageTurn');
    setConfig(initial);
  };

  const dirty = JSON.stringify(config) !== JSON.stringify(initial);
  const cats = SPRITE_CATEGORIES.filter((c) => c.group === group);

  return (
    <div
      className="sprite-creator"
      role="dialog"
      aria-modal="true"
      aria-label="Sketch your adventurer"
      onClick={(e) => e.stopPropagation()}
    >
      <header className="creator-head">
        <Icon name="quill" className="creator-head-icon" />
        <div>
          <h3 className="creator-title">Sketch Your Adventurer</h3>
          <p className="creator-sub">Every stroke shows on the portrait at once.</p>
        </div>
      </header>

      <div className="creator-body">
        <div className="creator-stage">
          <div className="creator-preview">
            <PlayerSprite
              config={config}
              size={236}
              idle
              faceLeft={faceLeft}
              weapon={showGear && weapon ? weapon : 'none'}
              label="Adventurer preview"
            />
            <div className="creator-plinth" aria-hidden="true" />
          </div>
          <div className="creator-tools">
            <button
              className="creator-tool"
              onClick={() => {
                playIntroSound('hover');
                setFaceLeft((f) => !f);
              }}
              title="Turn to face the other way"
            >
              <Icon name="turn" /> Turn
            </button>
            {weapon && weapon !== 'none' && (
              <button
                className={`creator-tool ${showGear ? 'selected' : ''}`}
                onClick={() => {
                  playIntroSound('hover');
                  setShowGear((g) => !g);
                }}
                aria-pressed={showGear}
                title="Show your champion's weapon"
              >
                <Icon name={WEAPON_ICON[weapon]} /> Gear
              </button>
            )}
            <button className="creator-tool" onClick={randomize} title="Roll a random adventurer">
              <Icon name="dice" /> Random
            </button>
            <button className="creator-tool" onClick={reset} disabled={!dirty} title="Undo every change">
              <Icon name="undo" /> Reset
            </button>
          </div>
        </div>

        <div className="creator-panel">
          <div className="creator-tabs" role="tablist">
            {SPRITE_GROUPS.map((g) => (
              <button
                key={g.id}
                role="tab"
                aria-selected={g.id === group}
                className={`creator-tab ${g.id === group ? 'active' : ''}`}
                onClick={() => pickGroup(g.id)}
              >
                {g.label}
              </button>
            ))}
          </div>

          <div className="creator-cats" role="tabpanel" key={group}>
            {cats.map((cat) => {
              const current = cat.options.find((o) => o.id === config[cat.key]);
              return (
                <section className="creator-cat" key={cat.key}>
                  <div className="creator-cat-head">
                    <span className="creator-cat-label">{cat.label}</span>
                    <span className="creator-cat-value">{current?.label ?? 'Custom'}</span>
                  </div>
                  {cat.swatch ? (
                    <div className="swatch-row">
                      {cat.options.map((o) => (
                        <button
                          key={o.id}
                          className={`swatch ${o.id === config[cat.key] ? 'selected' : ''}`}
                          style={{ background: o.color }}
                          onClick={() => setPart(cat, o.id)}
                          onMouseEnter={() => playIntroSound('hover')}
                          aria-label={`${cat.label}: ${o.label}`}
                          aria-pressed={o.id === config[cat.key]}
                          title={o.label}
                        />
                      ))}
                      {/* Free custom colour — any hex, in addition to the palette. */}
                      <label
                        className={`swatch custom ${current ? '' : 'selected'}`}
                        style={current ? undefined : { background: config[cat.key] }}
                        title={`Custom ${cat.label.toLowerCase()}`}
                      >
                        <input
                          type="color"
                          value={config[cat.key]}
                          onChange={(e) => setPart(cat, e.target.value)}
                          aria-label={`Custom ${cat.label}`}
                        />
                        <Icon name="quill" className="swatch-custom-icon" />
                      </label>
                    </div>
                  ) : (
                    <div className="opt-grid">
                      {cat.options.map((o) => {
                        const on = o.id === config[cat.key];
                        return (
                          <button
                            key={o.id}
                            className={`opt-tile ${on ? 'selected' : ''}`}
                            onClick={() => setPart(cat, o.id)}
                            aria-pressed={on}
                            title={o.label}
                          >
                            <PlayerSprite
                              config={{ ...config, [cat.key]: o.id }}
                              size={62}
                              framing={cat.focus === 'bust' ? 'bust' : 'snug'}
                              label={o.label}
                            />
                            <span className="opt-label">{o.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </div>

      <footer className="creator-actions">
        <button className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn primary"
          onClick={() => {
            playIntroSound('confirm');
            onConfirm(config);
          }}
        >
          <Icon name="check" /> Confirm Portrait
        </button>
      </footer>
    </div>
  );
}
