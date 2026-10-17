/**
 * Test play: the draft stage run by the real `GameEngine` and drawn by the real
 * renderer, with the draft's foes, champions and skill trees installed. It is a
 * sandbox — no rewards are banked, nothing touches player progress or the
 * game's saves (the editor never imports the game's store or storage).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { BOARD_HEIGHT, BOARD_WIDTH, TILE } from '@game/domain/grid';
import { getUnit, formatAttackSpeed, nextUpgrade, type UnitDef } from '@game/domain/units';
import { masteryUpgradeCost } from '@game/domain/mastery';
import { SELECTABLE_TARGETING, type TargetingType } from '@game/domain/targeting';
import { PLAYER_CHAMPION_IDS } from '@game/domain/playerChampion';
import { GameEngine } from '@game/engine/GameEngine';
import { drawBoard, type RenderUiState } from '@game/engine/renderer';
import type { Tower } from '@game/engine/types';
import { useEditor } from '../../store/projectStore';
import { installHeroes, installProject, testMastery, type MasteryMode } from '../../content/runtime';
import { levelOrder, levelToDef } from '../../model/convert';
import { enemyIdsUsedBy } from '../../model/queries';
import { clone, fmt, seededRng } from '../../model/util';
import type { EditorLevel } from '../../model/types';
import { bossKey, enemyKey, levelKey, unitKey } from '../../model/entities';
import { validateProject, type Issue } from '../../validation/validate';
import { Button, IssueList, Modal, NumberInput, Segmented, Toggle } from '../kit';
import { Icon } from '../Icon';

interface Hud {
  gold: number;
  lives: number;
  maxLives: number;
  wave: number;
  total: number;
  remaining: number;
  phase: string;
  outcome: string;
  time: number;
}

interface WaveLog {
  wave: number;
  seconds: number;
  livesLost: number;
  goldAfter: number;
}

const SPEEDS = [1, 2, 4, 8] as const;

export function TestPlay({ level, onClose }: { level: EditorLevel; onClose: () => void }) {
  const { working } = useEditor();
  const [gold, setGold] = useState(level.startingGold);
  const [masteryMode, setMasteryMode] = useState<MasteryMode>('none');
  const [heroes, setHeroes] = useState(true);
  const [seed, setSeed] = useState(1);
  const [run, setRun] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [paused, setPaused] = useState(false);
  const [autoWave, setAutoWave] = useState(false);
  const [hud, setHud] = useState<Hud | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [selectedTower, setSelectedTower] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<WaveLog[]>([]);
  const [, force] = useState(0);
  const engineRef = useRef<GameEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ui = useRef<RenderUiState>({ hoverCol: -1, hoverRow: -1, selectedUnitId: null, selectedTowerUid: null });
  const sim = useRef<{ advance: (seconds: number, until?: (e: GameEngine) => boolean) => void; paint: () => void; snapshot: () => void } | null>(null);
  const ctl = useRef({ speed, paused, autoWave });
  ctl.current = { speed, paused, autoWave };

  // Problems that make the stage unplayable: its own errors and its foes'.
  const blocking = useMemo<Issue[]>(() => {
    const issues = validateProject(working);
    const foes = enemyIdsUsedBy(level);
    foes.add(level.bossId);
    const keys = new Set<string>([levelKey(level.id)]);
    for (const id of foes) keys.add(/^boss\d+$/.test(id) ? bossKey(Number(id.slice(4))) : enemyKey(id));
    return issues.filter((i) => i.severity === 'error' && keys.has(i.entity));
  }, [working, level]);

  const brokenUnits = useMemo(() => {
    const issues = validateProject(working);
    return new Set(working.units.filter((u) => issues.some((i) => i.severity === 'error' && i.entity === unitKey(u.id))).map((u) => u.id));
  }, [working]);

  const deployable = useMemo(() => {
    const ids = working.units.map((u) => u.id).filter((id) => !brokenUnits.has(id));
    return heroes ? [...ids, ...Object.values(PLAYER_CHAMPION_IDS)] : ids;
  }, [working.units, brokenUnits, heroes]);

  // Build (or rebuild) the engine.
  useEffect(() => {
    if (blocking.length) return;
    setError(null);
    setLog([]);
    setSelectedTower(null);
    try {
      const project = clone(working);
      installProject(project);
      const mastery = testMastery(project, masteryMode);
      if (heroes) installHeroes(mastery);
      const l = project.levels.find((x) => x.id === level.id)!;
      engineRef.current = new GameEngine(levelToDef(l, levelOrder(project, l)), gold, mastery, seededRng(seed));
      engineRef.current.armorUnlocked = false;
    } catch (e) {
      engineRef.current = null;
      setError((e as Error).message);
    }
    // Rebuild only on an explicit (re)start, not on every edit elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, blocking.length]);

  // Simulation + render loop. Stepping, painting and the HUD are also exposed
  // through `sim` for the Step / Skip buttons (which work even while a hidden
  // tab has paused requestAnimationFrame).
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(BOARD_WIDTH * dpr);
    canvas.height = Math.round(BOARD_HEIGHT * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0;
    let last = performance.now();
    let lastHud = 0;
    let waveStart = { at: 0, lives: 0, index: -1 };
    let clock = 0;

    const stepOnce = (engine: GameEngine, dt: number) => {
      const beforePhase = engine.phase;
      engine.update(dt);
      clock += dt;
      if (beforePhase === 'wave' && engine.phase !== 'wave' && waveStart.index >= 0) {
        const entry = { wave: waveStart.index + 1, seconds: clock - waveStart.at, livesLost: waveStart.lives - engine.baseHealth, goldAfter: Math.round(engine.currency) };
        setLog((l) => [...l, entry]);
        waveStart = { at: clock, lives: engine.baseHealth, index: -1 };
      }
      if (engine.phase === 'wave' && waveStart.index < 0) waveStart = { at: clock, lives: engine.baseHealth, index: engine.waveIndex - 1 };
      if (ctl.current.autoWave && engine.phase === 'prep' && engine.outcome === 'playing' && engine.waveIndex > 0 && engine.waveIndex < engine.totalWaves) engine.startWave();
      engine.sfx.length = 0;
    };
    const paint = () => {
      const engine = engineRef.current;
      if (!engine) return;
      try {
        drawBoard(ctx, engine, ui.current);
      } catch (e) {
        setError(`Renderer: ${(e as Error).message}`);
      }
    };
    const snapshot = () => {
      const engine = engineRef.current;
      if (!engine) return;
      setHud({
        gold: Math.round(engine.currency),
        lives: engine.baseHealth,
        maxLives: engine.maxBaseHealth,
        wave: engine.waveIndex,
        total: engine.totalWaves,
        remaining: engine.enemiesRemaining,
        phase: engine.phase,
        outcome: engine.outcome,
        time: clock,
      });
    };
    /** Run the sim for up to `seconds` in fixed 60 Hz steps, or until `until` holds. */
    const advance = (seconds: number, until?: (e: GameEngine) => boolean) => {
      const engine = engineRef.current;
      if (!engine) return;
      const dt = 1 / 60;
      for (let t = 0; t < seconds && engine.outcome === 'playing'; t += dt) {
        stepOnce(engine, dt);
        if (until?.(engine)) break;
      }
      paint();
      snapshot();
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const engine = engineRef.current;
      if (!engine) return;
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;
      const steps = ctl.current.paused ? 0 : ctl.current.speed;
      for (let i = 0; i < steps && engine.outcome === 'playing'; i++) stepOnce(engine, dt);
      engine.sfx.length = 0;
      paint();
      if (now - lastHud > 100) {
        lastHud = now;
        snapshot();
      }
    };
    paint();
    snapshot();
    sim.current = { advance, paint, snapshot };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      sim.current = null;
    };
  }, [run, blocking.length]);

  useEffect(() => {
    ui.current.selectedUnitId = selectedUnit;
    ui.current.selectedTowerUid = selectedTower;
  }, [selectedUnit, selectedTower]);

  const restart = useCallback(() => setRun((r) => r + 1), []);
  const cellAt = (e: MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { col: Math.floor((((e.clientX - r.left) / r.width) * BOARD_WIDTH) / TILE), row: Math.floor((((e.clientY - r.top) / r.height) * BOARD_HEIGHT) / TILE) };
  };
  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    if (!engine) return;
    const c = cellAt(e);
    if (selectedUnit) {
      if (engine.placeUnit(selectedUnit, c.col, c.row)) {
        if (!engine.canDeployMore(selectedUnit)) setSelectedUnit(null);
      }
      force((n) => n + 1);
      sim.current?.paint();
      sim.current?.snapshot();
      return;
    }
    const t = engine.towerAt(c.col, c.row);
    if (t) {
      setSelectedTower(t.uid);
      return;
    }
    const lantern = engine.lanternAt(c.col, c.row);
    if (lantern != null) engine.lightLantern(lantern);
    setSelectedTower(null);
  };
  const cancel = () => {
    setSelectedUnit(null);
    setSelectedTower(null);
  };

  const engine = engineRef.current;
  const tower = engine && selectedTower != null ? engine.towers.find((t) => t.uid === selectedTower) ?? null : null;

  return (
    <Modal title={`Test play · ${level.name}`} onClose={onClose} wide="xl">
      {blocking.length > 0 ? (
        <div className="ed-tp-blocked">
          <p>
            <Icon name="error" /> This stage can't run until these problems are fixed:
          </p>
          <IssueList issues={blocking} />
        </div>
      ) : (
        <div className="ed-tp">
          <div className="ed-tp-board">
            <div className="ed-tp-hud" role="status" aria-live="off">
              <span title="Gold"><Icon name="gold" /> {hud?.gold ?? gold}</span>
              <span title="Base health"><Icon name="heart" /> {hud?.lives ?? level.baseHealth}/{hud?.maxLives ?? level.baseHealth}</span>
              <span title="Wave"><Icon name="wave" /> {hud ? `${Math.min(hud.wave, hud.total)}/${hud.total}` : '—'}</span>
              <span title="Foes left this wave"><Icon name="enemies" /> {hud?.remaining ?? 0}</span>
              <span title="Simulated time">⏱ {fmt(hud?.time ?? 0, 0)}s</span>
              <span className="grow" />
              <span className="ed-tag">Sandbox · nothing is saved</span>
            </div>
            <canvas
              ref={canvasRef}
              className={`ed-tp-canvas${selectedUnit ? ' placing' : ''}`}
              style={{ aspectRatio: `${BOARD_WIDTH} / ${BOARD_HEIGHT}` }}
              onClick={onClick}
              onContextMenu={(e) => {
                e.preventDefault();
                cancel();
              }}
              onMouseMove={(e) => {
                const c = cellAt(e);
                ui.current.hoverCol = c.col;
                ui.current.hoverRow = c.row;
                const en = engineRef.current;
                if (en) {
                  const r = e.currentTarget.getBoundingClientRect();
                  ui.current.hoverEnemyUid = en.enemyAt(((e.clientX - r.left) / r.width) * BOARD_WIDTH, ((e.clientY - r.top) / r.height) * BOARD_HEIGHT)?.uid ?? null;
                }
              }}
              onMouseLeave={() => {
                ui.current.hoverCol = -1;
                ui.current.hoverRow = -1;
              }}
              onKeyDown={(e) => e.key === 'Escape' && cancel()}
              aria-label="Test play board. Pick a champion, then click a free tile to deploy it. Right-click cancels."
            />
            {hud && hud.outcome !== 'playing' && (
              <div className={`ed-tp-outcome ${hud.outcome}`}>
                <strong>{hud.outcome === 'won' ? 'Victory' : 'Defeat'}</strong>
                <span>
                  after {fmt(hud.time, 0)}s · {hud.lives}/{hud.maxLives} lives left
                </span>
                <Button icon="restore" tone="primary" onClick={restart}>Play again</Button>
              </div>
            )}
            {error && <p className="ed-warn">{error}</p>}
          </div>

          <div className="ed-tp-side">
            <div className="ed-tp-controls">
              <Button icon="play" tone="primary" onClick={() => { engine?.startWave(); sim.current?.snapshot(); }} disabled={!engine || hud?.phase !== 'prep' || hud?.outcome !== 'playing' || (hud?.wave ?? 0) >= (hud?.total ?? 0)}>
                {hud && hud.wave === 0 ? 'Start wave 1' : `Next wave`}
              </Button>
              <Button icon={paused ? 'play' : 'pause'} onClick={() => setPaused(!paused)} aria-pressed={paused}>
                {paused ? 'Resume' : 'Pause'}
              </Button>
              <Segmented ariaLabel="Speed" size="sm" value={String(speed)} options={SPEEDS.map((s) => ({ value: String(s), label: `${s}×` }))} onChange={(v) => setSpeed(Number(v) as (typeof SPEEDS)[number])} />
              <Toggle label="Auto-start waves" checked={autoWave} onChange={setAutoWave} />
              <div className="ed-row-actions">
                <Button size="sm" icon="speed" onClick={() => sim.current?.advance(1)} disabled={hud?.outcome !== 'playing'} title="Advance the simulation one second">Step 1s</Button>
                <Button size="sm" icon="speed" onClick={() => sim.current?.advance(600, (e) => e.phase !== 'wave')} disabled={hud?.phase !== 'wave' || hud?.outcome !== 'playing'} title="Simulate instantly until this wave ends (up to 10 minutes)">Skip to wave end</Button>
              </div>
              <div className="ed-row-actions">
                <Button size="sm" icon="restore" onClick={restart}>Restart</Button>
                <Button size="sm" icon="gold" onClick={() => { if (engine) engine.currency += 500; sim.current?.snapshot(); }} title="Sandbox cheat">+500 gold</Button>
              </div>
            </div>

            <details className="ed-tp-setup">
              <summary>Setup (applies on restart)</summary>
              <label>
                Starting gold
                <NumberInput ariaLabel="Starting gold" value={gold} spec={{ kind: 'int', min: 0, max: 100000 }} onChange={(v) => setGold(v ?? 0)} width={90} />
              </label>
              <label>
                Mastery
                <Segmented ariaLabel="Mastery applied" size="sm" value={masteryMode} options={[{ value: 'none', label: 'None' }, { value: 'all', label: 'Full trees' }]} onChange={setMasteryMode} />
              </label>
              <Toggle label="Include hero champions" checked={heroes} onChange={setHeroes} help="The three adventurers, with a default portrait. Full trees picks the first member of each exclusive group." />
              <label>
                Random seed
                <NumberInput ariaLabel="Random seed" value={seed} spec={{ kind: 'int', min: 0 }} onChange={(v) => setSeed(v ?? 0)} width={90} />
              </label>
              <Button size="sm" tone="primary" icon="restore" onClick={restart}>Restart with setup</Button>
            </details>

            <h4 className="ed-subhead">Deploy</h4>
            <div className="ed-tp-deploy">
              {deployable.map((id) => {
                const def = getUnit(id);
                if (!def) return null;
                const limit = engine ? engine.deployedCount(id) : 0;
                const afford = (hud?.gold ?? gold) >= def.cost;
                const can = !!engine && engine.canDeployMore(id) && afford;
                return (
                  <button key={id} type="button" className={`ed-tp-unit${selectedUnit === id ? ' on' : ''}`} disabled={!can && selectedUnit !== id} aria-pressed={selectedUnit === id} onClick={() => { setSelectedUnit(selectedUnit === id ? null : id); setSelectedTower(null); }}>
                    <span className="ic">{def.visual.icon}</span>
                    <span className="nm">{def.name}</span>
                    <span className="ct"><Icon name="gold" size={12} /> {def.cost}</span>
                    <span className="lm">{limit}/{def.deployLimit}</span>
                  </button>
                );
              })}
            </div>
            {brokenUnits.size > 0 && <p className="ed-muted small">Not deployable until fixed: {[...brokenUnits].join(', ')}.</p>}

            {tower && engine && <TowerPanel engine={engine} tower={tower} onChange={() => force((n) => n + 1)} onSold={() => setSelectedTower(null)} />}

            {log.length > 0 && (
              <>
                <h4 className="ed-subhead">Waves cleared</h4>
                <table className="ed-table compact">
                  <thead>
                    <tr><th>Wave</th><th>Time</th><th>Lives lost</th><th>Gold after</th></tr>
                  </thead>
                  <tbody>
                    {log.map((l) => (
                      <tr key={l.wave}><td>{l.wave}</td><td>{fmt(l.seconds, 1)}s</td><td className={l.livesLost ? 'bad' : undefined}>{l.livesLost}</td><td>{l.goldAfter}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function TowerPanel({ engine, tower, onChange, onSold }: { engine: GameEngine; tower: Tower; onChange: () => void; onSold: () => void }) {
  const def: UnitDef = tower.def;
  const up = nextUpgrade(def, tower.upgradeTier);
  const purchased = engine['masteryUpgrades'][def.id] ?? [];
  const hero = def.rarity === 'hero';
  const buy = (choice?: number) => {
    engine.upgradeTower(tower.uid, choice);
    onChange();
  };
  return (
    <div className="ed-tp-tower">
      <h4>
        {def.visual.icon} {def.name} <small>tier {tower.upgradeTier}/{def.upgrades.length}</small>
      </h4>
      <dl>
        <dt>Damage</dt><dd>{fmt(tower.damage, 1)}</dd>
        <dt>Speed</dt><dd>{formatAttackSpeed(tower.attackSpeed)}/s</dd>
        <dt>Range</dt><dd>{Math.round(tower.range)}</dd>
        {tower.maxMana > 0 && (<><dt>Mana</dt><dd>{Math.floor(tower.mana)}/{tower.maxMana}</dd></>)}
      </dl>
      <label className="ed-sort">
        Targeting
        <select value={tower.targeting} onChange={(e) => { engine.setTowerTargeting(tower.uid, e.target.value as TargetingType); onChange(); }}>
          {SELECTABLE_TARGETING.map((t) => (
            <option key={t.type} value={t.type}>{t.label}</option>
          ))}
        </select>
      </label>
      {hero ? (
        <p className="ed-muted small">Heroes level up from wave-clear EXP rather than gold.</p>
      ) : up ? (
        up.choices ? (
          <div className="ed-row-actions">
            {up.choices.map((c, ci) => (
              <Button key={ci} size="sm" tone="primary" onClick={() => buy(ci)} disabled={engine.currency < masteryUpgradeCost(def, tower.upgradeTier + 1, purchased, ci)}>
                {c.name} · {masteryUpgradeCost(def, tower.upgradeTier + 1, purchased, ci)}g
              </Button>
            ))}
          </div>
        ) : (
          <Button size="sm" tone="primary" icon="up" onClick={() => buy()} disabled={engine.currency < masteryUpgradeCost(def, tower.upgradeTier + 1, purchased)}>
            {up.name} · {masteryUpgradeCost(def, tower.upgradeTier + 1, purchased)}g
          </Button>
        )
      ) : (
        <p className="ed-muted small">Fully upgraded.</p>
      )}
      {tower.ability && (
        <Button size="sm" icon="sword" onClick={() => { engine.activateAbility(tower.uid); onChange(); }} disabled={tower.abilityCooldown > 0 || tower.mana < (tower.ability.manaCost ?? 0)}>
          {tower.ability.name}{tower.abilityCooldown > 0 ? ` (${Math.ceil(tower.abilityCooldown)}s)` : ''}
        </Button>
      )}
      {engine.canSell(tower.uid) && (
        <Button size="sm" tone="danger" icon="trash" onClick={() => { engine.sellUnit(tower.col, tower.row); onSold(); }}>
          Sell · {engine.sellValue(tower.uid)}g
        </Button>
      )}
    </div>
  );
}
