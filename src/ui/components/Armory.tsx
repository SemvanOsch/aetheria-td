import { useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../../application/gameContext';
import { equippedArmor, isArmorEquipped } from '../../application/gameState';
import {
  ARMOR_DROPS,
  ARMOR_RARITIES,
  ARMOR_SETS,
  ARMOR_SLOTS,
  ARMOR_STATS,
  armorPieceName,
  armorRarityOdds,
  armorRollQuality,
  armorStatLines,
  armorSummary,
  formatArmorRange,
  formatArmorStat,
  getArmorSet,
  type ArmorPiece,
  type ArmorSlot,
} from '../../domain/armor';
import { adventurerWeapon } from '../portrait';
import { ArmorIcon } from './ArmorIcon';
import { PlayerSprite } from './PlayerSprite';
import { Icon } from './Icon';

interface Props {
  /** The slot tab to open on (default: all pieces). */
  initialTab?: ArmorSlot | 'all';
  onClose: () => void;
}

type Filter = ArmorSlot | 'all';

const pct = (f: number) => `${Math.round(f * 100)}%`;
const slotIndex = (slot: ArmorSlot) => ARMOR_SLOTS.findIndex((s) => s.id === slot);
const idNumber = (p: ArmorPiece) => Number(p.id.replace(/^a/, '')) || 0;

/** A piece's rolled stats as a tooltip: "Damage +6.2% · Range +3%". */
const statSummary = (p: ArmorPiece) => armorStatLines(p.stats).map((l) => `${l.label} ${l.value}`).join(' · ');

/**
 * The adventurer's armory: a paper doll with the four equipment slots around
 * the figure (armor is stats only — it isn't drawn on it), the summed bonuses
 * and set progress beneath it, and every piece found so far — each with its own
 * rolled stats — with equip / take off / salvage. Portalled to <body>.
 */
export function Armory({ initialTab = 'all', onClose }: Props) {
  const { state, equipArmor, unequipArmor, salvageArmor } = useGame();
  const equipped = state.armor.equipped;
  const items = state.armor.items;
  const [filter, setFilter] = useState<Filter>(initialTab);
  // Start on the worn piece of the opened slot (or any worn piece for "all").
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    initialTab === 'all' ? (Object.values(equipped)[0] ?? null) : (equipped[initialTab] ?? null),
  );

  const worn = equippedArmor(state);
  const summary = armorSummary(worn);
  const sprite = state.player?.sprite;
  const weapon = adventurerWeapon(state.player?.proficiency ?? 'sword');

  // Head → feet, rarest first within a slot, newest first within a rarity.
  const sorted = [...items].sort(
    (a, b) =>
      slotIndex(a.slot) - slotIndex(b.slot) ||
      ARMOR_RARITIES[b.rarity].order - ARMOR_RARITIES[a.rarity].order ||
      idNumber(b) - idNumber(a),
  );
  const shown = sorted.filter((p) => filter === 'all' || p.slot === filter);

  const selected = items.find((p) => p.id === selectedId);
  const selectedWorn = selected ? isArmorEquipped(state, selected.id) : false;

  /**
   * Switch tab and bring a piece of it on screen: the worn piece of that slot,
   * else its best piece (the list's first). "All" keeps the current piece.
   */
  const pickTab = (f: Filter) => {
    setFilter(f);
    if (f === 'all') return;
    setSelectedId(equipped[f] ?? sorted.find((p) => p.slot === f)?.id ?? null);
  };

  const totalLines = armorStatLines(summary.total);
  const odds = armorRarityOdds();

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel ornate modal armory-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
        <h2>Armory</h2>
        <p className="ar-sub">
          Equipment for {state.player?.name ?? 'your adventurer'}. Equip a
          full set for its bonus.
        </p>

        <div className="ar-layout">
          <section className="ar-doll-col">
            <div className="ar-doll">
              <div className="ar-slots">
                {ARMOR_SLOTS.slice(0, 2).map((s) => (
                  <SlotButton key={s.id} slot={s.id} label={s.label} piece={worn.find((p) => p.slot === s.id)} active={filter === s.id} onPick={pickTab} />
                ))}
              </div>
              <div className="ar-figure">
                {sprite && <PlayerSprite config={sprite} size={210} weapon={weapon} idle label="Your adventurer" />}
                {summary.activeSets.length > 0 && <span className="ar-figure-glow" aria-hidden="true" />}
              </div>
              <div className="ar-slots">
                {ARMOR_SLOTS.slice(2).map((s) => (
                  <SlotButton key={s.id} slot={s.id} label={s.label} piece={worn.find((p) => p.slot === s.id)} active={filter === s.id} onPick={pickTab} />
                ))}
              </div>
            </div>

            <div className="ar-label">Worn bonuses</div>
            {totalLines.length > 0 ? (
              <div className="ar-totals">
                {totalLines.map((l) => (
                  <div key={l.label} className="ar-total">
                    <span>{l.label}</span>
                    <b>{l.value}</b>
                  </div>
                ))}
              </div>
            ) : (
              <p className="ar-empty-note">Nothing worn yet.</p>
            )}

            {/* Only sets with at least one piece worn show their bonus progress. */}
            {ARMOR_SETS.filter((set) => (summary.setCounts[set.id] ?? 0) > 0).map((set) => {
              const count = summary.setCounts[set.id] ?? 0;
              const active = count === ARMOR_SLOTS.length;
              return (
                <div key={set.id} className={`ar-set${active ? ' active' : ''}`}>
                  <div className="ar-set-head">
                    <span className="ar-set-name">{set.name} set</span>
                    <span className="ar-pips" aria-label={`${count} of ${ARMOR_SLOTS.length} pieces worn`}>
                      {ARMOR_SLOTS.map((s) => (
                        <i key={s.id} className={worn.some((p) => p.slot === s.id && p.set === set.id) ? 'on' : ''} />
                      ))}
                    </span>
                  </div>
                  <div className="ar-set-bonus">
                    <Icon name={active ? 'sparkle' : 'lock'} />
                    <span>
                      <b>{set.setBonus.name}</b> ({ARMOR_SLOTS.length} pieces): {set.setBonus.description}
                    </span>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="ar-bag-col">
            <div className="ar-tabs" role="tablist">
              {(['all', ...ARMOR_SLOTS.map((s) => s.id)] as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={filter === f}
                  className={`ar-tab${filter === f ? ' on' : ''}`}
                  onClick={() => pickTab(f)}
                >
                  {f === 'all' ? `All · ${items.length}` : `${ARMOR_SLOTS.find((s) => s.id === f)!.label} · ${items.filter((p) => p.slot === f).length}`}
                </button>
              ))}
            </div>

            {shown.length > 0 ? (
              <div className="ar-grid">
                {shown.map((p) => {
                  const isWorn = isArmorEquipped(state, p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`ar-item${p.id === selectedId ? ' current' : ''}${isWorn ? ' worn' : ''}`}
                      style={{ '--rarity': ARMOR_RARITIES[p.rarity].color } as CSSProperties}
                      onClick={() => setSelectedId(p.id)}
                      title={`${ARMOR_RARITIES[p.rarity].name} ${armorPieceName(p)}\n${statSummary(p)}`}
                    >
                      <ArmorIcon piece={p} size={56} />
                      <span className="ar-item-pips" aria-hidden="true">
                        {Object.keys(p.stats).map((k) => (
                          <i key={k} />
                        ))}
                      </span>
                      {isWorn && (
                        <span className="ar-worn" title="Worn">
                          <Icon name="check" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="ar-empty">
                <Icon name="helm" />
                <p>{items.length === 0 ? 'No armor yet. Defeat endless bosses to find some.' : 'No pieces for this slot yet.'}</p>
              </div>
            )}

            {selected && (
              <div className="ar-detail" style={{ '--rarity': ARMOR_RARITIES[selected.rarity].color } as CSSProperties}>
                <div className="ar-detail-icon">
                  <ArmorIcon piece={selected} size={84} />
                </div>
                <div className="ar-detail-body">
                  <div className="ar-detail-name">{armorPieceName(selected)}</div>
                  <div className="ar-detail-kind">
                    {ARMOR_RARITIES[selected.rarity].name} {ARMOR_SLOTS[slotIndex(selected.slot)].label.toLowerCase()} ·{' '}
                    {getArmorSet(selected.set)?.name} set
                  </div>
                  <PieceStats piece={selected} />
                  <div className="ar-actions">
                    {selectedWorn ? (
                      <button type="button" className="btn" onClick={() => unequipArmor(selected.slot)}>
                        Take off
                      </button>
                    ) : (
                      <button type="button" className="btn primary" onClick={() => equipArmor(selected.id)}>
                        <Icon name="check" /> Equip
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn ar-salvage"
                      disabled={selectedWorn}
                      onClick={() => {
                        salvageArmor([selected.id]);
                        setSelectedId(null);
                      }}
                      title={selectedWorn ? 'Take it off before salvaging' : 'Break this piece down for gems'}
                    >
                      Salvage · <Icon name="gem" /> {ARMOR_RARITIES[selected.rarity].salvageGems}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="ar-drops">
              <div className="ar-label">Drops</div>
              <p>
                Endless bosses drop equipment with a {pct(ARMOR_DROPS.endlessBossChance)} chance per boss.
              </p>
              <div className="ar-odds">
                {odds.map(({ rarity, chance }) => (
                  <span key={rarity.id} style={{ '--rarity': rarity.color } as CSSProperties}>
                    {rarity.name} {+(chance * 100).toFixed(1)}%
                  </span>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** One paper-doll slot: the worn piece's icon in its rarity frame, or an empty socket. */
function SlotButton({
  slot,
  label,
  piece,
  active,
  onPick,
}: {
  slot: ArmorSlot;
  label: string;
  piece: ArmorPiece | undefined;
  active: boolean;
  onPick: (slot: ArmorSlot) => void;
}) {
  return (
    <button
      type="button"
      className={`ar-slot${piece ? ' filled' : ''}${active ? ' on' : ''}`}
      style={piece ? ({ '--rarity': ARMOR_RARITIES[piece.rarity].color } as CSSProperties) : undefined}
      onClick={() => onPick(slot)}
      title={piece ? `${label}: ${armorPieceName(piece)}\n${statSummary(piece)}` : `${label}: empty`}
    >
      {piece ? <ArmorIcon piece={piece} size={58} /> : <span className="ar-slot-empty">{label}</span>}
      <span className="ar-slot-label">{label}</span>
    </button>
  );
}

/**
 * A piece's rolled stats: each value, the range its rarity rolls in, and a bar
 * for where the roll landed.
 */
function PieceStats({ piece }: { piece: ArmorPiece }) {
  const stats = piece.stats;
  const keys = ARMOR_STATS.filter((s) => stats[s.key]);
  return (
    <div className="ar-stats">
      {keys.map((s) => {
        const v = stats[s.key] ?? 0;
        const quality = armorRollQuality(s.key, piece.rarity, v);
        return (
          // Every row fills all four grid columns so the labels, values, bars
          // and ranges line up across rows.
          <div key={s.key} className="ar-stat">
            <span className="ar-stat-label">{s.label}</span>
            <b className="ar-stat-value">{formatArmorStat(s.key, v)}</b>
            <span className="ar-roll-bar" title={`Rolls ${formatArmorRange(s.key, piece.rarity)} at this rarity`}>
              <i style={{ width: `${Math.max(6, quality * 100)}%` }} />
            </span>
            <small className="ar-stat-range">{formatArmorRange(s.key, piece.rarity)}</small>
          </div>
        );
      })}
    </div>
  );
}
