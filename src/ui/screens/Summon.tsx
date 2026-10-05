import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGame } from '../../application/gameContext';
import { ownsUnit } from '../../application/gameState';
import { canAffordSummon, DUPLICATE_REFUND, SUMMON_COST } from '../../application/summon';
import { ALL_RARITIES, RARITIES } from '../../domain/rarity';
import { getUnit, summonableUnits } from '../../domain/units';
import type { SummonOutcome } from '../../application/summon';
import { UnitCard } from '../components/UnitCard';
import { UnitSprite } from '../components/UnitSprite';
import { Icon } from '../components/Icon';
import { SummonFx, type SummonPhase } from '../components/SummonFx';
import { playSummonSound } from '../summonAudio';

/**
 * Ceremony timeline (ms from pressing Summon). The room darkens and energy
 * spirals into the orb; a flash; the champion stands as a silhouette in the
 * rarity's light; it resolves and its name is announced.
 */
const T_FLASH = 1400;
const T_SILHOUETTE = 1520;
const T_REVEAL = 2300;

export function Summon({ onBack }: { onBack: () => void }) {
  const { state, summon, summonCost } = useGame();
  const [phase, setPhase] = useState<SummonPhase>('idle');
  const [result, setResult] = useState<SummonOutcome | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const affordable = canAffordSummon(state.gems);
  const busy = phase === 'charging' || phase === 'flash' || phase === 'silhouette';

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
    if (busy || !affordable) return;
    const outcome = summon();
    if (!outcome) return;
    setResult(outcome);
    setPhase('charging');
    // The orb channels gems — a rising hum leading into the reveal.
    playSummonSound('charge');
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    at(T_FLASH, () => {
      setPhase('flash');
      playSummonSound('reveal', RARITIES[outcome.rarity].order);
    });
    at(T_SILHOUETTE, () => setPhase('silhouette'));
    at(T_REVEAL, () => setPhase('revealed'));
  };

  const rarity = result ? RARITIES[result.rarity] : null;
  const unit = result ? getUnit(result.unit.id)! : null;
  const style = { '--rarity': rarity?.color ?? '#a9b8ff', '--ray-strength': 0.25 + (rarity?.order ?? 0) * 0.18 } as CSSProperties;

  return (
    <main className="screen">
      <div className="section-title" style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn ghost sort-toggle" onClick={onBack}>
            <Icon name="back" /> Home
          </button>
          <Icon name="orb" style={{ color: 'var(--gold)' }} /> Summoning Altar
        </span>
      </div>

      <div className={`panel ornate summon-altar ${phase} ${result?.rarity ?? ''}`} style={style}>
        <div className="summon-stage">
          <SummonFx phase={phase} color={rarity?.color ?? '#a9b8ff'} tier={rarity?.order ?? 0} />
          <div className="summon-dim" />

          {(phase === 'idle' || phase === 'charging' || phase === 'flash') && (
            <div className="summon-idle">
              <div className={`summon-orb ${phase === 'charging' || phase === 'flash' ? 'charging' : ''}`}>
                <Icon name="sparkle" />
              </div>
              {phase === 'idle' && (
                <p className="summon-hint">Channel gems into the orb to call forth a champion.</p>
              )}
            </div>
          )}

          {(phase === 'silhouette' || phase === 'revealed') && result && unit && rarity && (
            <div className={`reveal ${phase}`}>
              <div className="reveal-hero">
                <div className="summon-rays" />
                <div className={`reveal-figure ${phase === 'silhouette' ? 'silhouette' : ''}`}>
                  <UnitSprite unit={unit} size={180} />
                </div>
                {/* Laid out from the silhouette on (hidden) so the figure never
                    shifts: the caption just fades in as the colour resolves. */}
                <div className={`reveal-caption ${phase === 'revealed' ? 'shown' : ''}`} aria-hidden={phase !== 'revealed'}>
                  <div className="reveal-rarity">{rarity.name}</div>
                  <div className="reveal-name">{unit.name}</div>
                  <p className="reveal-note">
                    {result.duplicate ? (
                      <>
                        Another <b>{unit.name}</b> answers the call.
                      </>
                    ) : (
                      <>
                        A <b>{rarity.name}</b> champion joins your ranks.
                      </>
                    )}
                  </p>
                  {result.duplicate && (
                    <p style={{ marginTop: 6, fontSize: 13, color: '#9fd8ff', fontWeight: 600, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
                      <span>
                        <Icon name="gem" /> {Math.round(SUMMON_COST * DUPLICATE_REFUND)} refunded
                      </span>
                      <span style={{ color: 'var(--gold-hi)' }}>
                        <Icon name="star" /> +{result.duplicateExp} mastery EXP
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="summon-flash" />
        </div>

        <div className="panel-pad" style={{ borderTop: '1px solid var(--border)', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="btn primary big" onClick={doSummon} disabled={!affordable || busy}>
              {busy ? (
                'Summoning…'
              ) : (
                <>
                  <Icon name="sparkle" /> Summon · <Icon name="gem" /> {summonCost}
                </>
              )}
            </button>
          </div>
          {!affordable && (
            <p style={{ textAlign: 'center', color: 'var(--red)', marginTop: 12, fontSize: 13 }}>
              Not enough gems. Clear realms to earn more.
            </p>
          )}
          <p className="drop-rates">
            Drop rates · {dropRates}
            {comingSoon.length > 0 && <span style={{ opacity: 0.6 }}> ({comingSoon.join(' · ')} coming soon)</span>}
            <br />
            Duplicates refund {Math.round(DUPLICATE_REFUND * 100)}% of the gem cost and grant the champion mastery EXP.
          </p>
        </div>
      </div>

      <div className="section-title" style={{ marginTop: 30 }}>
        <Icon name="helm" /> Your Collection{' '}
        <small>
          {summonableUnits().filter((u) => state.ownedUnits.includes(u.id)).length} / {summonableUnits().length} champions
        </small>
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
