import { useState, type CSSProperties } from 'react';
import { useGame } from '../../application/gameContext';
import { ownsUnit } from '../../application/gameState';
import { canAffordSummon, DUPLICATE_REFUND, SUMMON_COST } from '../../application/summon';
import { ALL_RARITIES, RARITIES } from '../../domain/rarity';
import { getUnit, summonableUnits } from '../../domain/units';
import type { SummonOutcome } from '../../application/summon';
import { UnitCard } from '../components/UnitCard';
import { Gems } from '../components/Currency';
import { playSummonSound } from '../summonAudio';

type Stage = 'idle' | 'charging' | 'revealed';

export function Summon() {
  const { state, summon, summonCost } = useGame();
  const [stage, setStage] = useState<Stage>('idle');
  const [result, setResult] = useState<SummonOutcome | null>(null);

  const affordable = canAffordSummon(state.gems);

  // Drop rates read straight from the rarity table: each available rarity's
  // share of the total available weight, so this stays honest as new rarities
  // are switched on. Summonable-but-not-yet-available rarities are "coming soon";
  // non-summonable ranks (Champion — the player's own adventurer) are omitted.
  const available = ALL_RARITIES.filter((r) => r.available);
  const totalWeight = available.reduce((sum, r) => sum + r.weight, 0);
  const dropRates = available
    .map((r) => `${r.name} ${Math.round((r.weight / totalWeight) * 100)}%`)
    .join(' · ');
  const comingSoon = ALL_RARITIES.filter((r) => !r.available && r.summonable).map((r) => r.name);

  const doSummon = () => {
    if (stage === 'charging' || !affordable) return;
    const outcome = summon();
    if (!outcome) return;
    setResult(outcome);
    setStage('charging');
    // The orb channels gems — a rising hum leading into the reveal.
    playSummonSound('charge');
    // Brief charge-up, then reveal with a rarity-scaled chime flourish.
    window.setTimeout(() => {
      setStage('revealed');
      playSummonSound('reveal', RARITIES[outcome.rarity].order);
    }, 850);
  };

  return (
    <main className="screen">
      <div className="section-title" style={{ justifyContent: 'space-between' }}>
        <span>✨ Summoning Altar</span>
        <Gems amount={state.gems} />
      </div>

      <div className="panel">
        <div className="summon-stage">
          {stage === 'idle' && (
            <div>
              <div className="summon-orb">🔮</div>
              <p style={{ marginTop: 16, color: 'var(--text-dim)' }}>
                Channel gems into the orb to call forth a champion.
              </p>
            </div>
          )}

          {stage === 'charging' && <div className="summon-orb charging">🌀</div>}

          {stage === 'revealed' && result && <RevealedUnit outcome={result} />}
        </div>

        <div className="panel-pad" style={{ borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              className="btn primary big"
              onClick={doSummon}
              disabled={!affordable || stage === 'charging'}
            >
              {stage === 'charging' ? 'Summoning…' : `Summon · 💎${summonCost}`}
            </button>
            {stage === 'revealed' && (
              <button className="btn ghost" onClick={() => setStage('idle')}>
                Again
              </button>
            )}
          </div>
          {!affordable && (
            <p style={{ textAlign: 'center', color: 'var(--red)', marginTop: 12, fontSize: 13 }}>
              Not enough gems. Clear realms to earn more.
            </p>
          )}
          <p style={{ textAlign: 'center', color: 'var(--text-faint)', marginTop: 10, fontSize: 12.5 }}>
            Drop rates · {dropRates}
            {comingSoon.length > 0 && (
              <span style={{ opacity: 0.5 }}> ({comingSoon.join(' · ')} coming soon)</span>
            )}
            <br />
            Duplicates refund {Math.round(DUPLICATE_REFUND * 100)}% of the gem cost and grant the champion mastery EXP.
          </p>
        </div>
      </div>

      <div className="section-title" style={{ marginTop: 28 }}>
        🎴 Your Collection <small>{state.ownedUnits.length} / {summonableUnits().length} champions</small>
      </div>
      {state.ownedUnits.length === 0 ? (
        <div className="panel empty-note">No champions yet. Summon one above!</div>
      ) : (
        <div className="card-grid">
          {summonableUnits()
            .filter((u) => ownsUnit(state, u.id))
            .map((u) => (
              <UnitCard key={u.id} unit={u} owned />
            ))}
        </div>
      )}
    </main>
  );
}

function RevealedUnit({ outcome }: { outcome: SummonOutcome }) {
  const rarity = RARITIES[outcome.rarity];
  const unit = getUnit(outcome.unit.id)!;
  const style = { '--rarity': rarity.color } as CSSProperties;
  return (
    <div className="reveal" style={style}>
      <div className="reveal-glow" style={{ display: 'inline-block' }}>
        <div style={{ maxWidth: 220, margin: '0 auto' }}>
          <UnitCard unit={unit} owned />
        </div>
      </div>
      <p style={{ marginTop: 14, fontWeight: 700, color: rarity.color }}>
        {outcome.duplicate
          ? `Another ${unit.name} — already in your ranks!`
          : `A ${rarity.name} ${unit.name} joins your ranks!`}
      </p>
      {outcome.duplicate && (
        <p style={{ marginTop: 4, fontSize: 13, color: '#6fd6ff', fontWeight: 600 }}>
          💎 {Math.round(SUMMON_COST * DUPLICATE_REFUND)} gems refunded · ⭐ +
          {outcome.duplicateExp} {unit.name} mastery EXP
        </p>
      )}
    </div>
  );
}
