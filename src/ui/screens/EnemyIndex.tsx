import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../../application/gameContext';
import {
  enemyKillCount,
  isEnemyUnlocked,
} from '../../application/gameState';
import {
  BOSS_ENEMIES,
  ENEMY_KILLS_TO_UNLOCK,
  hasResistance,
  REGULAR_ENEMIES,
  type EnemyDef,
} from '../../domain/enemies';
import { EnemySprite } from '../components/EnemySprite';

type Tab = 'normal' | 'boss';

/** Coarse speed descriptor for the detail sheet. */
function speedLabel(speed: number): string {
  if (speed >= 85) return 'Fast';
  if (speed >= 40) return 'Medium';
  return 'Slow';
}

/**
 * Bestiary screen. Two tabs — normal enemies and bosses. A normal enemy's entry
 * unlocks after ENEMY_KILLS_TO_UNLOCK kills; a boss's entry unlocks on its first
 * defeat. Locked entries are shown as silhouettes with unlock progress. Tapping
 * an unlocked entry opens its detailed info sheet.
 */
export function EnemyIndex() {
  const { state } = useGame();
  const [tab, setTab] = useState<Tab>('normal');
  const [detail, setDetail] = useState<EnemyDef | null>(null);

  const list = tab === 'normal' ? REGULAR_ENEMIES : BOSS_ENEMIES;
  const unlockedCount = list.filter((e) => isEnemyUnlocked(state, e)).length;

  return (
    <main className="screen">
      <div className="section-title">
        📖 Enemy Index{' '}
        <small>{unlockedCount} / {list.length} discovered — tap an entry for details</small>
      </div>

      <div className="index-tabs">
        <button
          className={`btn ghost index-tab ${tab === 'normal' ? 'active' : ''}`}
          onClick={() => setTab('normal')}
        >
          Enemies
        </button>
        <button
          className={`btn ghost index-tab ${tab === 'boss' ? 'active' : ''}`}
          onClick={() => setTab('boss')}
        >
          Bosses
        </button>
      </div>

      <div className="enemy-grid">
        {list.map((def) => {
          const unlocked = isEnemyUnlocked(state, def);
          const kills = enemyKillCount(state, def.id);
          return (
            <button
              key={def.id}
              className={`enemy-index-card ${unlocked ? '' : 'locked'} ${def.boss ? 'boss' : ''}`}
              onClick={() => unlocked && setDetail(def)}
              disabled={!unlocked}
            >
              <span
                className="ei-token"
                style={{
                  background: unlocked ? `${def.visual.color}22` : undefined,
                  borderColor: unlocked ? def.visual.color : undefined,
                }}
              >
                {unlocked ? <EnemySprite enemy={def} size={44} /> : '❓'}
              </span>
              <span className="ei-name">{unlocked ? def.name : '???'}</span>
              <span className="ei-progress">
                {unlocked
                  ? def.boss
                    ? 'Defeated'
                    : `${kills.toLocaleString()} defeated`
                  : def.boss
                    ? 'Defeat to unlock'
                    : `${Math.min(kills, ENEMY_KILLS_TO_UNLOCK)} / ${ENEMY_KILLS_TO_UNLOCK}`}
              </span>
              {!unlocked && !def.boss && (
                <span className="ei-bar">
                  <span
                    style={{ width: `${Math.min(100, (kills / ENEMY_KILLS_TO_UNLOCK) * 100)}%` }}
                  />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {detail && <EnemyDetail def={detail} onClose={() => setDetail(null)} />}
    </main>
  );
}

/** Detailed info sheet for a single unlocked enemy. */
function EnemyDetail({ def, onClose }: { def: EnemyDef; onClose: () => void }) {
  const rows: { label: string; value: string }[] = [
    { label: 'Health', value: `❤️ ${def.health.toLocaleString()} HP` },
    { label: 'Speed', value: `${def.speed} px/s (${speedLabel(def.speed)})` },
    // Bosses omit the castle-damage row (it's an instant loss if they break through).
    ...(def.boss ? [] : [{ label: 'Damage to castle', value: `${def.damageToBase}` }]),
  ];
  if (def.dodgeChance) {
    rows.push({ label: 'Evasion', value: `${Math.round(def.dodgeChance * 100)}% dodge` });
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="panel modal enemy-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="champion-head">
          <div
            className="ei-token big"
            style={{ background: `${def.visual.color}22`, borderColor: def.visual.color }}
          >
            <EnemySprite enemy={def} size={56} />
          </div>
          <div>
            <h2 style={{ textAlign: 'left', color: 'var(--text)' }}>
              {def.boss && '☠ '}
              {def.name}
            </h2>
            <div className="rarity-row" style={{ justifyContent: 'flex-start', marginTop: 4 }}>
              <span className={`aoe-tag ${def.boss ? 'line' : 'single'}`}>
                {def.boss ? 'Boss' : 'Enemy'}
              </span>
              {hasResistance(def) && <span className="aoe-tag physical">Resistant</span>}
            </div>
          </div>
        </div>

        <div className="detail-grid">
          {rows.map((r) => (
            <div key={r.label} className="detail-row">
              <span>{r.label}</span>
              <b>{r.value}</b>
            </div>
          ))}
        </div>

        <div className="enemy-section">Resistances</div>
        {hasResistance(def) ? (
          <div className="resist-list">
            {(def.physicalResist ?? 0) > 0 && (
              <div className="resist-line">
                <span className="resist-chip physical">🛡 Physical</span>
                <span>−{Math.round((def.physicalResist ?? 0) * 100)}% physical damage taken</span>
              </div>
            )}
            {(def.magicResist ?? 0) > 0 && (
              <div className="resist-line">
                <span className="resist-chip magic">🛡 Magic</span>
                <span>−{Math.round((def.magicResist ?? 0) * 100)}% magic damage taken</span>
              </div>
            )}
          </div>
        ) : (
          <p className="hint" style={{ marginTop: 0 }}>Takes full damage from all sources.</p>
        )}

        {def.mechanic && (
          <>
            <div className="enemy-section">Mechanic</div>
            <p className="enemy-mechanic">{def.mechanic}</p>
          </>
        )}

        <div className="enemy-section">Lore</div>
        <p className="enemy-lore">
          {def.lore ?? 'The archivists have yet to record this tale…'}
        </p>
      </div>
    </div>,
    document.body,
  );
}
