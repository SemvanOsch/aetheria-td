import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGame } from '../../application/gameContext';
import {
  effectiveMasteryUpgradesFor,
  resolvedMasteryUpgrades,
  REPLAY_GEM_REWARD,
} from '../../application/gameState';
import { getLevel } from '../../domain/levels';
import {
  attackTypeLabel,
  damageTypeLabel,
  formatAttackSpeed,
  getUnit,
  maxUpgradeTier,
  nextUpgrade,
  upgradeEffectLabel,
} from '../../domain/units';
import {
  masteryStartingGoldBonus,
  masteryUpgradeCost,
  masteryUpgradeDeltas,
} from '../../domain/mastery';
import { SELECTABLE_TARGETING, targetingLabel, type TargetingType } from '../../domain/targeting';
import { BOARD_HEIGHT, BOARD_WIDTH } from '../../domain/grid';
import { RARITIES } from '../../domain/rarity';
import { GameEngine } from '../../engine/GameEngine';
import { drawBoard, type RenderUiState } from '../../engine/renderer';
import type { Outcome } from '../../engine/types';
import { playCombatSound } from '../combatAudio';
import { UnitSprite } from '../components/UnitSprite';

interface Props {
  levelId: number;
  onExit: () => void;
  onHome: () => void;
  onRetry: () => void;
}

/** Snapshot of engine fields the HUD needs (updated each frame). */
interface Hud {
  currency: number;
  baseHealth: number;
  maxBaseHealth: number;
  waveIndex: number;
  totalWaves: number;
  enemiesRemaining: number;
  phase: string;
  outcome: Outcome;
  showBossBanner: boolean;
}

/** Live info for the hovered-enemy tooltip, positioned as % of the board. */
interface EnemyTooltip {
  name: string;
  health: number;
  maxHealth: number;
  boss: boolean;
  /** Physical damage reduction fraction (0-1), if any — shows a gray shield. */
  physicalResist: number;
  /** Magic damage reduction fraction (0-1), if any — shows a blue shield. */
  magicResist: number;
  xPct: number;
  yPct: number;
}

/**
 * Small shield badge shown beside a resistant enemy's name — gray for physical
 * armour, blue for magic wards. Inline SVG so the colours are exact and theme-
 * independent (unlike a 🛡 emoji, which ignores CSS `color`).
 */
