import { useState } from 'react';
import { useGame } from '../../application/gameContext';
import {
  activeMasteryUpgradesFor,
  availableMasteryExp,
  effectiveMasteryUpgradesFor,
  hasAffordableMasteryUpgrade,
  isInTeam,
  isLockedChampion,
  isMasteryDisabled,
  masteryExp,
  masteryUpgradesFor,
  MAX_TEAM_SIZE,
  ownsUnit,
} from '../../application/gameState';
import { getUnit, summonableUnits, type UnitDef } from '../../domain/units';
import { isPlayerChampionId } from '../../domain/playerChampion';
import { RARITIES } from '../../domain/rarity';
import { UnitCard } from '../components/UnitCard';
import { UnitSprite } from '../components/UnitSprite';
import { ChampionDetail } from '../components/ChampionDetail';
import { MasteryTree } from '../components/MasteryTree';

/**
 * Champions collection menu. Lists every champion (owned highlighted, unowned
 * dimmed), lets the player configure their deployable team, and opens a
 * detailed info sheet on click.
 */
export function Collection() {
  const {
    state,
    buyMasteryUpgrade,
    setActiveMasteryUpgrade,
    setMasteryDisabled,
    toggleTeamMember,
    reorderTeam,
    setPrefs,
  } = useGame();
  const [detail, setDetail] = useState<UnitDef | null>(null);
  const [masteryUnit, setMasteryUnit] = useState<UnitDef | null>(null);
  // Persisted preferences: 'desc' = rarest first (default), 'asc' = most common;
  // showMarks toggles the "mastery upgrade available" dots on cards.
  const sortDir = state.prefs.championSort;
  const showMarks = state.prefs.showMasteryMarks;
  // Index of the team slot currently being dragged, and the slot it's hovering
  // over (for the drop-target highlight). Both null when no drag is in flight.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const endDrag = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // The player's own adventurer(s) aren't summonable, so they'd be missing from
  // the summon-based roster — surface any owned one alongside the catalog.
  const playerChampions = state.ownedUnits
    .filter(isPlayerChampionId)
    .map((id) => getUnit(id))
    .filter((u): u is UnitDef => u != null);
  const roster = [...playerChampions, ...summonableUnits()];
  const ownedCount = roster.filter((u) => ownsUnit(state, u.id)).length;
  const teamFull = state.team.length >= MAX_TEAM_SIZE;

  // Owned champions first, then by rarity; ties keep catalog order so cards stay
  // stable within a rank.
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

  return (
    <main className="screen">
      <div className="section-title" style={{ justifyContent: 'space-between' }}>
        <span>
          🎴 Champions <small>{ownedCount} / {all.length} collected — tap a card for details</small>
        </span>
        <div className="collection-controls">
          <button
            className={`btn ghost sort-toggle marks-toggle ${showMarks ? '' : 'off'}`}
            onClick={() => setPrefs({ showMasteryMarks: !showMarks })}
            title={showMarks ? 'Hide mastery-available marks' : 'Show mastery-available marks'}
          >
            {showMarks ? '🔔 Marks On' : '🔕 Marks Off'}
          </button>
          <button
            className="btn ghost sort-toggle"
            onClick={() => setPrefs({ championSort: sortDir === 'desc' ? 'asc' : 'desc' })}
            title={`Sort by rarity: ${sortDir === 'desc' ? 'rarest first' : 'most common first'}`}
          >
            Rarity {sortDir === 'desc' ? '↓' : '↑'}
          </button>
        </div>
      </div>

      <div className="team-bar">
        <div className="team-bar-head">
          <span className="team-bar-title">⚔️ Your Team</span>
          <span className="team-bar-count">{state.team.length} / {MAX_TEAM_SIZE}</span>
        </div>
        <div className="team-slots">
          {Array.from({ length: MAX_TEAM_SIZE }).map((_, i) => {
            const id = state.team[i];
            const def = id ? getUnit(id) : undefined;
            const locked = id != null && isLockedChampion(state, id);
            const dragging = dragIndex === i;
            const dropTarget =
              dragOverIndex === i && dragIndex !== null && dragIndex !== i;
            // The personal champion is pinned to the first slot: it can't be
            // dragged, reordered, or removed. Render it as a distinct locked slot.
            if (def && locked) {
              return (
                <div
                  key={def.id}
                  className="team-slot filled champion-slot"
                  title={`${def.name} — your champion, always deployed`}
                >
                  <span className="team-slot-ic"><UnitSprite unit={def} size={34} /></span>
                  <span className="team-slot-lock">🔒</span>
                </div>
              );
            }
            return def ? (
              <button
                key={def.id}
                className={`team-slot filled${dragging ? ' dragging' : ''}${dropTarget ? ' drop-target' : ''}`}
                title={`Drag to reorder · click to remove ${def.name}`}
                draggable
                onClick={() => toggleTeamMember(def.id)}
                onDragStart={(e) => {
                  setDragIndex(i);
                  e.dataTransfer.effectAllowed = 'move';
                  // Firefox requires data to be set for the drag to begin.
                  e.dataTransfer.setData('text/plain', String(i));
                }}
                onDragEnter={() => setDragOverIndex(i)}
                onDragOver={(e) => {
                  // Allow dropping onto other filled slots.
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) reorderTeam(dragIndex, i);
                  endDrag();
                }}
                onDragEnd={endDrag}
              >
                <span className="team-slot-ic"><UnitSprite unit={def} size={34} /></span>
                <span className="team-slot-x">✕</span>
              </button>
            ) : (
              <div key={`empty-${i}`} className="team-slot empty">
                +
              </div>
            );
          })}
        </div>
        <p className="hint team-bar-hint">
          Only these champions can be deployed in a stage.
        </p>
      </div>

      <div className="card-grid">
        {all.map((u) => {
          const owned = ownsUnit(state, u.id);
          const inTeam = isInTeam(state, u.id);
          const masteryReady =
            showMarks && owned && hasAffordableMasteryUpgrade(state, u.id);
          return (
            <div key={u.id} className={owned ? '' : 'not-owned'}>
              {masteryReady && (
                <span
                  className="mastery-ready-dot"
                  title="A mastery upgrade is available"
                  aria-label="Mastery upgrade available"
                />
              )}
              <UnitCard
                unit={u}
                owned={owned}
                masteryPurchased={effectiveMasteryUpgradesFor(state, u.id)}
                onClick={() => setDetail(u)}
              />
              {owned && (
                isLockedChampion(state, u.id) ? (
                  <button className="team-toggle champion locked" disabled>
                    🔒 Champion
                  </button>
                ) : (
                  <button
                    className={`team-toggle ${inTeam ? 'in' : ''}`}
                    disabled={!inTeam && teamFull}
                    onClick={() => toggleTeamMember(u.id)}
                  >
                    {inTeam ? '✓ In Team' : teamFull ? 'Team Full' : '+ Add to Team'}
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>

      <p className="hint" style={{ marginTop: 16 }}>
        More champions — and the Rare, Epic and Legendary ranks — arrive in
        future updates.
      </p>

      {detail && (
        <ChampionDetail
          unit={detail}
          owned={ownsUnit(state, detail.id)}
          availableExp={availableMasteryExp(state, detail.id)}
          purchased={effectiveMasteryUpgradesFor(state, detail.id)}
          onOpenMastery={() => setMasteryUnit(detail)}
          onClose={() => setDetail(null)}
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
          onSetActive={(upgradeId) =>
            setActiveMasteryUpgrade(masteryUnit.id, upgradeId)
          }
          onToggleDisabled={(off) => setMasteryDisabled(masteryUnit.id, off)}
          onClose={() => setMasteryUnit(null)}
        />
      )}
    </main>
  );
}
