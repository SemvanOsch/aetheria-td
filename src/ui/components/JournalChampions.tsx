import { useState, type CSSProperties } from 'react';
import { useGame } from '../../application/gameContext';
import {
  activeMasteryUpgradesFor,
  availableMasteryExp,
  effectiveMasteryUpgradesFor,
  equippedArmor,
  isArmorUnlocked,
  hasAffordableMasteryUpgrade,
  isInTeam,
  isLockedChampion,
  isMasteryDisabled,
  masteryExp,
  masteryUpgradesFor,
  MAX_TEAM_SIZE,
  ownsUnit,
} from '../../application/gameState';
import { attackTypeLabel, damageTypeLabel, getUnit, summonableUnits, type UnitDef } from '../../domain/units';
import { isPlayerChampionId, playerChampionPath } from '../../domain/playerChampion';
import { proficiencyDef } from '../../domain/proficiency';
import { RARITIES } from '../../domain/rarity';
import { championRole, championStatTiles } from '../championStats';
import { ChampionDetail } from './ChampionDetail';
import { Armory } from './Armory';
import { ArmorIcon } from './ArmorIcon';
import { ARMOR_RARITIES, ARMOR_SLOTS, armorPieceName, type ArmorPiece, type ArmorSlot } from '../../domain/armor';
import { armorUnlockNode } from '../../domain/mastery';
import { MasteryTree } from './MasteryTree';
import { UnitSprite } from './UnitSprite';
import { Icon } from './Icon';
import { Flourish, PageCorners } from './JournalArt';

/** Roster entries per right-hand page (a 3 × 3 grid). */
const PER_PAGE = 9;

interface Props {
  /** True once the book is fully open, so the page arrows may show. */
  ready: boolean;
  /** Plays the page-turn sound and sweeps a leaf across the spread. */
  onTurn: (dir: 'next' | 'prev') => void;
}

/**
 * The journal's Champions bookmark. The left page is the selected champion's
 * plate (portrait, lore, a ledger of its battle profile and its actions); the
 * right page is the company you take into battle and the full roster, a page
 * of nine at a time.
 */