function ResistShield({ kind, pct }: { kind: 'physical' | 'magic'; pct: number }) {
  const fill = kind === 'physical' ? '#9aa6be' : '#6ad0ff';
  const stroke = kind === 'physical' ? '#5c6577' : '#2f7fb0';
  return (
    <svg
      className="et-resist"
      width="12"
      height="14"
      viewBox="0 0 24 28"
      aria-hidden="true"
    >
      <title>{`${kind === 'physical' ? 'Physical' : 'Magic'} resistance: ${pct}%`}</title>
      <path
        d="M12 1 L22 5 V13 C22 20 17 25 12 27 C7 25 2 20 2 13 V5 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GameScreen({ levelId, onExit, onHome, onRetry }: Props) {
  const game = useGame();
  const level = getLevel(levelId)!;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  // UI selection state (drives the side panel + is read by the renderer).
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedTowerUid, setSelectedTowerUid] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [tooltip, setTooltip] = useState<EnemyTooltip | null>(null);
  // Fast-forward: run the simulation at 3× by sub-stepping the engine. Mirrored
  // into a ref so the rAF loop reads the current speed without re-subscribing.
  const [fastForward, setFastForward] = useState(false);
  const speedRef = useRef(1);
  speedRef.current = fastForward ? 3 : 1;
  // Uid of the enemy currently hovered (read each frame to refresh the tooltip).
  const hoverEnemyRef = useRef<number | null>(null);
  // Bumped on place/sell to refresh deploy counts immediately (independent of
  // the rAF-driven HUD, e.g. while paused/hidden).
  const [, setDeployTick] = useState(0);
  const refreshDeploys = () => setDeployTick((t) => t + 1);

  // Mirror selection + hover into refs so the RAF loop reads fresh values
  // without re-subscribing each render.
  const uiRef = useRef<RenderUiState>({
    hoverCol: -1,
    hoverRow: -1,
    selectedUnitId: null,
    selectedTowerUid: null,
  });
  uiRef.current.selectedUnitId = selectedUnitId;
  uiRef.current.selectedTowerUid = selectedTowerUid;

  const settledRef = useRef(false);
  const firstClearRef = useRef(false);
  // Only the configured team may be deployed this stage.
  const teamIds = game.state.team;

  const showFlash = (msg: string) => {
    setFlash(msg);
    window.clearTimeout((showFlash as unknown as { t?: number }).t);
    (showFlash as unknown as { t?: number }).t = window.setTimeout(
      () => setFlash(null),
      1600,
    );
  };

  // ---- Engine lifecycle + render loop -------------------------------------
  useEffect(() => {
    // Only the *active* member of an exclusive path (e.g. one of the Farmer's
    // two paths) applies, so resolve the map before the engine or passive team
    // bonuses read it.
    const activeUpgrades = resolvedMasteryUpgrades(game.state);
    // Passive team bonuses (e.g. Fresh Food) top up the stage's starting gold.
    const startingGold =
      level.startingGold +
      masteryStartingGoldBonus(game.state.team, activeUpgrades);
    const engine = new GameEngine(level, startingGold, activeUpgrades);
    engineRef.current = engine;
    settledRef.current = false;

    const canvas = canvasRef.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = BOARD_WIDTH * dpr;
    canvas.height = BOARD_HEIGHT * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    let raf = 0;
    let last = performance.now();
    let bossBannerUntil = 0;

    const snapshot = (now: number): Hud => ({
      currency: Math.round(engine.currency),
      baseHealth: engine.baseHealth,
      maxBaseHealth: engine.maxBaseHealth,
      waveIndex: engine.waveIndex,
      totalWaves: engine.totalWaves,
      enemiesRemaining: engine.enemiesRemaining,
      phase: engine.phase,
      outcome: engine.outcome,
      showBossBanner: now < bossBannerUntil,
    });

    // Recompute the hovered-enemy tooltip from the live enemy each frame so it
    // follows the enemy and shows current HP. Passing null bails out of a
    // re-render when nothing is hovered (same reference).
    const updateTooltip = () => {
      const uid = hoverEnemyRef.current;
      const e = uid != null ? engine.enemies.find((x) => x.uid === uid && !x.dead) : undefined;
      setTooltip(
        e
          ? {
              name: e.def.name,
              health: Math.max(0, Math.ceil(e.health)),
              maxHealth: e.def.health,
              boss: e.def.boss,
              physicalResist: e.def.physicalResist ?? 0,
              magicResist: e.def.magicResist ?? 0,
              xPct: (e.pos.x / BOARD_WIDTH) * 100,
              yPct: (e.pos.y / BOARD_HEIGHT) * 100,
            }
          : null,
      );
    };

    // Seed HUD + first draw synchronously so the board and stats are correct
    // on first paint (before requestAnimationFrame fires / while tab hidden).
    drawBoard(ctx, engine, uiRef.current);
    setHud(snapshot(last));

    const frame = (now: number) => {
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05; // clamp big pauses (tab switch)

      // Raise the boss banner as soon as a boss-bearing wave begins, even if the
      // boss's own spawn is delayed within that wave. Latched by the engine at
      // wave start; clear it here once consumed.
      if (engine.bossWaveStarted) {
        bossBannerUntil = now + 2500;
        engine.bossWaveStarted = false;
      }

      // Fast-forward advances the sim multiple normal-sized steps per frame,
      // keeping each step's fidelity (vs. one oversized dt that skips motion).
      const steps = speedRef.current;
      for (let i = 0; i < steps; i++) {
        engine.update(dt);
        if (engine.outcome !== 'playing') break; // stop stepping once settled
      }

      // Drain this frame's sound cues (the audio layer throttles each type, so
      // dense bursts stay light) and clear the queue for the next frame.
      if (engine.sfx.length) {
        for (const s of engine.sfx) playCombatSound(s);
        engine.sfx.length = 0;
      }

      drawBoard(ctx, engine, uiRef.current);
      setHud(snapshot(now));
      updateTooltip();

      // Settle rewards/progression exactly once when the battle ends.
      if (engine.outcome !== 'playing' && !settledRef.current) {
        settledRef.current = true;
        // Champion mastery EXP is earned from kills regardless of the outcome,
        // so it banks on both victory and defeat.
        game.awardMastery(engine.masteryEarned);
        // Enemy kills bank win or lose too — they feed the Enemy Index unlocks.
        game.awardEnemyKills(engine.enemyKills);
        // Gold is a per-stage resource and does not persist; only the gem
        // reward is banked, on the first clear.
        if (engine.outcome === 'won') {
          firstClearRef.current = !game.state.completedLevels.includes(level.id);
          game.completeLevel(level.id, level.gemReward);
        }
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(raf);
    // Engine is created once per level mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelId]);

  // ---- Pointer handling ---------------------------------------------------
  const pointerToBoard = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * BOARD_WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * BOARD_HEIGHT,
    };
  };

  const pointerToCell = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = pointerToBoard(e);
    return engineRef.current!.cellFromPoint(x, y);
  };

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = pointerToBoard(e);
    const engine = engineRef.current!;
    const cell = engine.cellFromPoint(x, y);
    uiRef.current.hoverCol = cell.col;
    uiRef.current.hoverRow = cell.row;
    const enemy = engine.enemyAt(x, y);
    hoverEnemyRef.current = enemy ? enemy.uid : null;
  };

  const handleLeave = () => {
    uiRef.current.hoverCol = -1;
    uiRef.current.hoverRow = -1;
    hoverEnemyRef.current = null;
    setTooltip(null);
  };

  const handleClick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current!;
    if (engine.outcome !== 'playing') return;
    const { col, row } = pointerToCell(e);

    // Clicking an existing tower selects it.
    const existing = engine.towerAt(col, row);
    if (existing) {
      setSelectedTowerUid(existing.uid);
      setSelectedUnitId(null);
      return;
    }

    // Placing a selected unit.
    if (selectedUnitId) {
      const def = getUnit(selectedUnitId)!;
      if (!engine.canDeployMore(selectedUnitId)) {
        showFlash(`Deploy limit reached (${def.deployLimit} ${def.name}s).`);
        return;
      }
      if (!engine.canPlaceAt(col, row)) {
        showFlash('Cannot build there.');
        return;
      }
      if (engine.currency < def.cost) {
        showFlash('Not enough gold to deploy.');
        return;
      }
      if (engine.placeUnit(selectedUnitId, col, row)) {
        // Select the unit we just placed (leave placement mode).
        const placed = engine.towerAt(col, row);
        setSelectedUnitId(null);
        setSelectedTowerUid(placed ? placed.uid : null);
        refreshDeploys();
      }
      return;
    }

    setSelectedTowerUid(null);
  };

  /** Cancel the current placement selection / tower selection. */
  const clearSelection = () => {
    setSelectedUnitId(null);
    setSelectedTowerUid(null);
  };

  // Right-click on the board cancels the current placement.
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    clearSelection();
  };

  // Escape also cancels the current selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- Actions ------------------------------------------------------------
  const startWave = () => engineRef.current?.startWave();

  const setTargeting = (type: TargetingType) => {
    if (selectedTowerUid == null) return;
    engineRef.current?.setTowerTargeting(selectedTowerUid, type);
    refreshDeploys();
  };

  const upgradeSelected = () => {
    if (selectedTowerUid == null) return;
    const ok = engineRef.current?.upgradeTower(selectedTowerUid);
    if (!ok) {
      showFlash('Not enough gold to upgrade.');
      return;
    }
    refreshDeploys();
  };

  const sellSelected = () => {
    const engine = engineRef.current!;
    const tower = engine.towers.find((t) => t.uid === selectedTowerUid);
    if (!tower) return;
    engine.sellUnit(tower.col, tower.row);
    setSelectedTowerUid(null);
    refreshDeploys();
  };

  const selectedTower = engineRef.current?.towers.find(
    (t) => t.uid === selectedTowerUid,
  );

  const canStartWave =
    hud?.phase === 'prep' && hud.outcome === 'playing' && hud.waveIndex < hud.totalWaves;

  return (
    <main className="game-wrap">
      <div className="game-hud">
        <button className="btn ghost" onClick={onExit}>
          ← Retreat
        </button>
        <div className="hud-stat">
          <span className="lbl">Realm</span> {level.name}
        </div>
        <div className="hud-stat">
          <span className="lbl">Wave</span>
          {Math.min((hud?.waveIndex ?? 0) + 1, hud?.totalWaves ?? 0)} / {hud?.totalWaves ?? 0}
        </div>
        <div className="hud-stat">
          <span className="lbl">Foes</span> {hud?.enemiesRemaining ?? 0}
        </div>
        <div className="hud-stat">
          <span className="lbl">Castle</span>
          <div className="base-bar">
            <span
              style={{
                width: `${((hud?.baseHealth ?? 0) / (hud?.maxBaseHealth ?? 1)) * 100}%`,
              }}
            />
          </div>
          {hud?.baseHealth ?? 0}
        </div>
        <div className="hud-stat" style={{ color: 'var(--gold)' }}>
          🪙 {hud?.currency ?? 0}
        </div>
        <button
          className={`btn ff-toggle ${fastForward ? 'active' : ''}`}
          onClick={() => setFastForward((v) => !v)}
          title="Fast forward (3× game speed)"
          aria-pressed={fastForward}
        >
          ⏩ {fastForward ? '3×' : '1×'}
        </button>
      </div>

      <div className="board-layout">
        <div className="board-column">
        <div className="board-frame">
          <canvas
            ref={canvasRef}
            style={{ aspectRatio: `${BOARD_WIDTH} / ${BOARD_HEIGHT}` }}
            onPointerMove={handleMove}
            onPointerLeave={handleLeave}
            onPointerDown={handleClick}
            onContextMenu={handleContextMenu}
          />
          {tooltip && hud?.outcome === 'playing' && (
            <div
              className={`enemy-tooltip ${tooltip.boss ? 'boss' : ''} ${tooltip.yPct < 22 ? 'below' : ''}`}
              style={{ left: `${tooltip.xPct}%`, top: `${tooltip.yPct}%` }}
            >
              <div className="et-name">
                {tooltip.boss && '☠ '}
                {tooltip.name}
                {tooltip.physicalResist > 0 && (
                  <ResistShield
                    kind="physical"
                    pct={Math.round(tooltip.physicalResist * 100)}
                  />
                )}
                {tooltip.magicResist > 0 && (
                  <ResistShield kind="magic" pct={Math.round(tooltip.magicResist * 100)} />
                )}
              </div>
              <div className="et-hpbar">
                <span style={{ width: `${(tooltip.health / tooltip.maxHealth) * 100}%` }} />
              </div>
              <div className="et-hp">
                {tooltip.health} / {tooltip.maxHealth} HP
              </div>
            </div>
          )}
          <div className="board-overlay">
            {hud?.showBossBanner && hud.outcome === 'playing' && (
              <div className="boss-banner">☠ A BOSS APPROACHES ☠</div>
            )}
            {hud && hud.outcome !== 'playing' && (
              <ResultCard
                outcome={hud.outcome}
                gemReward={level.gemReward}
                firstClear={firstClearRef.current}
                onExit={onExit}
                onHome={onHome}
                onRetry={onRetry}
              />
            )}
          </div>
        </div>

          <div className="panel panel-pad deploy-bar">
            <div className="deploy-bar-head">
              <div className="t-name" style={{ fontWeight: 700 }}>
                Deploy Champions
              </div>
              <p className="hint" style={{ margin: 0 }}>
                {selectedUnitId
                  ? 'Click a green tile to deploy. Right-click or Esc to cancel.'
                  : 'Select a champion, then click the map to place it.'}
              </p>
            </div>
            {teamIds.length === 0 ? (
              <p className="hint">
                Your team is empty. Configure it in the Champions menu.
              </p>
            ) : (
              <div className="deploy-list cards">
                {teamIds.map((id) => {
                  const def = getUnit(id)!;
                  const engine = engineRef.current;
                  const deployed = engine?.deployedCount(id) ?? 0;
                  const atLimit = deployed >= def.deployLimit;
                  const affordable = (hud?.currency ?? 0) >= def.cost;
                  // Mastery-adjusted stats the unit will deploy with (single
                  // source), falling back to base stats before the engine mounts.
                  const stats = engine?.deployStats(id);
                  const dmg = stats?.damage ?? def.damage;
                  const spd = stats?.attackSpeed ?? def.attackSpeed;
                  const rng = stats?.range ?? def.range;
                  return (
                    <button
                      key={id}
                      className={`deploy-item ${selectedUnitId === id ? 'active' : ''}`}
                      disabled={atLimit}
                      onClick={() => {
                        setSelectedUnitId((cur) => (cur === id ? null : id));
                        setSelectedTowerUid(null);
                      }}
                    >
                      <span className="ic"><UnitSprite unit={def} size={34} /></span>
                      <span className="nm">
                        <b>{def.name}</b>
                        <span className={atLimit ? 'limit-hit' : ''}>
                          {deployed}/{def.deployLimit} deployed
                        </span>
                      </span>
                      <span className={`cost ${affordable ? '' : 'unaffordable'}`}>🪙{def.cost}</span>
                      <span className="deploy-stats-tip" role="tooltip">
                        {def.generator ? (
                          <>
                            <span className="dst-row"><span>Harvest</span><b>🪙{def.generator.amount}</b></span>
                            <span className="dst-row"><span>Harvests</span><b>{def.generator.timesPerWave}/wave</b></span>
                          </>
                        ) : (
                          <>
                            <span className="dst-row"><span>Attack</span><b>{dmg}</b></span>
                            <span className="dst-row"><span>Atk Speed</span><b>{formatAttackSpeed(spd)}/s</b></span>
                            <span className="dst-row"><span>Range</span><b>{rng}</b></span>
                          </>
                        )}
                        {atLimit && <span className="dst-limit">Deploy limit reached</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <aside className="side-panel">
          {canStartWave && (
            <button className="btn primary block" onClick={startWave}>
              {hud && hud.waveIndex === 0 ? '▶ Start Battle' : '▶ Next Wave'}
            </button>
          )}
          {hud?.phase === 'wave' && (
            <div className="panel panel-pad" style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
              ⚔️ Wave in progress…
            </div>
          )}

          {!selectedTower && (
            <div className="panel panel-pad" style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
              Select a deployed champion to inspect and upgrade it.
            </div>
          )}

          {selectedTower && (
            <div className="panel panel-pad selected-tower-box">
              <div className="t-head">
                <div className="t-title">
                  <span className="t-name-text">{selectedTower.def.name}</span>
                  {selectedTower.upgradeTier > 0 && (
                    <span className="tier-badge">Lv {selectedTower.upgradeTier}</span>
                  )}
                </div>
                <div
                  className="unit-portrait t-portrait"
                  style={{ '--rarity': RARITIES[selectedTower.def.rarity].color } as CSSProperties}
                >
                  <UnitSprite unit={selectedTower.def} size={56} />
                </div>
                {(selectedTower.def.attackType || selectedTower.def.damageType) && (
                  <div className="t-tags">
                    {selectedTower.def.attackType && (
                      <span className={`aoe-tag ${selectedTower.def.attackType}`}>
                        {attackTypeLabel(selectedTower.def.attackType)}
                      </span>
                    )}
                    {selectedTower.def.damageType && (
                      <span className={`aoe-tag ${selectedTower.def.damageType}`}>
                        {damageTypeLabel(selectedTower.def.damageType)}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {selectedTower.def.generator ? (
                <div className="stat-row" style={{ marginTop: 4 }}>
                  <div className="s">Harvest <b>🪙{selectedTower.genAmount}</b></div>
                  <div className="s">Per wave <b>{selectedTower.def.generator.timesPerWave}×</b></div>
                  <div className="s">Left <b>{selectedTower.genLeft} this wave</b></div>
                  <div className="s">Total <b>🪙{selectedTower.genAmount * selectedTower.def.generator.timesPerWave}/wave</b></div>
                </div>
              ) : (
                <div className="stat-row" style={{ marginTop: 4 }}>
                  <div className="s">DMG <b>{selectedTower.damage}</b></div>
                  <div className="s">SPD <b>{formatAttackSpeed(selectedTower.attackSpeed)}/s</b></div>
                  <div className="s">Range <b>{selectedTower.range}</b></div>
                  <div className="s">DPS <b>{(selectedTower.damage * selectedTower.attackSpeed).toFixed(0)}{selectedTower.burstCount > 1 ? ` x${selectedTower.burstCount}` : ''}</b></div>
                  <div className="s">Crit <b>{+(selectedTower.critChance * 100).toFixed(2)}%</b></div>
                  <div className="s">Crit Dmg <b>{selectedTower.critMultiplier}×</b></div>
                </div>
              )}

              {(() => {
                const up = nextUpgrade(selectedTower.def, selectedTower.upgradeTier);
                if (!up) {
                  return (
                    <div className="upgrade-box maxed">✦ Fully upgraded (Lv {maxUpgradeTier(selectedTower.def)})</div>
                  );
                }
                const upCost = masteryUpgradeCost(
                  selectedTower.def,
                  selectedTower.upgradeTier + 1,
                  effectiveMasteryUpgradesFor(game.state, selectedTower.def.id),
                );
                const affordable = (hud?.currency ?? 0) >= upCost;
                return (
                  <button
                    className="upgrade-box"
                    disabled={!affordable}
                    onClick={upgradeSelected}
                  >
                    <div className="up-head">
                      <span>⬆ {up.name}</span>
                      <span className="up-cost">🪙{upCost}</span>
                    </div>
                    <div className="up-eff">
                      {upgradeEffectLabel({
                        ...masteryUpgradeDeltas(
                          selectedTower.def,
                          selectedTower.upgradeTier + 1,
                          effectiveMasteryUpgradesFor(game.state, selectedTower.def.id),
                        ),
                        setAoe: up.setAoe,
                        coneAngle: selectedTower.def.coneAngle,
                      })}
                    </div>
                  </button>
                );
              })()}

              {!selectedTower.def.generator && (
                <div className="target-select">
                  <div className="target-label">Targeting · <b>{targetingLabel(selectedTower.targeting)}</b></div>
                  <div className="target-btns">
                    {SELECTABLE_TARGETING.map((opt) => (
                      <button
                        key={opt.type}
                        className={`target-btn ${selectedTower.targeting === opt.type ? 'active' : ''}`}
                        onClick={() => setTargeting(opt.type)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {engineRef.current?.canSell(selectedTower.uid) ? (
                <button
                  className="btn danger block"
                  style={{ marginTop: 12 }}
                  onClick={sellSelected}
                >
                  Sell · +🪙{engineRef.current?.sellValue(selectedTower.uid) ?? 0}
                </button>
              ) : (
                <p className="hint" style={{ marginTop: 12, textAlign: 'center' }}>
                  🔒 Your champion can't be sold.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>

      {flash && <div className="flash-msg">{flash}</div>}
    </main>
  );
}

function ResultCard({
  outcome,
  gemReward,
  firstClear,
  onExit,
  onHome,
  onRetry,
}: {
  outcome: Outcome;
  gemReward: number;
  firstClear: boolean;
  onExit: () => void;
  onHome: () => void;
  onRetry: () => void;
}) {
  const won = outcome === 'won';
  return (
    <div className={`panel result-card ${won ? 'win' : 'lose'}`}>
      <h2>{won ? '🏆 Victory!' : '💀 Defeated'}</h2>
      <p style={{ color: 'var(--text-dim)' }}>
        {won
          ? 'The realm is saved. The boss lies vanquished!'
          : 'Your castle has fallen. Regroup and try again.'}
      </p>
      <div className="reward">
        {won && firstClear && (
          <div style={{ color: '#6fd6ff' }}>Realm reward · 💎{gemReward}</div>
        )}
        {won && !firstClear && (
          <div style={{ color: '#6fd6ff' }}>
            Replay reward · 💎{REPLAY_GEM_REWARD}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button className="btn ghost" onClick={onHome}>
          Home
        </button>
        {won ? (
          <button className="btn primary" onClick={onExit}>
            Continue
          </button>
        ) : (
          <button className="btn primary" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
