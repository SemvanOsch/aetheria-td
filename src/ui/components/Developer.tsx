import { useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../../application/gameContext';
import { ALL_UNITS } from '../../domain/units';
import { isPlayerChampionId } from '../../domain/playerChampion';
import { BOSS_ENEMIES, REGULAR_ENEMIES } from '../../domain/enemies';
import {
  ARMOR_RARITIES,
  ARMOR_RARITY_ORDER,
  ARMOR_SETS,
  ARMOR_SLOTS,
  ARMOR_STATS,
  armorPieceName,
  armorStatLines,
  formatArmorRange,
  rollArmorPiece,
  type ArmorRarity,
  type ArmorRoll,
  type ArmorSlot,
} from '../../domain/armor';
import { PROFICIENCIES, type Proficiency } from '../../domain/proficiency';
import { PROFICIENCY_WEAPON } from '../../engine/sprites';
import { LevelDesigner } from '../screens/LevelDesigner';
import { ArmorIcon } from './ArmorIcon';
import { PlayerSprite } from './PlayerSprite';
import { Icon, type IconName } from './Icon';

interface Props {
  onClose: () => void;
}

/** Skill-tree EXP granted to every champion by the debug control. */
const MASTERY_GRANT = 50;

/** Enemy Index kills granted to every enemy by the debug control. */
const KILLS_GRANT = 50;

/**
 * Developer menu — the debug/authoring controls: resource grants, the hero
 * class switch, the armor forge, the Level Designer and the account reset.
 * Reached from the player-facing Settings menu so these stay out of the way.
 * Laid out as a grid of tool cards; the class switch and the forge span it.
 */
export function Developer({ onClose }: Props) {
  const { resetAccount, grantGems, awardMastery, awardEnemyKills, resetEnemyKills, awardArmor, setPlayerChampionClass, state } = useGame();
  const [confirming, setConfirming] = useState(false);
  const [showDesigner, setShowDesigner] = useState(false);
  const [notesReset, setNotesReset] = useState(false);

  // Armor forge selection.
  const [setId, setSetId] = useState(ARMOR_SETS[0]?.id ?? '');
  const [slot, setSlot] = useState<ArmorSlot>('helmet');
  const [rarity, setRarity] = useState<ArmorRarity>('legendary');
  const [forged, setForged] = useState<string | null>(null);
  const forgePreview = { set: setId, slot, rarity };

  const doReset = () => {
    resetAccount();
    onClose();
  };

  const grantMasteryAll = () => {
    const gains: Record<string, number> = {};
    for (const u of ALL_UNITS) gains[u.id] = MASTERY_GRANT;
    // The player’s own champion isn’t in the catalog; credit the owned one too.
    for (const id of state.ownedUnits.filter(isPlayerChampionId)) gains[id] = MASTERY_GRANT;
    awardMastery(gains);
  };

  const grantKillsAll = () => {
    const gains: Record<string, number> = {};
    for (const e of [...REGULAR_ENEMIES, ...BOSS_ENEMIES]) gains[e.id] = KILLS_GRANT;
    awardEnemyKills(gains);
  };

  const forge = (rolls: ArmorRoll[], note: string) => {
    awardArmor(rolls);
    setForged(note);
  };
  const roll = (s: ArmorSlot, r: ArmorRarity) => rollArmorPiece(setId, s, r, Math.random);

  // The designer is its own full-screen overlay rendered as a sibling (not
  // nested) so its backdrop clicks don't bubble up and close this menu too.
  if (showDesigner) {
    return <LevelDesigner onClose={() => setShowDesigner(false)} />;
  }

  const player = state.player;
  const ownedPieces = state.armor.items.length;

  // Portalled to <body> so the TopBar's backdrop-filter can't trap this fixed
  // overlay inside the header instead of covering the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel ornate modal dev-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
        <header className="dev-head">
          <span className="dev-badge">
            <Icon name="hammer" />
          </span>
          <div>
            <h2>Developer Menu</h2>
            <p>Debug &amp; authoring tools. These aren't part of normal play.</p>
          </div>
        </header>

        <div className="dev-grid">
          <DevCard icon="gem" title="Resources" sub="Top up progression in one click.">
            <div className="dev-stats">
              <span>
                <Icon name="gem" /> <b>{state.gems.toLocaleString()}</b> gems
              </span>
            </div>
            <div className="dev-buttons">
              <button className="dev-btn" onClick={() => grantGems(100)}>
                <Icon name="gem" /> +100 gems
              </button>
              <button className="dev-btn" onClick={() => grantGems(1000)}>
                <Icon name="gem" /> +1,000 gems
              </button>
              <button className="dev-btn" onClick={grantMasteryAll} title="Skill-tree EXP for every champion, your own hero included">
                <Icon name="star" /> +{MASTERY_GRANT} EXP to all
              </button>
              <button className="dev-btn" onClick={grantKillsAll} title="Enemy Index kills for every foe and boss">
                <Icon name="bestiary" /> +{KILLS_GRANT} kills to all
              </button>
              <button
                className="dev-btn"
                onClick={() => {
                  resetEnemyKills();
                  setNotesReset(true);
                }}
                title="Wipe every enemy kill: the Enemy Index relocks and each foe's field note pops up again in stage"
              >
                <Icon name="bestiary" /> Reset field notes
              </button>
            </div>
            {notesReset && (
              <p className="dev-done">
                <Icon name="check" /> Kills wiped: field notes will pop up again as foes are recorded.
              </p>
            )}
          </DevCard>

          <DevCard icon="flag" title="Level Designer" sub="Draw paths, props and moods, then export the code for a stage.">
            <div className="dev-buttons">
              <button className="dev-btn primary" onClick={() => setShowDesigner(true)}>
                <Icon name="flag" /> Open Level Designer
              </button>
            </div>
          </DevCard>

          <DevCard
            icon="sword"
            title="Hero class"
            sub="Switch your adventurer's champion class. Each class keeps its own mastery."
            wide
          >
            {player ? (
              <div className="dev-classes">
                {PROFICIENCIES.map((p) => {
                  const current = player.proficiency === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`dev-class${current ? ' current' : ''}`}
                      onClick={() => setPlayerChampionClass(p.id as Proficiency)}
                      aria-pressed={current}
                    >
                      <span className="dev-class-art">
                        <PlayerSprite config={player.sprite} size={92} weapon={PROFICIENCY_WEAPON[p.id]} label={p.label} />
                      </span>
                      <span className="dev-class-name">{p.label}</span>
                      <span className="dev-class-sub">{current ? 'Current class' : p.blurb}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="dev-note">Finish the journal intro to create your adventurer first.</p>
            )}
          </DevCard>

          <DevCard
            icon="shield"
            title="Armor forge"
            sub={`Roll armor pieces straight into the armory (stats are random, as on a drop). You own ${ownedPieces} ${ownedPieces === 1 ? 'piece' : 'pieces'}.`}
            wide
          >
            <div className="dev-forge">
              <div
                className="dev-forge-preview"
                style={{ '--rarity': ARMOR_RARITIES[rarity].color } as CSSProperties}
              >
                <ArmorIcon piece={forgePreview} size={96} />
                <div className="dev-forge-name">{armorPieceName(forgePreview)}</div>
                <div className="dev-forge-kind">
                  {ARMOR_RARITIES[rarity].name} · {ARMOR_RARITIES[rarity].statCount} random stats
                </div>
                <div className="dev-forge-stats">
                  {ARMOR_STATS.map((s) => (
                    <span key={s.key}>
                      {s.label} <b>{formatArmorRange(s.key, rarity)}</b>
                    </span>
                  ))}
                </div>
              </div>
              <div className="dev-forge-controls">
                {ARMOR_SETS.length > 1 && (
                  <ChipRow label="Set">
                    {ARMOR_SETS.map((s) => (
                      <Chip key={s.id} on={setId === s.id} onClick={() => setSetId(s.id)}>
                        {s.name}
                      </Chip>
                    ))}
                  </ChipRow>
                )}
                <ChipRow label="Slot">
                  {ARMOR_SLOTS.map((s) => (
                    <Chip key={s.id} on={slot === s.id} onClick={() => setSlot(s.id)}>
                      {s.label}
                    </Chip>
                  ))}
                </ChipRow>
                <ChipRow label="Rarity">
                  {ARMOR_RARITY_ORDER.map((r) => (
                    <Chip key={r} on={rarity === r} color={ARMOR_RARITIES[r].color} onClick={() => setRarity(r)}>
                      {ARMOR_RARITIES[r].name}
                    </Chip>
                  ))}
                </ChipRow>
                <div className="dev-buttons">
                  <button
                    className="dev-btn primary"
                    onClick={() => {
                      const piece = roll(slot, rarity);
                      const stats = armorStatLines(piece.stats).map((l) => `${l.label} ${l.value}`).join(', ');
                      forge([piece], `Forged ${ARMOR_RARITIES[rarity].name.toLowerCase()} ${armorPieceName(piece)}: ${stats}.`);
                    }}
                  >
                    <Icon name="hammer" /> Forge piece
                  </button>
                  <button
                    className="dev-btn"
                    onClick={() =>
                      forge(
                        ARMOR_SLOTS.map((s) => roll(s.id, rarity)),
                        `Forged a full ${ARMOR_RARITIES[rarity].name.toLowerCase()} set.`,
                      )
                    }
                  >
                    <Icon name="shield" /> Full {ARMOR_RARITIES[rarity].name.toLowerCase()} set
                  </button>
                  <button
                    className="dev-btn"
                    onClick={() =>
                      forge(
                        ARMOR_SLOTS.flatMap((s) => ARMOR_RARITY_ORDER.map((r) => roll(s.id, r))),
                        'Forged one of every piece and rarity.',
                      )
                    }
                  >
                    <Icon name="sparkle" /> One of everything
                  </button>
                </div>
                {forged && (
                  <p className="dev-done" key={forged + ownedPieces}>
                    <Icon name="check" /> {forged}
                  </p>
                )}
              </div>
            </div>
          </DevCard>

          <DevCard icon="skull" title="Danger zone" sub="Wipe gems, champions, armor and cleared realms back to a brand-new account. This cannot be undone." danger wide>
            {!confirming ? (
              <div className="dev-buttons">
                <button className="dev-btn danger" onClick={() => setConfirming(true)}>
                  <Icon name="skull" /> Reset account data
                </button>
              </div>
            ) : (
              <div className="dev-confirm">
                <span>Are you sure? This erases everything.</span>
                <button className="dev-btn danger" onClick={doReset}>
                  Yes, reset
                </button>
                <button className="dev-btn" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            )}
          </DevCard>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** One tool card: an icon badge, a title and a line of help over its controls. */
function DevCard({
  icon,
  title,
  sub,
  wide,
  danger,
  children,
}: {
  icon: IconName;
  title: string;
  sub: string;
  wide?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`dev-card${wide ? ' wide' : ''}${danger ? ' danger' : ''}`}>
      <div className="dev-card-head">
        <span className="dev-card-icon">
          <Icon name={icon} />
        </span>
        <div>
          <div className="dev-card-title">{title}</div>
          <div className="dev-card-sub">{sub}</div>
        </div>
      </div>
      {children}
    </section>
  );
}

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dev-chiprow">
      <span className="dev-chiprow-label">{label}</span>
      <div className="dev-chips">{children}</div>
    </div>
  );
}

function Chip({
  on,
  color,
  onClick,
  children,
}: {
  on: boolean;
  color?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`dev-chip${on ? ' on' : ''}`}
      style={color ? ({ '--chip': color } as CSSProperties) : undefined}
      onClick={onClick}
      aria-pressed={on}
    >
      {children}
    </button>
  );
}