export function JournalChampions({ ready, onTurn }: Props) {
  const { state, buyMasteryUpgrade, setActiveMasteryUpgrade, setMasteryDisabled, toggleTeamMember, reorderTeam, placeInTeam, setPrefs } =
    useGame();
  const sortDir = state.prefs.championSort;
  const showMarks = state.prefs.showMasteryMarks;

  // The player's own adventurer isn't summonable, so it would be missing from
  // the summon-based roster: surface any owned one alongside the catalog.
  const playerChampions = state.ownedUnits
    .filter(isPlayerChampionId)
    .map((id) => getUnit(id))
    .filter((u): u is UnitDef => u != null);
  const roster = [...playerChampions, ...summonableUnits()];
  const ownedCount = roster.filter((u) => ownsUnit(state, u.id)).length;
  const teamFull = state.team.length >= MAX_TEAM_SIZE;

  // Owned champions first, then by rarity; ties keep catalog order.
  const all = roster
    .map((u, i) => ({ u, i }))
    .sort((a, b) => {
      const ownedA = ownsUnit(state, a.u.id);
      const ownedB = ownsUnit(state, b.u.id);
      if (ownedA !== ownedB) return ownedA ? -1 : 1;
      const diff = RARITIES[a.u.rarity].order - RARITIES[b.u.rarity].order;
      const byRarity = sortDir === 'desc' ? -diff : diff;
      return byRarity !== 0 ? byRarity : a.i - b.i;
    })
    .map((e) => e.u);

  const [selectedId, setSelectedId] = useState<string>(() => state.team[0] ?? all[0]?.id ?? '');
  const selected = all.find((u) => u.id === selectedId) ?? all[0];
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
  const shown = all.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  // Open sheets hold an id and re-resolve the def each render: a mastery change
  // (e.g. the Blade's Claymore form) rebuilds the def while a sheet is open.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [masteryId, setMasteryId] = useState<string | null>(null);
  const detail = detailId ? getUnit(detailId) ?? null : null;
  const masteryUnit = masteryId ? getUnit(masteryId) ?? null : null;
  // The armory, when open, and the slot tab it opens on ('all' = every piece).
  const [armoryTab, setArmoryTab] = useState<ArmorSlot | 'all' | null>(null);

  // Team slot drag-to-reorder (the hero is pinned to the first slot).
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  // A roster card being dragged onto the company (its unit id).
  const [rosterDrag, setRosterDrag] = useState<string | null>(null);
  const endDrag = () => {
    setDragIndex(null);
    setDragOverIndex(null);
    setRosterDrag(null);
  };

  const turn = (dir: 'next' | 'prev') => {
    const target = dir === 'next' ? page + 1 : page - 1;
    if (target < 0 || target >= pages) return;
    onTurn(dir);
    setPage(target);
  };

  return (
    <>
      <div className="book-page left" key={`jc-left-${selected?.id}`}>
        <PageCorners />
        {selected && (
          <ChampionPlate
            unit={selected}
            owned={ownsUnit(state, selected.id)}
            locked={isLockedChampion(state, selected.id)}
            inTeam={isInTeam(state, selected.id)}
            teamFull={teamFull}
            purchased={effectiveMasteryUpgradesFor(state, selected.id)}
            availableExp={availableMasteryExp(state, selected.id)}
            masteryReady={hasAffordableMasteryUpgrade(state, selected.id)}
            onToggleTeam={() => toggleTeamMember(selected.id)}
            onMastery={() => setMasteryId(selected.id)}
            onDetail={() => setDetailId(selected.id)}
            armor={isPlayerChampionId(selected.id) ? equippedArmor(state) : undefined}
            armorLocked={!isArmorUnlocked(state)}
            onArmory={(slot) => setArmoryTab(slot ?? 'all')}
          />
        )}
      </div>

      <div className="book-page right" key={`jc-right-${page}`}>
        <PageCorners />
        <div className="id-header">Champions</div>
        <Flourish className="id-flourish j-tight" />

        <div className={`jc-company${rosterDrag ? ' receiving' : ''}`}>
          <div className="j-row-head">
            <span className="id-label">Your Company</span>
            <span className="j-count">
              {state.team.length - 1} / {MAX_TEAM_SIZE - 1}
            </span>
          </div>
          <div className="jc-slots">
            {Array.from({ length: MAX_TEAM_SIZE }).map((_, i) => {
              const id = state.team[i];
              const def = id ? getUnit(id) : undefined;
              if (!def) {
                // An empty slot takes a roster card dropped on it.
                return (
                  <span
                    key={`empty-${i}`}
                    className={`jc-slot empty${rosterDrag && dragOverIndex === i ? ' drop-target' : ''}`}
                    aria-hidden="true"
                    onDragEnter={() => setDragOverIndex(i)}
                    onDragOver={(e) => {
                      if (!rosterDrag) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'copy';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (rosterDrag) placeInTeam(rosterDrag, i);
                      endDrag();
                    }}
                  >
                    <Icon name="plus" />
                  </span>
                );
              }
              const locked = isLockedChampion(state, def.id);
              const dropTarget =
                dragOverIndex === i && !locked && ((dragIndex !== null && dragIndex !== i) || rosterDrag !== null);
              return (
                <div
                  key={def.id}
                  className={`jc-slot${locked ? ' hero' : ''}${dragIndex === i ? ' dragging' : ''}${dropTarget ? ' drop-target' : ''}${def.id === selected?.id ? ' current' : ''}`}
                  draggable={!locked}
                  onDragStart={(e) => {
                    setDragIndex(i);
                    e.dataTransfer.effectAllowed = 'move';
                    // Firefox requires data to be set for the drag to begin.
                    e.dataTransfer.setData('text/plain', String(i));
                  }}
                  onDragEnter={() => setDragOverIndex(i)}
                  onDragOver={(e) => {
                    if (locked) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = rosterDrag ? 'copy' : 'move';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    // A roster card swaps in for this member; a slot drag reorders.
                    if (!locked && rosterDrag) placeInTeam(rosterDrag, i);
                    else if (dragIndex !== null && !locked) reorderTeam(dragIndex, i);
                    endDrag();
                  }}
                  onDragEnd={endDrag}
                >
                  <button
                    type="button"
                    className="jc-slot-face"
                    onClick={() => setSelectedId(def.id)}
                    title={locked ? `${def.name}, your hero, always deployed` : `${def.name} · drag to reorder`}
                  >
                    <UnitSprite unit={def} size={38} animate={false} />
                  </button>
                  {locked ? (
                    <span className="jc-slot-mark" aria-hidden="true">
                      <Icon name="lock" />
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="jc-slot-mark remove"
                      onClick={() => toggleTeamMember(def.id)}
                      aria-label={`Remove ${def.name} from your company`}
                      title="Remove from company"
                    >
                      <Icon name="close" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="j-row-head jc-roster-head">
          <span className="id-label">
            Roster <em>{ownedCount} of {all.length} recruited</em>
          </span>
          <span className="j-tools">
            <button
              type="button"
              onClick={() => setPrefs({ championSort: sortDir === 'desc' ? 'asc' : 'desc' })}
              title={`Sort by rarity: ${sortDir === 'desc' ? 'rarest first' : 'most common first'}`}
            >
              Rarity {sortDir === 'desc' ? '↓' : '↑'}
            </button>
            <button
              type="button"
              className={showMarks ? '' : 'off'}
              onClick={() => setPrefs({ showMasteryMarks: !showMarks })}
              title={showMarks ? 'Hide skill-ready marks' : 'Show skill-ready marks'}
            >
              Marks {showMarks ? 'on' : 'off'}
            </button>
          </span>
        </div>

        <div className="j-grid">
          {shown.map((u) => {
            const owned = ownsUnit(state, u.id);
            const rarity = RARITIES[u.rarity];
            // Owned champions not yet in the company can be dragged onto a slot.
            const draggable = owned && !isInTeam(state, u.id) && !isLockedChampion(state, u.id);
            return (
              <button
                key={u.id}
                type="button"
                className={`j-card${owned ? '' : ' faded'}${u.id === selected?.id ? ' current' : ''}${rosterDrag === u.id ? ' dragging' : ''}`}
                style={{ '--rarity': rarity.color } as CSSProperties}
                onClick={() => setSelectedId(u.id)}
                draggable={draggable}
                title={draggable ? `${u.name} · drag onto your company to enlist` : undefined}
                onDragStart={(e) => {
                  if (!draggable) return;
                  setRosterDrag(u.id);
                  e.dataTransfer.effectAllowed = 'copy';
                  // Firefox requires data to be set for the drag to begin.
                  e.dataTransfer.setData('text/plain', u.id);
                }}
                onDragEnd={endDrag}
              >
                {showMarks && owned && hasAffordableMasteryUpgrade(state, u.id) && (
                  <span className="j-card-dot" title="A skill-tree upgrade is affordable" />
                )}
                {isInTeam(state, u.id) && (
                  <span className="j-card-stamp" title="In your company">
                    <Icon name="check" />
                  </span>
                )}
                <span className="j-card-art">
                  <UnitSprite unit={u} size={60} animate={false} />
                </span>
                <span className="j-card-name">{u.name}</span>
                <span className="j-card-sub">{owned ? rarity.name : 'Not recruited'}</span>
              </button>
            );
          })}
        </div>

        {pages > 1 && <div className="page-folio">Page {page + 1} of {pages}</div>}
      </div>

      {ready && page > 0 && (
        <button className="journal-arrow left" onClick={() => turn('prev')} aria-label="Previous roster page">
          <Icon name="back" />
        </button>
      )}
      {ready && page < pages - 1 && (
        <button className="journal-arrow right" onClick={() => turn('next')} aria-label="Next roster page">
          <Icon name="forward" />
        </button>
      )}

      {detail && (
        <ChampionDetail
          unit={detail}
          owned={ownsUnit(state, detail.id)}
          availableExp={availableMasteryExp(state, detail.id)}
          purchased={effectiveMasteryUpgradesFor(state, detail.id)}
          onOpenMastery={() => {
            setDetailId(null);
            setMasteryId(detail.id);
          }}
          onOpenArmory={
            isPlayerChampionId(detail.id) && isArmorUnlocked(state)
              ? () => {
                setDetailId(null);
                setArmoryTab('all');
              }
              : undefined
          }
          onClose={() => setDetailId(null)}
        />
      )}
      {masteryUnit && (
        <MasteryTree
          unit={masteryUnit}
          exp={masteryExp(state, masteryUnit.id)}
          availableExp={availableMasteryExp(state, masteryUnit.id)}
          purchased={masteryUpgradesFor(state, masteryUnit.id)}
          active={activeMasteryUpgradesFor(state, masteryUnit.id)}
          disabled={isMasteryDisabled(state, masteryUnit.id)}
          onBuy={(upgradeId) => buyMasteryUpgrade(masteryUnit.id, upgradeId)}
          onSetActive={(upgradeId) => setActiveMasteryUpgrade(masteryUnit.id, upgradeId)}
          onToggleDisabled={(off) => setMasteryDisabled(masteryUnit.id, off)}
          onClose={() => setMasteryId(null)}
        />
      )}
      {armoryTab && <Armory initialTab={armoryTab} onClose={() => setArmoryTab(null)} />}
    </>
  );
}

/** The left page: one champion drawn as a plate, with its ledger and actions. */
function ChampionPlate({
  unit,
  owned,
  locked,
  inTeam,
  teamFull,
  purchased,
  availableExp,
  masteryReady,
  onToggleTeam,
  onMastery,
  onDetail,
  armor,
  armorLocked,
  onArmory,
}: {
  unit: UnitDef;
  owned: boolean;
  locked: boolean;
  inTeam: boolean;
  teamFull: boolean;
  purchased: string[];
  availableExp: number;
  masteryReady: boolean;
  onToggleTeam: () => void;
  onMastery: () => void;
  onDetail: () => void;
  /** The worn armor, for the player's own adventurer only (else undefined). */
  armor?: ArmorPiece[];
  /** Armor not yet unlocked through the skill tree: the slots show locked. */
  armorLocked?: boolean;
  /** Open the armory, on one slot's tab when given. */
  onArmory: (slot?: ArmorSlot) => void;
}) {
  const rarity = RARITIES[unit.rarity];
  const path = playerChampionPath(unit.id);
  const traits = [
    championRole(unit),
    unit.attackType && attackTypeLabel(unit.attackType),
    unit.damageType && damageTypeLabel(unit.damageType),
  ].filter(Boolean);

  return (
    <div className="j-entry" style={{ '--rarity': rarity.color } as CSSProperties}>
      <div className="plate-kicker">
        {rarity.name} {unit.rarity === 'hero' ? '' : 'Champion'}
      </div>
      <div className={`j-frame${owned ? '' : ' faded'}`}>
        <UnitSprite unit={unit} size={150} />
        {!owned && <span className="j-frame-stamp">Not yet recruited</span>}
      </div>
      <div className="j-name">{unit.name}</div>
      <div className="j-traits">
        {path ? `Hero of the ${proficiencyDef(path).label} · ` : ''}
        {traits.join(' · ')}
      </div>
      <div className="j-ledger">
        {championStatTiles(unit, purchased).map((t) => (
          <div key={t.label} className="j-ledger-row" title={t.sub}>
            <span>{t.label}</span>
            <i aria-hidden="true" />
            <b>{t.value}</b>
          </div>
        ))}
      </div>

      {armor && owned && armorLocked && (
        <button
          type="button"
          className="j-armor locked"
          onClick={onMastery}
          title={`Armor is locked — learn ${armorUnlockNode(unit.id)?.name ?? 'the major skill'} in the skill tree`}
        >
          {ARMOR_SLOTS.map((s) => (
            <span key={s.id} className="j-armor-slot">
              <Icon name="lock" />
            </span>
          ))}
        </button>
      )}
      {armor && owned && !armorLocked && (
        <div className="j-armor">
          {ARMOR_SLOTS.map((s) => {
            const item = armor.find((p) => p.slot === s.id);
            return (
              <button
                type="button"
                key={s.id}
                className={`j-armor-slot${item ? ' filled' : ''}`}
                style={item ? ({ '--rarity': ARMOR_RARITIES[item.rarity].color } as CSSProperties) : undefined}
                onClick={() => onArmory(s.id)}
                title={item ? `${s.label}: ${armorPieceName(item)}` : `${s.label}: empty`}
                aria-label={`Open the armory on ${s.label}`}
              >
                {item ? <ArmorIcon piece={item} size={30} /> : <Icon name="plus" />}
              </button>
            );
          })}
        </div>
      )}

      <div className="j-actions">
        {owned &&
          (locked ? (
            <span className="j-btn static">
              <Icon name="lock" /> Hero
            </span>
          ) : (
            <button
              type="button"
              className={`j-btn${inTeam ? ' on' : ''}`}
              disabled={!inTeam && teamFull}
              onClick={onToggleTeam}
            >
              {inTeam ? (
                <>
                  <Icon name="check" /> In company
                </>
              ) : teamFull ? (
                'Company full'
              ) : (
                <>
                  <Icon name="plus" /> Enlist
                </>
              )}
            </button>
          ))}
        {owned && (
          <button type="button" className="j-btn" onClick={onMastery}>
            <Icon name="tree" /> Skills
            <small>{availableExp.toLocaleString()} EXP</small>
            {masteryReady && <span className="j-btn-dot" />}
          </button>
        )}
        {armor && owned && !armorLocked && (
          <button type="button" className="j-btn" onClick={() => onArmory()}>
            <Icon name="shield" /> Armor
          </button>
        )}
        <button type="button" className="j-btn" onClick={onDetail}>
          <Icon name="book" /> Full record
        </button>
      </div>
    </div>
  );
}
