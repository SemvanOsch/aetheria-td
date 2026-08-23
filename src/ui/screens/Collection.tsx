import { useState } from 'react';
import { useGame } from '../../application/gameContext';
import {
  activeMasteryUpgradesFor,
  availableMasteryExp,
  effectiveMasteryUpgradesFor,
  isInTeam,
  isMasteryDisabled,
  masteryExp,
  masteryUpgradesFor,
  MAX_TEAM_SIZE,
  ownsUnit,
} from '../../application/gameState';
import { getUnit, summonableUnits, type UnitDef } from '../../domain/units';
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
  } = useGame();
  const [detail, setDetail] = useState<UnitDef | null>(null);
  const [masteryUnit, setMasteryUnit] = useState<UnitDef | null>(null);
  // 'desc' = rarest first (default), 'asc' = most common first.
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const roster = summonableUnits();
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
        <button
          className="btn ghost sort-toggle"
          onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
          title={`Sort by rarity: ${sortDir === 'desc' ? 'rarest first' : 'most common first'}`}
        >
          Rarity {sortDir === 'desc' ? '↓' : '↑'}
        </button>
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
            return def ? (
              <button
                key={def.id}
                className="team-slot filled"
                title={`Remove ${def.name} from team`}
                onClick={() => toggleTeamMember(def.id)}
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
          Only these champions can be deployed in a stage. Tap an owned card
          below to add or remove it.
        </p>
      </div>

      <div className="card-grid">
        {all.map((u) => {
          const owned = ownsUnit(state, u.id);
          const inTeam = isInTeam(state, u.id);
          return (
            <div key={u.id} className={owned ? '' : 'not-owned'}>
              <UnitCard
                unit={u}
                owned={owned}
                masteryPurchased={effectiveMasteryUpgradesFor(state, u.id)}
                onClick={() => setDetail(u)}
              />
              {owned && (
                <button
                  className={`team-toggle ${inTeam ? 'in' : ''}`}
                  disabled={!inTeam && teamFull}
                  onClick={() => toggleTeamMember(u.id)}
                >
                  {inTeam ? '✓ In Team' : teamFull ? 'Team Full' : '+ Add to Team'}
                </button>
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
