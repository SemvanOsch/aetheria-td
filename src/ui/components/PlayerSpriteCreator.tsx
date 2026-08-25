import { useState } from 'react';
import {
  SPRITE_CATEGORIES,
  randomPlayerSprite,
  type PlayerSpriteConfig,
  type SpriteCategory,
} from '../../domain/playerSprite';
import { PlayerSprite } from './PlayerSprite';
import { playIntroSound } from '../introAudio';

interface Props {
  /** The config to start editing from (the live preview's initial state). */
  initial: PlayerSpriteConfig;
  onConfirm: (config: PlayerSpriteConfig) => void;
  onCancel: () => void;
}

/**
 * Preset-based sprite creator. Every category is a closed list of interchangeable
 * parts (see domain/playerSprite), so the player only ever picks from valid
 * options — no free drawing. A live preview updates instantly on any change;
 * colour categories are click-to-pick swatch grids, the rest are prev/next
 * steppers. Randomize rolls a fresh valid combination; Confirm hands the finished
 * config back to the journal. Cancelling keeps whatever the portrait had before.
 */
export function PlayerSpriteCreator({ initial, onConfirm, onCancel }: Props) {
  const [config, setConfig] = useState<PlayerSpriteConfig>(initial);

  const setPart = (cat: SpriteCategory, id: string) => {
    playIntroSound('quill');
    setConfig((c) => ({ ...c, [cat.key]: id }));
  };

  /** Move a category's selection by ±1, wrapping around the option list. */
  const step = (cat: SpriteCategory, dir: 1 | -1) => {
    const opts = cat.options;
    const cur = opts.findIndex((o) => o.id === config[cat.key]);
    const next = opts[(cur + dir + opts.length) % opts.length];
    setPart(cat, next.id);
  };

  const randomize = () => {
    playIntroSound('pageTurn');
    setConfig(randomPlayerSprite());
  };

  return (
    <div className="sprite-creator" onClick={(e) => e.stopPropagation()}>
      <h3 className="creator-title">Sketch Your Adventurer</h3>
      <p className="creator-sub">Choose your look — every piece updates the portrait at once.</p>

      <div className="creator-body">
        <div className="creator-preview-wrap">
          <div className="creator-preview">
            <PlayerSprite config={config} size={200} idle label="Adventurer preview" />
          </div>
          <button className="btn ghost creator-random" onClick={randomize}>
            🎲 Randomize
          </button>
        </div>

        <div className="creator-cats">
          {SPRITE_CATEGORIES.map((cat) => {
            const current = cat.options.find((o) => o.id === config[cat.key]) ?? cat.options[0];
            return (
              <div className="creator-cat" key={cat.key}>
                <div className="creator-cat-head">
                  <span className="creator-cat-label">{cat.label}</span>
                  {!cat.swatch && (
                    <div className="creator-stepper">
                      <button
                        className="stepper-btn"
                        onClick={() => step(cat, -1)}
                        aria-label={`Previous ${cat.label}`}
                      >
                        ◀
                      </button>
                      <span className="stepper-value">{current.label}</span>
                      <button
                        className="stepper-btn"
                        onClick={() => step(cat, 1)}
                        aria-label={`Next ${cat.label}`}
                      >
                        ▶
                      </button>
                    </div>
                  )}
                </div>
                {cat.swatch && (
                  <div className="swatch-row">
                    {cat.options.map((o) => (
                      <button
                        key={o.id}
                        className={`swatch ${o.id === config[cat.key] ? 'selected' : ''}`}
                        style={{ background: o.color }}
                        onClick={() => setPart(cat, o.id)}
                        onMouseEnter={() => playIntroSound('hover')}
                        aria-label={`${cat.label}: ${o.label}`}
                        title={o.label}
                      />
                    ))}
                    {/* Free custom colour — any hex, in addition to the palette. */}
                    <label
                      className={`swatch custom ${
                        cat.options.some((o) => o.id === config[cat.key]) ? '' : 'selected'
                      }`}
                      style={
                        cat.options.some((o) => o.id === config[cat.key])
                          ? undefined
                          : { background: config[cat.key] }
                      }
                      title={`Custom ${cat.label.toLowerCase()}`}
                    >
                      <input
                        type="color"
                        value={config[cat.key]}
                        onChange={(e) => setPart(cat, e.target.value)}
                        aria-label={`Custom ${cat.label}`}
                      />
                      <span className="swatch-custom-icon">✎</span>
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="creator-actions">
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
          ✓ Confirm Portrait
        </button>
      </div>
    </div>
  );
}
