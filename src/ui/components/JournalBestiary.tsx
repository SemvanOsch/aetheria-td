import { useState } from 'react';
import { useGame } from '../../application/gameContext';
import { enemyKillCount, isEnemyUnlocked } from '../../application/gameState';
import {
  BOSS_ENEMIES,
  ENEMY_KILLS_TO_UNLOCK,
  REGULAR_ENEMIES,
  type EnemyDef,
} from '../../domain/enemies';
import { foeKicker, foeLedgerRows, foeTraits } from '../foeNotes';
import { EnemySprite } from './EnemySprite';
import { Icon } from './Icon';
import { CompassRose, Flourish, PageCorners } from './JournalArt';

/** Entries per right-hand page (a 3 × 3 grid). */
const PER_PAGE = 9;

type Tab = 'normal' | 'boss';

interface Props {
  /** True once the book is fully open, so the page arrows may show. */
  ready: boolean;
  /** Plays the page-turn sound and sweeps a leaf across the spread. */
  onTurn: (dir: 'next' | 'prev') => void;
}

/**
 * The journal's Bestiary bookmark: field notes on every foe met. The right
 * page indexes them (normal foes and bosses on their own tabs, nine to a
 * page); an undiscovered foe is an inked silhouette with its unlock progress.
 * The left page is the selected foe's entry: its figure, a ledger of its
 * numbers, its resistances, its trick and its lore.
 */
export function JournalBestiary({ ready, onTurn }: Props) {
  const { state } = useGame();
  const [tab, setTab] = useState<Tab>('normal');
  const [page, setPage] = useState(0);
  const list = tab === 'normal' ? REGULAR_ENEMIES : BOSS_ENEMIES;
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const shown = list.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  const discovered = list.filter((e) => isEnemyUnlocked(state, e)).length;

  const firstUnlocked = (l: EnemyDef[]) => l.find((e) => isEnemyUnlocked(state, e))?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(() => firstUnlocked(REGULAR_ENEMIES));
  const selected = [...REGULAR_ENEMIES, ...BOSS_ENEMIES].find((e) => e.id === selectedId) ?? null;

  const switchTab = (t: Tab) => {
    if (t === tab) return;
    onTurn(t === 'boss' ? 'next' : 'prev');
    setTab(t);
    setPage(0);
    setSelectedId(firstUnlocked(t === 'normal' ? REGULAR_ENEMIES : BOSS_ENEMIES));
  };

  const turn = (dir: 'next' | 'prev') => {
    const target = dir === 'next' ? page + 1 : page - 1;
    if (target < 0 || target >= pages) return;
    onTurn(dir);
    setPage(target);
  };

  return (
    <>
      <div className="book-page left" key={`jb-left-${selected?.id ?? tab}`}>
        <PageCorners />
        {selected ? (
          <FoeEntry def={selected} kills={enemyKillCount(state, selected.id)} />
        ) : (
          <div className="frontispiece">
            <CompassRose className="frontis-rose" />
            <div className="frontispiece-kicker">These pages wait for</div>
            <div className="frontispiece-title">{tab === 'boss' ? 'Bosses' : 'Foes'} Unmet</div>
            <Flourish />
            <div className="frontispiece-motto">
              {tab === 'boss'
                ? 'Defeat a boss to record it here.'
                : `Slay ${ENEMY_KILLS_TO_UNLOCK} of a kind to learn its ways.`}
            </div>
          </div>
        )}
      </div>

      <div className="book-page right" key={`jb-right-${tab}-${page}`}>
        <PageCorners />
        <div className="id-header">Bestiary</div>
        <Flourish className="id-flourish j-tight" />

        <div className="jb-tabs" role="tablist">
          {(['normal', 'boss'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? 'active' : ''}
              onClick={() => switchTab(t)}
            >
              <Icon name={t === 'boss' ? 'skull' : 'bestiary'} /> {t === 'boss' ? 'Bosses' : 'Foes'}
            </button>
          ))}
          <span className="j-count">
            {discovered} / {list.length} recorded
          </span>
        </div>

        <div className="j-grid">
          {shown.map((def) => {
            const unlocked = isEnemyUnlocked(state, def);
            const kills = enemyKillCount(state, def.id);
            return (
              <button
                key={def.id}
                type="button"
                className={`j-card${unlocked ? '' : ' unknown'}${def.id === selectedId ? ' current' : ''}`}
                disabled={!unlocked}
                onClick={() => setSelectedId(def.id)}
              >
                <span className="j-card-art">
                  <EnemySprite enemy={def} size={60} animate={false} silhouette={!unlocked} />
                </span>
                <span className="j-card-name">{unlocked ? def.name : '???'}</span>
                {unlocked ? (
                  <span className="j-card-sub">{def.boss ? 'Defeated' : `${kills.toLocaleString()} slain`}</span>
                ) : def.boss ? (
                  <span className="j-card-sub">Defeat to record</span>
                ) : (
                  <span className="j-card-progress" title={`${Math.min(kills, ENEMY_KILLS_TO_UNLOCK)} / ${ENEMY_KILLS_TO_UNLOCK} slain`}>
                    <span style={{ width: `${Math.min(100, (kills / ENEMY_KILLS_TO_UNLOCK) * 100)}%` }} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {pages > 1 && <div className="page-folio">Page {page + 1} of {pages}</div>}
      </div>

      {ready && page > 0 && (
        <button className="journal-arrow left" onClick={() => turn('prev')} aria-label="Previous bestiary page">
          <Icon name="back" />
        </button>
      )}
      {ready && page < pages - 1 && (
        <button className="journal-arrow right" onClick={() => turn('next')} aria-label="Next bestiary page">
          <Icon name="forward" />
        </button>
      )}
    </>
  );
}

/** The left page: one recorded foe, written up as field notes. */
function FoeEntry({ def, kills }: { def: EnemyDef; kills: number }) {
  const rows = foeLedgerRows(def, kills);

  return (
    <div className={`j-entry foe${def.boss ? ' boss' : ''}`}>
      <div className="plate-kicker">{foeKicker(def)}</div>
      <div className="j-frame foe">
        <EnemySprite enemy={def} size={def.boss ? 160 : 136} />
      </div>
      <div className="j-name">{def.name}</div>
      <div className="j-traits">{foeTraits(def)}</div>

      <div className="j-ledger">
        {rows.map((r) => (
          <div key={r.label} className="j-ledger-row">
            <span>{r.label}</span>
            <i aria-hidden="true" />
            <b>{r.value}</b>
          </div>
        ))}
      </div>

      <div className="j-notes">
        {def.mechanic && (
          <p className="j-mechanic">
            <b>Beware:</b> {def.mechanic}
          </p>
        )}
        <p className="j-lore">{def.lore ?? 'The archivists have yet to record this tale…'}</p>
      </div>
    </div>
  );
}
