import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGame } from '../../application/gameContext';
import {
  effectiveMasteryUpgradesFor,
  enemyUnlockKills,
  isArmorUnlocked,
  resolvedMasteryUpgrades,
  REPLAY_GEM_REWARD,
} from '../../application/gameState';
import { getBattleLevel, ENDLESS_BOSS_EVERY } from '../../domain/endless';
import {
  attackTypeLabel,
  damageTypeLabel,
  formatAttackSpeed,
  getUnit,
  maxUpgradeTier,
  nextUpgrade,
  BLEED_DURATION,
  POISON_DURATION,
  upgradeEffectLabel,
  nextVialLevel,
  vialCycle,
  vialLevelCost,
  vialEffectLabel,
  vialLevelLabel,
  vialUpgradesOpen,
} from '../../domain/units';
import {
  masteryStartingGoldBonus,
  masteryUpgradeCost,
  masteryUpgradeEffect,
  stageClearExp,
} from '../../domain/mastery';
import { CHAMPION_DEBUFFS } from '../../domain/championDebuffs';
import { SELECTABLE_TARGETING, targetingLabel, type TargetingType } from '../../domain/targeting';
import { BOARD_HEIGHT, BOARD_WIDTH, cellCenter } from '../../domain/grid';
import { RARITIES } from '../../domain/rarity';
import { GameEngine, SANDBOX_GOLD } from '../../engine/GameEngine';
import { drawBoard, type RenderUiState } from '../../engine/renderer';
import type { Enemy, Outcome, Tower } from '../../engine/types';
import { playCombatSound } from '../combatAudio';
import { audioBus, holdAudioAwake } from '../audioBus';
import { battleTrackFor, setMusicIntensity, setMusicTrack } from '../music';
import { GetawayCutscene } from '../components/GetawayCutscene';
import { SludgeFatherCutscene } from '../components/SludgeFatherCutscene';
import { SludgeFatherScene } from '../../engine/cutscene/sludgeFather';
import { ThroneRoomCutscene } from '../components/ThroneRoomCutscene';
import { ThroneRoomScene } from '../../engine/cutscene/throneRoom';
import { playUiSound } from '../uiAudio';
import { UnitSprite } from '../components/UnitSprite';
import { Icon, type IconName } from '../components/Icon';
import { ArmorIcon } from '../components/ArmorIcon';
import { PauseMenu } from '../components/PauseMenu';
import { BardSoundToggle } from '../components/BardSoundToggle';
import { ARMOR_RARITIES, armorPieceName, armorStatLines, type ArmorRoll } from '../../domain/armor';
import { getEnemy, type EnemyDef } from '../../domain/enemies';
import { EnemySprite } from '../components/EnemySprite';
import { FieldNotePage, FieldNoteTab } from '../components/FieldNote';
import { SandboxPanel } from '../components/SandboxPanel';

interface Props {
  levelId: number;
  /** A developer sandbox on this map: foes sent by hand, nothing banked. */
  sandbox?: boolean;
  onExit: () => void;
  onHome: () => void;
  onRetry: () => void;
}

/** One deployed champion's activated ability, mirrored for the HUD icon. */
interface AbilityHud {
  /** Uid of the tower that owns the ability (target of activation). */
  uid: number;
  name: string;
  description: string;
  /** Emoji fallback shown when the image asset is missing. */
  icon: string;
  /** Optional raster icon path (under public/). */
  image?: string;
  /** Seconds of cooldown left (0 = ready). */
  cooldown: number;
  cooldownMax: number;
  /** Off cooldown, enough mana, and (for a damaging ability) a foe in reach. */
  ready: boolean;
  /** Whether a damaging ability has a foe in reach (always true for a self-buff). */
  inRange: boolean;
  /** Mana the cast costs. */
  manaCost: number;
  /** The hero's current mana pool. */
  mana: number;
  /** Whether the hero has enough mana to cast right now. */
  affordable: boolean;
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
  /** Endless runs: gems earned so far this run. */
  gemsEarned: number;
  /** Activated abilities of deployed champions (the Blade's Cyclone Slash). */
  abilities: AbilityHud[];
  /** Armor pieces bosses have dropped this battle (already banked). */
  armorDrops: ArmorRoll[];
  /** The newest drop while its toast is showing, else null. */
  lootToast: ArmorRoll | null;
}

const NO_DROPS: ArmorRoll[] = [];
/** How long the "armor found" toast stays up (ms). */
const LOOT_TOAST_MS = 4200;
/** The beat a won stage holds on the board before its ending cutscene opens. */
const ENDING_BEAT_MS = 1100;
/** ...and for an ending that picks up mid-action (the Sewers: Draven halting at the cistern). */
const HALT_ENDING_BEAT_MS = 150;

/** The "light this lantern?" popup: which lantern, its price, and where (as % of the board). */
interface LanternPrompt {
  index: number;
  cost: number;
  xPct: number;
  yPct: number;
}

/** One effect currently weakening an inspected foe. */
interface EnemyDebuff {
  icon: IconName;
  name: string;
  detail: string;
  /** Seconds left, for timed debuffs (shown as a countdown). */
  timeLeft?: number;
  color: string;
}

/** Live info for the click-to-inspect enemy panel, copied from the engine each frame. */
interface EnemyInspect {
  uid: number;
  def: EnemyDef;
  health: number;
  maxHealth: number;
  /** Shield points left and the foe's full shield (0 when unshielded). */
  shield: number;
  maxShield: number;
  /** Damage reduction it is getting from a nearby ward aura right now (0-1). */
  ward: number;
  debuffs: EnemyDebuff[];
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
      className="ei-resist"
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

export function GameScreen({ levelId, sandbox = false, onExit, onHome, onRetry }: Props) {
  const game = useGame();
  const level = getBattleLevel(levelId)!;
  // A sandbox on an endless map plays it as a plain board, not as a run.
  const endless = sandbox ? undefined : level.endless;
  // The chapter's endless record going in, so the result can call a new best.
  const [prevBest] = useState(() => (endless ? game.state.endlessBest[endless.section] ?? 0 : 0));
  // "End run" asks for a second click before conceding an endless run.
  const [confirmEnd, setConfirmEnd] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  // UI selection state (drives the side panel + is read by the renderer).
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedTowerUid, setSelectedTowerUid] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // Whether the selected champion's "Active Buffs" list is expanded.
  const [showBuffs, setShowBuffs] = useState(false);
  // Whether the selected champion's "i" stat sheet is open (the battle keeps
  // running underneath); it closes when another champion is selected.
  const [showInfo, setShowInfo] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);
  useEffect(() => setShowInfo(false), [selectedTowerUid]);
  useEffect(() => {
    if (!showInfo) return;
    const onDown = (e: PointerEvent) => {
      if (!infoRef.current?.contains(e.target as Node)) setShowInfo(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowInfo(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showInfo]);
  const [hud, setHud] = useState<Hud | null>(null);
  // The foe clicked to inspect, and its live snapshot (refreshed each frame).
  const [selectedEnemyUid, setSelectedEnemyUid] = useState<number | null>(null);
  const [inspect, setInspect] = useState<EnemyInspect | null>(null);
  // The "light this lantern?" popup over a clicked dark lantern (board %).
  const [lanternPrompt, setLanternPrompt] = useState<LanternPrompt | null>(null);
  const lanternPromptRef = useRef<LanternPrompt | null>(null);
  lanternPromptRef.current = lanternPrompt;
  // Fast-forward: run the simulation at 3× by sub-stepping the engine. Mirrored
  // into a ref so the rAF loop reads the current speed without re-subscribing.
  const [fastForward, setFastForward] = useState(false);
  const speedRef = useRef(1);
  speedRef.current = fastForward ? 3 : 1;
  // Pause menu: while open the simulation is frozen (the board still redraws).
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  // Foes recorded in the bestiary for the first time this battle, oldest first,
  // waiting behind the field-note tab; `noteOpen` while one is being written up
  // (the battle is frozen then, like the pause menu).
  const [newFoes, setNewFoes] = useState<string[]>([]);
  const [noteOpen, setNoteOpen] = useState(false);
  const noteOpenRef = useRef(false);
  noteOpenRef.current = noteOpen;
  // Auto-start-waves preference, read by the rAF loop.
  const autoStartRef = useRef(false);
  autoStartRef.current = game.state.prefs.autoStartWaves;
  // Bard tune mute preference, read when the loop drains sound cues.
  const bardMutedRef = useRef(false);
  bardMutedRef.current = game.state.prefs.bardSoundMuted;
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
  uiRef.current.selectedEnemyUid = selectedEnemyUid;

  const settledRef = useRef(false);
  const firstClearRef = useRef(false);
  // The stage's ending cutscene (`level.ending`): playing over the screen, then done.
  const [ending, setEnding] = useState<'pending' | 'playing' | 'done' | null>(null);
  const endingRef = useRef<'pending' | 'playing' | 'done' | null>(null);
  // The cutscene overlay stays mounted past `done` while it fades off the result card.
  const [cutsceneOpen, setCutsceneOpen] = useState(false);
  // Where the board sat on screen as the ending opened (it zooms out from there).
  const endingFromRef = useRef<DOMRect | null>(null);
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
    const engine = new GameEngine(level, sandbox ? SANDBOX_GOLD : startingGold, activeUpgrades, undefined, { sandbox });
    // A sandbox banks nothing, armor drops included.
    engine.armorUnlocked = !sandbox && isArmorUnlocked(game.state);
    engineRef.current = engine;
    // App picks the battle theme when the battle screen opens, but a retry
    // remounts this screen without App noticing: claim the theme here too, so
    // a retry after an ending (which swapped in its ride music) gets it back.
    // Not on unmount, or leaving for the menus would blip the battle theme on.
    setMusicTrack(battleTrackFor(level.section));
    settledRef.current = false;

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    // Back the canvas at the size it is shown (× device pixels), so a board
    // grown on a big screen stays crisp. Quarter steps, so a small resize
    // doesn't re-bake the ground; capped, so a huge window stays smooth.
    const fitResolution = () => {
      const shown = canvas.clientWidth || BOARD_WIDTH;
      const s = Math.min(2.5, Math.max(1, Math.round(((shown * (window.devicePixelRatio || 1)) / BOARD_WIDTH) * 4) / 4));
      const w = Math.round(BOARD_WIDTH * s);
      if (canvas.width === w) return;
      canvas.width = w;
      canvas.height = Math.round(BOARD_HEIGHT * s);
      ctx.setTransform(s, 0, 0, s, 0, 0);
    };
    fitResolution();
    // Resizing clears the canvas: repaint at once rather than flash a blank
    // frame (unless the ending cutscene is drawing the board itself).
    const resizer = new ResizeObserver(() => {
      const w = canvas.width;
      fitResolution();
      if (canvas.width !== w && endingRef.current !== 'playing') drawBoard(ctx, engine, uiRef.current);
    });
    resizer.observe(canvas);

    let raf = 0;
    let last = performance.now();
    let bossBannerUntil = 0;
    // Armor drops already banked to the save (they bank the moment a boss falls).
    let dropsBanked = 0;
    let lootUntil = 0;
    // Endless gems already banked to the save (they bank the moment they're won).
    let gemsBanked = 0;
    // Bestiary kills banked before this battle (kills bank at settle), and the
    // foes already recorded, so a field note pops only on a foe's first record.
    const bankedKills = { ...game.state.enemyKills };
    const recorded = new Set<string>();
    // When a won stage's ending cutscene opens (`ENDING_BEAT_MS` after the win).
    let endingAt = 0;
    // Auto-start waves: the next wave is due the moment the previous one clears.
    const autoWaveDue = () =>
      autoStartRef.current &&
      engine.phase === 'prep' &&
      engine.outcome === 'playing' &&
      engine.waveIndex > 0 &&
      engine.waveIndex < engine.totalWaves;

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
      gemsEarned: engine.gemsEarned,
      armorDrops: engine.armorDrops.length ? [...engine.armorDrops] : NO_DROPS,
      lootToast: now < lootUntil ? engine.armorDrops[engine.armorDrops.length - 1] ?? null : null,
      abilities: engine.towers
        .filter((t) => t.ability)
        .map((t) => {
          const manaCost = t.ability!.manaCost ?? 0;
          const affordable = t.mana >= manaCost;
          const inRange = engine.abilityHasTarget(t);
          return {
            uid: t.uid,
            name: t.ability!.name,
            description: t.ability!.description,
            icon: t.ability!.icon,
            image: t.ability!.image,
            cooldown: t.abilityCooldown,
            cooldownMax: t.abilityCooldownMax,
            ready: t.abilityCooldown <= 0 && affordable && inRange && t.stun <= 0,
            inRange,
            manaCost,
            mana: Math.floor(t.mana),
            affordable,
          };
        }),
    });

    // Refresh the inspected foe's panel from the live enemy each frame (HP,
    // shield, debuff timers). Once it dies the selection clears; passing null
    // bails out of a re-render when nothing is inspected (same reference).
    const updateInspect = () => {
      const uid = uiRef.current.selectedEnemyUid;
      const e = uid != null ? engine.enemies.find((x) => x.uid === uid && !x.dead && !x.dying) : undefined;
      if (uid != null && !e) {
        uiRef.current.selectedEnemyUid = null;
        setSelectedEnemyUid(null);
      }
      setInspect(e ? inspectEnemy(e) : null);
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
      // Paused: nothing advances, but the board keeps drawing.
      const steps = pausedRef.current || noteOpenRef.current ? 0 : speedRef.current;
      for (let i = 0; i < steps; i++) {
        engine.update(dt);
        if (engine.outcome !== 'playing') break; // stop stepping once settled
      }

      // Auto-start waves: start the next wave as soon as one is cleared (not while paused).
      if (steps > 0 && autoWaveDue()) engine.startWave();

      // Drain this frame's sound cues (the audio layer throttles each type, so
      // dense bursts stay light) and clear the queue for the next frame.
      if (engine.sfx.length) {
        for (const s of engine.sfx) {
          if (s === 'bardPlay' && bardMutedRef.current) continue;
          playCombatSound(s);
        }
        engine.sfx.length = 0;
      }

      // The ending cutscene draws the board itself while it plays. After the
      // win the board runs on a beat first (the last kill lands, the corpse
      // falls) before it opens, zooming out from right where the board sits.
      if (endingRef.current === 'pending' && now >= endingAt) {
        endingFromRef.current = canvas.getBoundingClientRect();
        endingRef.current = 'playing';
        setEnding('playing');
        setCutsceneOpen(true);
      }
      if (endingRef.current === 'playing') {
        raf = requestAnimationFrame(frame);
        return;
      }
      drawBoard(ctx, engine, uiRef.current);
      setHud(snapshot(now));
      updateInspect();

      // Endless boss-wave gems bank as soon as they're earned, so they're kept
      // however the run ends.
      if (engine.gemsEarned > gemsBanked) {
        game.grantGems(engine.gemsEarned - gemsBanked);
        gemsBanked = engine.gemsEarned;
      }
      // Likewise armor a boss dropped: into the armory at once, with a toast.
      if (engine.armorDrops.length > dropsBanked) {
        game.awardArmor(engine.armorDrops.slice(dropsBanked));
        dropsBanked = engine.armorDrops.length;
        lootUntil = now + LOOT_TOAST_MS;
      }
      // A foe slain enough times this battle to enter the bestiary for the
      // first time queues a field note at the board's side.
      // (Not in a sandbox, which records nothing.)
      let fresh: string[] | null = null;
      for (const id in engine.enemyKills) {
        if (sandbox || recorded.has(id)) continue;
        const need = enemyUnlockKills(getEnemy(id));
        const before = bankedKills[id] ?? 0;
        if (before >= need) recorded.add(id);
        else if (before + engine.enemyKills[id] >= need) {
          recorded.add(id);
          (fresh ??= []).push(id);
        }
      }
      if (fresh) {
        const add = fresh;
        setNewFoes((q) => [...q, ...add]);
      }

      // Settle rewards/progression exactly once when the battle ends.
      // A sandbox never ends on its own, and banks nothing if it somehow did.
      if (engine.outcome !== 'playing' && !settledRef.current && !sandbox) {
        settledRef.current = true;
        // Champion mastery EXP is earned from kills regardless of the outcome,
        // so it banks on both victory and defeat. Winning a stage also grants
        // every team champion a clear bonus per wave the stage had.
        const exp = { ...engine.masteryEarned };
        if (!endless && engine.outcome === 'won') {
          const bonus = stageClearExp(engine.totalWaves);
          for (const id of game.state.team) exp[id] = (exp[id] ?? 0) + bonus;
        }
        game.awardMastery(exp);
        // Enemy kills bank win or lose too — they feed the Enemy Index unlocks.
        game.awardEnemyKills(engine.enemyKills);
        // Gold is a per-stage resource and does not persist; only the gem
        // reward is banked, on the first clear.
        // An endless run only ever ends in defeat (or a conceded run); it
        // records how many waves it cleared.
        if (endless) {
          game.recordEndlessRun(endless.section, engine.waveIndex);
        } else if (engine.outcome === 'won') {
          firstClearRef.current = !game.state.completedLevels.includes(level.id);
          game.completeLevel(level.id, level.gemReward);
          // A stage with an ending plays it before the result card, after a beat
          // (barely one when the ending picks up mid-action, as Draven halts).
          if (level.ending) {
            endingRef.current = 'pending';
            endingAt = now + (level.ending === 'sludgeFather' ? HALT_ENDING_BEAT_MS : ENDING_BEAT_MS);
            setEnding('pending');
          }
        }
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // Keep the audio output live for the whole battle so the first hit after a
    // quiet build phase isn't swallowed while the device wakes up.
    const releaseAudio = holdAudioAwake();

    return () => {
      cancelAnimationFrame(raf);
      resizer.disconnect();
      releaseAudio();
    };
    // Engine is created once per level mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelId]);

  // The ending has run: hand back to the result card, leaving the board as the
  // party left it — champions and wagon gone down the road.
  const finishEnding = () => {
    if (level.ending === 'sludgeFather' && engineRef.current) {
      // The party gone through the tunnel, Draven crushed, and the Sludge
      // Father left breathing in the cistern behind them.
      const aftermath = new SludgeFatherScene(engineRef.current);
      aftermath.settle();
      uiRef.current.scene = aftermath.boardScene;
    } else if (level.ending === 'throneRoom' && engineRef.current) {
      // The hall emptied, and the rebel flag standing in the throne.
      const aftermath = new ThroneRoomScene(engineRef.current);
      aftermath.settle();
      uiRef.current.scene = aftermath.boardScene;
    } else {
      const wagon = (level.decor ?? []).findIndex((p) => p.kind === 'escapeWagon');
      uiRef.current.scene = { hideTowers: true, hiddenDecor: new Set(wagon >= 0 ? [wagon] : []) };
    }
    endingRef.current = 'done';
    setEnding('done');
  };

  // ---- Pointer handling ---------------------------------------------------
  const pointerToBoard = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * BOARD_WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * BOARD_HEIGHT,
    };
  };

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = pointerToBoard(e);
    const engine = engineRef.current!;
    const cell = engine.cellFromPoint(x, y);
    uiRef.current.hoverCol = cell.col;
    uiRef.current.hoverRow = cell.row;
    // A foe under the cursor is outlined (it can be clicked to inspect), unless
    // a champion is being placed, where the click goes to placement.
    const enemy = uiRef.current.selectedUnitId ? undefined : engine.enemyAt(x, y);
    uiRef.current.hoverEnemyUid = enemy ? enemy.uid : null;
    // A dark lantern under the cursor can be clicked to light it.
    const lantern = engine.lanternAt(cell.col, cell.row);
    e.currentTarget.style.cursor = enemy || (lantern != null && !engine.isLanternLit(lantern)) ? 'pointer' : '';
  };

  const handleLeave = () => {
    uiRef.current.hoverCol = -1;
    uiRef.current.hoverRow = -1;
    uiRef.current.hoverEnemyUid = null;
  };

  const handleClick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current!;
    if (engine.outcome !== 'playing') return;
    const { x, y } = pointerToBoard(e);
    const { col, row } = engine.cellFromPoint(x, y);
    // Any click on the board dismisses an open lantern popup.
    setLanternPrompt(null);

    // Clicking a foe inspects it (foes move, so they win over the champion
    // they pass); clicking anything else lets go of the inspected foe. While
    // placing a champion the click is for placement.
    const foe = selectedUnitId ? undefined : engine.enemyAt(x, y);
    if (foe && !foe.dying) {
      setSelectedEnemyUid(foe.uid);
      setSelectedTowerUid(null);
      return;
    }
    setSelectedEnemyUid(null);

    // Clicking an existing tower selects it.
    const existing = engine.towerAt(col, row);
    if (existing) {
      setSelectedTowerUid(existing.uid);
      setSelectedUnitId(null);
      return;
    }

    // Clicking a dark lantern asks whether to buy its light.
    const lantern = engine.lanternAt(col, row);
    const prop = lantern != null ? engine.level.decor?.[lantern] : undefined;
    if (lantern != null && prop && !engine.isLanternLit(lantern)) {
      // Anchored just above the lantern's head.
      const at = cellCenter(prop.col, prop.row);
      setLanternPrompt({
        index: lantern,
        cost: engine.lanternCost(lantern) ?? 0,
        xPct: (at.x / BOARD_WIDTH) * 100,
        yPct: ((at.y - 50) / BOARD_HEIGHT) * 100,
      });
      return;
    }

    // Placing a selected unit.
    if (selectedUnitId) {
      const def = getUnit(selectedUnitId)!;
      if (!engine.canDeployMore(selectedUnitId)) {
        playUiSound('deny');
        showFlash(`Deploy limit reached (${def.deployLimit} ${def.name}s).`);
        return;
      }
      if (!engine.canPlaceAt(col, row)) {
        playUiSound('deny');
        showFlash('Cannot build there.');
        return;
      }
      if (engine.currency < def.cost) {
        playUiSound('deny');
        showFlash('Not enough gold to deploy.');
        return;
      }
      if (engine.placeUnit(selectedUnitId, col, row)) {
        playUiSound('place');
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
    setSelectedEnemyUid(null);
  };

  // Right-click on the board cancels the current placement.
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    clearSelection();
  };

  // The chapter battle theme thins out in the build phase and swells while a
  // wave is on the board; after the battle it settles back down.
  // Pausing settles it down too.
  const musicPhase = !hud || hud.outcome !== 'playing' || paused || noteOpen ? 'over' : hud.phase;
  useEffect(() => {
    setMusicIntensity(musicPhase === 'prep' ? 0.3 : musicPhase === 'over' ? 0.15 : 1);
  }, [musicPhase]);

  // Escape cancels the current selection; with nothing selected it opens or
  // closes the pause menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (lanternPromptRef.current) {
        setLanternPrompt(null);
        return;
      }
      const ui = uiRef.current;
      if (!pausedRef.current && (ui.selectedUnitId || ui.selectedTowerUid != null || ui.selectedEnemyUid != null)) {
        clearSelection();
        return;
      }
      if (engineRef.current?.outcome !== 'playing') return;
      setPaused((p) => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- Actions ------------------------------------------------------------
  const startWave = () => {
    // A click is the surest moment to (re)start a suspended audio context.
    audioBus('combat');
    engineRef.current?.startWave();
  };

  // Sandbox: send foes by hand, and level heroes that have no waves to level them.
  const sandboxSpawn = (enemyId: string, lane: number | 'all', count: number) => {
    audioBus('combat');
    engineRef.current?.sandboxSpawn(enemyId, lane, count);
  };
  const sandboxLevelHeroes = () => {
    if (engineRef.current?.sandboxLevelHeroes()) refreshDeploys();
    else showFlash('No deployed hero has a level left to gain.');
  };

  // Concede an endless run (second click confirms); it settles like a defeat.
  const endRun = () => {
    if (!confirmEnd) {
      setConfirmEnd(true);
      return;
    }
    setConfirmEnd(false);
    engineRef.current?.surrender();
  };

  const activateAbility = (uid: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    const tower = engine.towers.find((t) => t.uid === uid);
    if (engine.activateAbility(uid)) {
      // Snap the camera's attention to the caster and refresh the panel.
      if (tower) {
        setSelectedTowerUid(uid);
        setSelectedEnemyUid(null);
      }
      refreshDeploys();
    } else if (tower && tower.stun > 0) {
      showFlash(`${tower.def.name} is stuck in sludge!`);
    } else if (tower && tower.abilityCooldown > 0) {
      showFlash(`${tower.ability?.name} is recharging…`);
    } else if (tower && tower.mana < (tower.ability?.manaCost ?? 0)) {
      showFlash(`Not enough mana for ${tower.ability?.name}.`);
    } else if (tower && !engine.abilityHasTarget(tower)) {
      showFlash(`No enemies in range for ${tower.ability?.name}.`);
    }
  };

  /** The lantern popup's "Light" button: buy the light, or say why not. */
  const lightPromptedLantern = (prompt: LanternPrompt) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.currency < prompt.cost) {
      playUiSound('deny');
      showFlash(`Not enough gold to light the lantern (${prompt.cost}).`);
      return;
    }
    if (engine.lightLantern(prompt.index)) refreshDeploys();
    setLanternPrompt(null);
  };

  const setTargeting = (type: TargetingType) => {
    if (selectedTowerUid == null) return;
    engineRef.current?.setTowerTargeting(selectedTowerUid, type);
    refreshDeploys();
  };

  /** Buy the selected champion's next tier; `choice` picks an option at a fork. */
  const upgradeSelected = (choice?: number) => {
    if (selectedTowerUid == null) return;
    const ok = engineRef.current?.upgradeTower(selectedTowerUid, choice);
    if (!ok) {
      showFlash('Not enough gold to upgrade.');
      return;
    }
    refreshDeploys();
  };

  /** Buy the next level of one of the selected champion's vials. */
  const upgradeVialSelected = (vial: number) => {
    if (selectedTowerUid == null) return;
    if (!engineRef.current?.upgradeVial(selectedTowerUid, vial)) {
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

  // The oldest foe waiting for its field note, written up while the battle waits.
  const noteFoe = newFoes.length ? getEnemy(newFoes[0]) : null;
  const closeNote = () => {
    setNoteOpen(false);
    setNewFoes((q) => q.slice(1));
  };

  // Leaving from the pause menu: retreat from a stage, or concede an endless run.
  const leaveFromPause = () => {
    setPaused(false);
    if (endless) engineRef.current?.surrender();
    else onExit();
  };

  return (
    <main className="game-wrap" data-board-size={game.state.prefs.boardSize}>
      {paused && hud?.outcome === 'playing' && (
        <PauseMenu endless={!!endless} onResume={() => setPaused(false)} onLeave={leaveFromPause} />
      )}
      {noteOpen && noteFoe && (
        <FieldNotePage
          key={noteFoe.id}
          def={noteFoe}
          kills={(game.state.enemyKills[noteFoe.id] ?? 0) + (engineRef.current?.enemyKills[noteFoe.id] ?? 0)}
          onClose={closeNote}
        />
      )}
      <div className="game-hud">
        {endless && hud?.outcome === 'playing' ? (
          <button
            className={`btn ghost sort-toggle end-run${confirmEnd ? ' confirm-end' : ''}`}
            onClick={endRun}
            onBlur={() => setConfirmEnd(false)}
          >
            <Icon name="flag" /> {confirmEnd ? 'Confirm?' : 'End run'}
          </button>
        ) : (
          <button className="btn ghost sort-toggle" onClick={onExit}>
            <Icon name="back" /> Retreat
          </button>
        )}
        <div className="hud-stat">
          <span className="lbl">Realm</span> {level.name}
        </div>
        {sandbox ? (
          <div className="hud-stat hud-sandbox">
            <Icon name="hammer" /> Sandbox
          </div>
        ) : endless ? (
          <div className="hud-stat">
            <span className="lbl">Wave</span>
            <HudNum value={(hud?.waveIndex ?? 0) + 1} digits={3} />
            <small className="hud-boss-in">{bossCountdown((hud?.waveIndex ?? 0) + 1)}</small>
          </div>
        ) : (
          <div className="hud-stat">
            <span className="lbl">Wave</span>
            <HudNum value={Math.min((hud?.waveIndex ?? 0) + 1, hud?.totalWaves ?? 0)} digits={2} align="right" /> /{' '}
            <HudNum value={hud?.totalWaves ?? 0} digits={2} />
          </div>
        )}
        <div className="hud-stat">
          <span className="lbl">Foes</span> <HudNum value={hud?.enemiesRemaining ?? 0} digits={3} />
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
          <HudNum value={hud?.baseHealth ?? 0} digits={3} />
        </div>
        <div className="hud-stat hud-gold">
          <Icon name="coin" /> <HudNum value={hud?.currency ?? 0} digits={5} />
        </div>
        <button
          type="button"
          className="hud-stat hud-pause"
          onClick={() => setPaused(true)}
          disabled={hud?.outcome !== 'playing'}
          title="Pause (Esc)"
          aria-label="Pause"
        >
          <Icon name="pause" />
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
            {lanternPrompt && hud?.outcome === 'playing' && (
              <div
                className={`lantern-prompt ${lanternPrompt.yPct < 24 ? 'below' : ''}`}
                style={{ left: `${lanternPrompt.xPct}%`, top: `${lanternPrompt.yPct}%` }}
                role="dialog"
                aria-label="Light this lantern?"
              >
                <div className="lp-title">
                  <Icon name="lantern" /> Light this lantern?
                </div>
                <div className="lp-actions">
                  <button
                    className={`btn primary ${hud.currency < lanternPrompt.cost ? 'unaffordable' : ''}`}
                    onClick={() => lightPromptedLantern(lanternPrompt)}
                  >
                    Light <Icon name="coin" />
                    {lanternPrompt.cost}
                  </button>
                  <button className="btn ghost" onClick={() => setLanternPrompt(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <div className="board-overlay">
              {hud?.showBossBanner && hud.outcome === 'playing' && (
                <div className="boss-banner">
                  <Icon name="skull" /> A Boss Approaches <Icon name="skull" />
                </div>
              )}
              {hud?.lootToast && hud.outcome === 'playing' && <LootToast key={hud.armorDrops.length} roll={hud.lootToast} />}
              {noteFoe && !noteOpen && hud?.outcome === 'playing' && (
                <FieldNoteTab
                  key={noteFoe.id}
                  def={noteFoe}
                  count={newFoes.length}
                  onOpen={() => {
                    clearSelection();
                    setNoteOpen(true);
                  }}
                />
              )}
              {hud && hud.outcome !== 'playing' && endless && (
                <EndlessResultCard
                  wavesCleared={hud.waveIndex}
                  gemsEarned={hud.gemsEarned}
                  newBest={hud.waveIndex > prevBest}
                  best={Math.max(prevBest, hud.waveIndex)}
                  armorDrops={hud.armorDrops}
                  onExit={onExit}
                  onHome={onHome}
                  onRetry={onRetry}
                />
              )}
              {cutsceneOpen && engineRef.current && level.ending === 'sludgeFather' && (
                <SludgeFatherCutscene
                  engine={engineRef.current}
                  from={endingFromRef.current}
                  onDone={finishEnding}
                  onClosed={() => setCutsceneOpen(false)}
                />
              )}
              {cutsceneOpen && engineRef.current && level.ending === 'throneRoom' && (
                <ThroneRoomCutscene
                  engine={engineRef.current}
                  section={level.section}
                  from={endingFromRef.current}
                  onDone={finishEnding}
                  onClosed={() => setCutsceneOpen(false)}
                />
              )}
              {cutsceneOpen && engineRef.current && level.ending === 'getaway' && (
                <GetawayCutscene
                  engine={engineRef.current}
                  section={level.section}
                  from={endingFromRef.current}
                  onDone={finishEnding}
                  onClosed={() => setCutsceneOpen(false)}
                />
              )}
              {hud && hud.outcome !== 'playing' && !endless && (ending == null || ending === 'done') && (
                <ResultCard
                  outcome={hud.outcome}
                  gemReward={level.gemReward}
                  victoryLine={level.victoryLine}
                  firstClear={firstClearRef.current}
                  armorDrops={hud.armorDrops}
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
                  const bard = engine?.deployBard(id) ?? def.bard;
                  return (
                    <button
                      key={id}
                      className={`deploy-item ${selectedUnitId === id ? 'active' : ''}`}
                      disabled={atLimit}
                      onClick={() => {
                        setSelectedUnitId((cur) => (cur === id ? null : id));
                        setSelectedTowerUid(null);
                        setSelectedEnemyUid(null);
                      }}
                    >
                      <span className="ic"><UnitSprite unit={def} size={34} /></span>
                      <span className="nm">
                        <b>{def.name}</b>
                        <span className={atLimit ? 'limit-hit' : ''}>
                          {deployed}/{def.deployLimit} deployed
                        </span>
                      </span>
                      <span className={`cost ${affordable ? '' : 'unaffordable'}`}>{def.cost > 0 ? (
                        <>
                          <Icon name="coin" />
                          {def.cost}
                        </>
                      ) : (
                        'Free'
                      )}</span>
                      <span className="deploy-stats-tip" role="tooltip">
                        {def.generator ? (
                          <>
                            <span className="dst-row"><span>Harvest</span><b><Icon name="coin" />{def.generator.amount}</b></span>
                            <span className="dst-row"><span>Harvests</span><b>{def.generator.timesPerWave}/wave</b></span>
                          </>
                        ) : bard ? (
                          <>
                            <span className="dst-row"><span>Buff</span><b>+{Math.round((bard.attackSpeedMult - 1) * 100)}% SPD</b></span>
                            <span className="dst-row"><span>Targets</span><b>{bard.targets} · {bard.duration}s</b></span>
                            <span className="dst-row"><span>Range</span><b>{rng}</b></span>
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
          {/* Wave control: a fixed-height slot (so swapping the wave button
              for the in-progress note never shifts the panels below) beside
              the game-speed toggle. */}
          <div className="wave-row">
            <div className="wave-slot">
              {canStartWave && (
                <button className="btn primary block" onClick={startWave}>
                  <Icon name="swords" />
                  {hud && hud.waveIndex === 0 ? 'Start Battle' : 'Next Wave'}
                </button>
              )}
              {hud?.phase === 'wave' && (
                <div className="panel wave-progress">
                  <Icon name={sandbox ? 'hammer' : 'swords'} /> {sandbox ? 'Sandbox: no waves' : 'Wave in progress…'}
                </div>
              )}
            </div>
            <button
              className={`btn ff-toggle ${fastForward ? 'active' : ''}`}
              onClick={() => setFastForward((v) => !v)}
              title="Fast forward (3× game speed)"
              aria-pressed={fastForward}
            >
              <Icon name="fast" /> {fastForward ? '3×' : '1×'}
            </button>
          </div>

          {sandbox && (
            <SandboxPanel
              laneCount={level.lanes.length}
              onSpawn={sandboxSpawn}
              onClear={() => engineRef.current?.sandboxClear()}
              onRefillGold={() => engineRef.current?.sandboxRefillGold()}
              onLevelHeroes={sandboxLevelHeroes}
            />
          )}

          {!selectedTower && inspect && inspect.uid === selectedEnemyUid && hud?.outcome === 'playing' && (
            <EnemyPanel foe={inspect} onClose={() => setSelectedEnemyUid(null)} />
          )}

          {!selectedTower && selectedEnemyUid == null && (
            <div className="panel panel-pad" style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
              Select a deployed champion to inspect and upgrade it, or click a foe to size it up.
            </div>
          )}

          {!selectedTower && level.mist && (
            <div className="panel panel-pad mist-note">
              <b><Icon name="lantern" /> Mist</b>
              <span>
                Champions in the mist can see less far.
              </span>
            </div>
          )}

          {selectedTower && (
            <div className="panel panel-pad selected-tower-box">
              {selectedTower.bardEvery > 0 && <BardSoundToggle compact className="t-bard-sound" />}
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
                  <div className="s">Harvest <b><Icon name="coin" />{selectedTower.genAmount}</b></div>
                  <div className="s">Per wave <b>{selectedTower.def.generator.timesPerWave}×</b></div>
                  <div className="s">Left <b>{selectedTower.genLeft} this wave</b></div>
                  <div className="s">Total <b><Icon name="coin" />{selectedTower.genAmount * selectedTower.def.generator.timesPerWave}/wave</b></div>
                </div>
              ) : selectedTower.bardEvery > 0 ? (
                <div className="stat-row" style={{ marginTop: 4 }}>
                  <div className="s">Buff <b>+{Math.round((selectedTower.bardSpeedMult - 1) * 100)}% SPD</b></div>
                  <div className="s">Targets <b>{selectedTower.bardTargets}</b></div>
                  <div className="s">Lasts <b>{selectedTower.bardDuration}s</b></div>
                  <div className="s">Every <b>{selectedTower.bardEvery}s</b></div>
                  <div className={`s${selectedTower.mistMult < 1 ? ' debuff-range' : ''}`}>Range <b>{selectedTower.range}</b></div>
                </div>
              ) : (() => {
                // Reflect the live buffs on the exact stat each one lifts: a
                // Bard's tune → SPD/DPS, Better Morale → DMG, Guiding Gale → Range.
                const spd =
                  selectedTower.attackSpeed *
                  (selectedTower.attackSpeedBuffMult ?? 1) *
                  (selectedTower.abilitySpeedBuffMult ?? 1) *
                  (selectedTower.resistHasteMult ?? 1);
                const spdBuffed =
                  (selectedTower.attackSpeedBuffMult ?? 1) > 1 ||
                  (selectedTower.abilitySpeedBuffMult ?? 1) > 1 ||
                  (selectedTower.resistHasteMult ?? 1) > 1;
                const dmgBuffed = selectedTower.adjacentDamageMult > 0 && selectedTower.adjacentAllies > 0;
                const rangeBuffed = selectedTower.rangeBuffed;
                // DPS rises whenever damage or attack speed is lifted.
                const dpsBuffed = dmgBuffed || spdBuffed;
                // No in-stage crit buff exists yet; the class is wired so any future
                // crit-boosting effect turns Crit / Crit Dmg yellow automatically.
                const critBuffed = false;
                // Buffed stats are recoloured by category (no trailing icons): attack
                // speed → blue, damage → red, range → green, crit → yellow, DPS → its
                // own violet.
                // The card keeps the four headline stats; everything else is in
                // the "i" sheet at its top-left.
                return (
                  <>
                    <div className="stat-row" style={{ marginTop: 4 }}>
                      <div className={`s${dmgBuffed ? ' buff-dmg' : ''}`}>DMG <b>{selectedTower.damage}</b></div>
                      <div className={`s${spdBuffed ? ' buff-spd' : ''}`}>SPD <b>{formatAttackSpeed(spd)}/s</b></div>
                      <div className={`s${rangeBuffed ? ' buff-range' : selectedTower.mistMult < 1 ? ' debuff-range' : ''}`}>Range <b>{selectedTower.range}</b></div>
                      <div className={`s${dpsBuffed ? ' buff-dps' : ''}`}>DPS <b>{(selectedTower.damage * spd).toFixed(0)}{selectedTower.burstCount > 1 ? ` x${selectedTower.burstCount}` : ''}</b></div>
                    </div>
                    <div className="t-info" ref={infoRef}>
                      <button
                        className={`t-info-btn${showInfo ? ' open' : ''}`}
                        onClick={() => setShowInfo((v) => !v)}
                        aria-expanded={showInfo}
                        aria-label="Other stats"
                        title="Other stats"
                      >
                        <Icon name="info" />
                      </button>
                      {showInfo && (
                        <div className="t-info-pop" role="dialog" aria-label={`${selectedTower.def.name} stats`}>
                          <div className="t-info-head">
                            <span>{selectedTower.def.name} · stats</span>
                            <button className="t-info-close" onClick={() => setShowInfo(false)} aria-label="Close">
                              <Icon name="close" />
                            </button>
                          </div>
                          <div className="stat-row t-info-stats">
                            <div className={`s${critBuffed ? ' buff-crit' : ''}`}>Crit <b>{+(selectedTower.critChance * 100).toFixed(2)}%</b></div>
                            <div className={`s${critBuffed ? ' buff-crit' : ''}`}>Crit Dmg <b>{selectedTower.critMultiplier}×</b></div>
                            {selectedTower.bleed && (
                              <div className="s">Bleed <b>{Math.round(selectedTower.bleed.damageMult * 100)}% / {BLEED_DURATION}s</b></div>
                            )}
                            {selectedTower.poison && (
                              <div className="s">Poison <b>{+(selectedTower.poison.maxHealthFraction * 100).toFixed(2)}% max HP / {POISON_DURATION}s</b></div>
                            )}
                            {selectedTower.critChanceVsBleeding > 0 && (
                              <div className="s">Crit vs bleeding <b>+{+(selectedTower.critChanceVsBleeding * 100).toFixed(2)}%</b></div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}

              {selectedTower.maxMana > 0 && (
                <div className="mana-box">
                  <div className="mana-head">
                    <span>
                      <Icon name="mana" /> Mana
                    </span>
                    <span className="mana-val">
                      {Math.floor(selectedTower.mana)} / {selectedTower.maxMana}
                    </span>
                  </div>
                  <div className="mana-bar">
                    <span
                      style={{ width: `${(selectedTower.mana / selectedTower.maxMana) * 100}%` }}
                    />
                  </div>
                  <div className="mana-hint">Refilled by kills · spent on abilities</div>
                </div>
              )}

              {(() => {
                const buffs = activeBuffsFor(selectedTower);
                return (
                  <div className="buffs-box">
                    <button
                      className="buffs-toggle"
                      onClick={() => setShowBuffs((v) => !v)}
                      aria-expanded={showBuffs}
                    >
                      <span>
                        <Icon name="sparkle" /> Active Buffs
                        <span className={`buffs-count ${buffs.length ? 'has' : ''}`}>
                          {buffs.length}
                        </span>
                      </span>
                      <span className="buffs-chev">{showBuffs ? '▲' : '▼'}</span>
                    </button>
                    {showBuffs && (
                      <div className="buffs-list">
                        {buffs.length === 0 ? (
                          <div className="buffs-empty">No active buffs right now.</div>
                        ) : (
                          buffs.map((b, i) => (
                            <div key={i} className="buff-row">
                              <span className="buff-ic" style={b.color ? { color: b.color } : undefined}><Icon name={b.icon} /></span>
                              <span className="buff-info">
                                <b style={b.color ? { color: b.color } : undefined}>{b.name}</b>
                                <span>{b.detail}</span>
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {(() => {
                const isHero = selectedTower.def.rarity === 'hero';
                const up = nextUpgrade(selectedTower.def, selectedTower.upgradeTier);
                if (!up) {
                  // A vial thrower's upgrades go on in its vials (below).
                  if (selectedTower.def.vials?.length) return null;
                  return (
                    <div className="upgrade-box maxed"><Icon name="star" /> Fully upgraded (Lv {maxUpgradeTier(selectedTower.def)})</div>
                  );
                }
                const purchased = effectiveMasteryUpgradesFor(game.state, selectedTower.def.id);
                const nextTier = selectedTower.upgradeTier + 1;
                // A fork: one buy button per option; buying one locks the others out.
                if (up.choices && !isHero) {
                  return (
                    <div className="upgrade-fork">
                      <div className="upgrade-fork-head">Choose one · Lv {nextTier}</div>
                      <div className="upgrade-fork-opts">
                        {up.choices.map((c, ci) => {
                          const cost = masteryUpgradeCost(selectedTower.def, nextTier, purchased, ci);
                          return (
                            <button
                              key={ci}
                              className="upgrade-box"
                              disabled={(hud?.currency ?? 0) < cost}
                              onClick={() => upgradeSelected(ci)}
                            >
                              <div className="up-head">
                                <span>{c.name}</span>
                                <span className="up-cost"><Icon name="coin" />{cost}</span>
                              </div>
                              <div className="up-eff">
                                {upgradeEffectLabel(masteryUpgradeEffect(selectedTower.def, nextTier, purchased, ci))}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                const effLabel = upgradeEffectLabel(masteryUpgradeEffect(selectedTower.def, nextTier, purchased));
                // Hero champions never buy upgrades with gold — they pool wave-clear
                // EXP and level up automatically once it reaches the next tier's cost.
                if (isHero) {
                  const need = up.cost;
                  const have = Math.floor(selectedTower.heroExp);
                  const pct = need > 0 ? Math.min(100, (have / need) * 100) : 0;
                  return (
                    <div className="upgrade-box hero-xp">
                      <div className="up-head">
                        <span>⬆ {up.name}</span>
                        <span className="up-xp"><Icon name="star" /> {have}/{need}</span>
                      </div>
                      <div className="hero-xp-bar">
                        <span style={{ width: `${pct}%` }} />
                      </div>
                      <div className="up-eff">{effLabel}</div>
                      <div className="hero-xp-hint">Auto-levels as it earns EXP each wave.</div>
                    </div>
                  );
                }
                const upCost = masteryUpgradeCost(selectedTower.def, nextTier, purchased);
                const affordable = (hud?.currency ?? 0) >= upCost;
                return (
                  <button
                    className="upgrade-box"
                    disabled={!affordable}
                    onClick={() => upgradeSelected()}
                  >
                    <div className="up-head">
                      <span>⬆ {up.name}</span>
                      <span className="up-cost"><Icon name="coin" />{upCost}</span>
                    </div>
                    <div className="up-eff">{effLabel}</div>
                  </button>
                );
              })()}

              {vialUpgradesOpen(selectedTower.def, selectedTower.upgradeTier) ? (
                <VialUpgrades tower={selectedTower} gold={hud?.currency ?? 0} onBuy={upgradeVialSelected} />
              ) : null}

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
                  Sell · +<Icon name="coin" />{engineRef.current?.sellValue(selectedTower.uid) ?? 0}
                </button>
              ) : (
                <p className="hint" style={{ marginTop: 12, textAlign: 'center' }}>
                  <Icon name="lock" /> Your hero cannot be sold.
                </p>
              )}
            </div>
          )}

          {hud && hud.outcome === 'playing' && hud.abilities.length > 0 && (
            <div className="panel panel-pad ability-panel">
              <div className="ability-panel-head">
                <Icon name="sparkle" /> Abilities
              </div>
              <div className="ability-list">
                {hud.abilities.map((ab) => (
                  <AbilityButton
                    key={ab.uid}
                    ability={ab}
                    onActivate={() => activateAbility(ab.uid)}
                  />
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {flash && <div className="flash-msg">{flash}</div>}
    </main>
  );
}

/**
 * An activated-ability card in the battle side panel (the Blade's Cyclone Slash),
 * shown beneath the champion inspector. A square icon shows the ability's art
 * (falling back to its emoji if the raster asset is missing); while recharging it
 * dims, sweeps a radial countdown over the icon and prints the seconds left.
 * Clicking when ready fires the ability.
 */
function AbilityButton({
  ability,
  onActivate,
}: {
  ability: AbilityHud;
  onActivate: () => void;
}) {
  // Whether the raster asset loaded; falls back to the emoji glyph if it 404s.
  const [imgOk, setImgOk] = useState(true);
  const cooling = ability.cooldown > 0;
  const frac = ability.cooldownMax > 0 ? ability.cooldown / ability.cooldownMax : 0;
  // Remaining sweep, drawn as a dark wedge shrinking clockwise as it recharges.
  const deg = Math.max(0, Math.min(1, frac)) * 360;
  // Off cooldown but too little mana: a distinct "starved" state.
  const starved = !cooling && !ability.affordable;
  // Charged and paid for, but nobody in reach to hit: held back, not wasted —
  // shown only by the missing gold (same text as ready).
  const idle = !cooling && !starved && !ability.inRange;
  const stateClass = ability.ready ? 'ready' : starved ? 'starved' : idle ? 'idle' : 'cooling';
  const status = cooling
    ? `Recharging · ${Math.ceil(ability.cooldown)}s`
    : starved
      ? `Needs ${ability.manaCost} mana (${ability.mana})`
      : 'Ready — tap to unleash';
  return (
    <button
      className={`ability-btn ${stateClass}`}
      onClick={onActivate}
      disabled={!ability.ready}
      title={`${ability.name} — ${ability.manaCost} mana\n${ability.description}`}
      aria-label={ability.name}
    >
      <span className={`ability-icon${ability.image && imgOk ? '' : ' no-art'}`}>
        {ability.image && imgOk ? (
          <img src={ability.image} alt="" onError={() => setImgOk(false)} />
        ) : (
          <span className="ability-emoji">{ability.icon}</span>
        )}
        {cooling && (
          <>
            <span
              className="ability-cooldown-sweep"
              style={{
                background: `conic-gradient(rgba(6,8,18,0.72) ${deg}deg, transparent ${deg}deg)`,
              }}
            />
            <span className="ability-cooldown-num">{Math.ceil(ability.cooldown)}</span>
          </>
        )}
        {ability.manaCost > 0 && (
          <span className={`ability-mana-cost ${ability.affordable ? '' : 'short'}`}>
            <Icon name="mana" />
            {ability.manaCost}
          </span>
        )}
      </span>
      <span className="ability-text">
        <b className="ability-name">{ability.name}</b>
        <span className={`ability-status ${ability.ready ? 'is-ready' : ''}`}>{status}</span>
      </span>
    </button>
  );
}

/** A temporary/aura effect currently modifying a deployed champion. */
interface ActiveBuff {
  icon: IconName;
  name: string;
  detail: string;
  /** Accent colour for the buff's icon + name (defaults to the theme text). */
  color?: string;
}

/**
 * A vial thrower's vial upgrades in the champion panel (the Plague Doctor),
 * shown once every regular tier is bought. One card per vial: its name on top
 * (a small play mark in the corner flags the one thrown next); under it the value before → after (or its
 * current effect once maxed), with the buy button over its level pips beside it.
 * The vials level independently of each other.
 */
function VialUpgrades({ tower, gold, onBuy }: { tower: Tower; gold: number; onBuy: (vial: number) => void }) {
  const vials = tower.def.vials ?? [];
  const m = tower.vialMastery;
  const cycle = vialCycle(tower.def, tower.vialLevels, m);
  const formula = cycle.find((c) => c.formula);
  return (
    <div className="vial-box">
      <div className="upgrade-fork-head">Vial upgrades · any order</div>
      <div className="vial-list">
        {vials.map((v, i) => {
          const level = tower.vialLevels[i] ?? 0;
          const next = nextVialLevel(v, level);
          const cost = next ? vialLevelCost(next, m.discount) : 0;
          // A vial with a level left to buy is one big button, like a regular
          // upgrade; a maxed one is a plain card.
          const Card = next ? 'button' : 'div';
          return (
            <Card
              key={i}
              className={`vial-row${next ? ' buyable' : ''}`}
              style={{ '--vial': v.color } as CSSProperties}
              {...(next && {
                type: 'button' as const,
                disabled: gold < cost,
                onClick: () => onBuy(i),
                title: `Buy ${v.name} Lv ${level + 1}`,
              })}
            >
              <div className="vial-top">
                <span className="vial-dot" aria-hidden />
                <span className="vial-name">{v.name}</span>
                {tower.vialNext === i && <Icon name="play" className="vial-next" title="Thrown next" />}
              </div>
              <div className="vial-body">
                <div className="vial-eff">
                  {next ? vialLevelLabel(v, level + 1, m.potency[i] ?? 1) : vialEffectLabel(cycle[i].effect)}
                </div>
                <div className="vial-side">
                  {next ? (
                    <span className="vial-buy">
                      <Icon name="coin" />{cost}
                    </span>
                  ) : (
                    <span className="vial-max"><Icon name="star" /> Max</span>
                  )}
                  <span className="vial-pips" title={`Lv ${level}/${v.levels.length}`}>
                    {v.levels.map((_, li) => (
                      <span key={li} className={li < level ? 'on' : ''} />
                    ))}
                  </span>
                </div>
              </div>
            </Card>
          );
        })}
        {formula && (
          // The Grand Formula: no levels of its own, it carries the others' effects.
          <div className="vial-row" style={{ '--vial': formula.color } as CSSProperties}>
            <div className="vial-top">
              <span className="vial-dot" aria-hidden />
              <span className="vial-name">{formula.name}</span>
              {tower.vialNext === vials.length && <Icon name="play" className="vial-next" title="Thrown next" />}
            </div>
            <div className="vial-body">
              <div className="vial-eff">All in One</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Every buff presently boosting a deployed champion, for the in-stage "Active
 * Buffs" panel. Reads only live tower fields, so the list (and any countdown)
 * refreshes each frame as the HUD re-renders. Covers the Bard's attack-speed
 * tune (timed), the Swordsman's Better Morale (adjacency), and the Wizard's
 * Guiding Gale range aura. New buffs slot in here as they're added.
 */
function activeBuffsFor(t: Tower): ActiveBuff[] {
  const buffs: ActiveBuff[] = [];
  // The champion's own ability haste (the Bow's Quickdraw) — its own symbol and a
  // hot amber "speed" colour, distinct from the Bard's rosy tune below.
  if ((t.abilitySpeedBuffMult ?? 1) > 1) {
    buffs.push({
      icon: 'fast',
      name: 'Quickdraw',
      detail: `+${Math.round((t.abilitySpeedBuffMult - 1) * 100)}% attack speed · ${Math.ceil(
        t.abilitySpeedBuffTimer,
      )}s left`,
      color: '#ffa83d',
    });
  }
  // The Longbow's Piercing Shot: arrows still nocked, in the archer's colour.
  if ((t.pierceShots ?? 0) > 0) {
    buffs.push({
      icon: 'longbow',
      name: 'Piercing Shot',
      detail: `${t.pierceShots} piercing ${t.pierceShots === 1 ? 'arrow' : 'arrows'} nocked`,
      color: t.def.visual.color,
    });
  }
  // Toxic Resilience: the haste of a debuff it just shrugged off.
  if ((t.resistHasteMult ?? 1) > 1) {
    buffs.push({
      icon: 'fast',
      name: 'Toxic Resilience',
      detail: `+${Math.round((t.resistHasteMult - 1) * 100)}% attack speed · ${Math.ceil(t.resistHasteTimer)}s left`,
      color: CHAMPION_DEBUFFS.sludged.color,
    });
  }
  // Warding Fumes from a nearby Plague Doctor.
  if ((t.resistChance ?? 0) > 0) {
    buffs.push({
      icon: 'shield',
      name: 'Warding Fumes',
      detail: `${Math.round(t.resistChance * 100)}% chance to resist disabling effects · from a nearby Plague Doctor`,
    });
  }
  if ((t.attackSpeedBuffMult ?? 1) > 1) {
    buffs.push({
      icon: 'music',
      name: 'Hastened',
      detail: `+${Math.round((t.attackSpeedBuffMult - 1) * 100)}% attack speed · ${Math.ceil(
        t.attackSpeedBuffTimer,
      )}s left`,
    });
  }
  if (t.adjacentDamageMult > 0 && t.adjacentAllies > 0) {
    buffs.push({
      icon: 'swords',
      name: 'Better Morale',
      detail: `+${Math.round(t.adjacentDamageMult * t.adjacentAllies * 100)}% damage · ${t.adjacentAllies
        } ${t.adjacentAllies === 1 ? 'ally' : 'allies'}`,
    });
  }
  if (t.rangeBuffed) {
    buffs.push({
      icon: 'target',
      name: 'Guiding Gale',
      detail: `+${Math.round(((t.rangeBuffMult ?? 1) - 1) * 100)}% attack range · from a nearby Wizard`,
    });
  }
  // Not a buff but the one penalty a champion carries: lost in the mist.
  if (t.mistMult < 1) {
    buffs.push({
      icon: 'lantern',
      name: 'Lost in the Mist',
      detail: `−${Math.round((1 - t.mistMult) * 100)}% attack range · light a lantern nearby`,
      color: '#9fb4c4',
    });
  }
  return buffs;
}

/** A debuff countdown: tenths while short, whole seconds once long. */
function secondsLeft(t: number): string {
  return t < 10 ? `${t.toFixed(1)}s` : `${Math.ceil(t)}s`;
}

/**
 * The inspected foe's live snapshot: health, shield and every effect slowing
 * or softening it right now. Reads only enemy fields, so the panel (and each
 * countdown) refreshes each frame. New debuffs slot in here as they're added.
 */
function inspectEnemy(e: Enemy): EnemyInspect {
  const debuffs: EnemyDebuff[] = [];
  // The Frost Witch's chill.
  if (e.slowTimer > 0 && e.slowFactor < 1) {
    debuffs.push({
      icon: 'snowflake',
      name: 'Chilled',
      detail: `−${Math.round((1 - e.slowFactor) * 100)}% speed`,
      timeLeft: e.slowTimer,
      color: '#9fdcff',
    });
  }
  // Standing in an Ice Storm (eases in and out at its edge, so shown live).
  if (e.storm > 0.01 && e.stormSlow > 0) {
    debuffs.push({
      icon: 'snowflake',
      name: 'Ice Storm',
      detail: `−${Math.round(e.stormSlow * e.storm * 100)}% speed · while in the storm`,
      color: '#c6ecff',
    });
  }
  // Icebreak's Brittle: every hit lands harder.
  if (e.brittle > 0 && e.brittleMult > 1) {
    debuffs.push({
      icon: 'crack',
      name: 'Brittle',
      detail: `+${Math.round((e.brittleMult - 1) * 100)}% damage taken`,
      timeLeft: e.brittle,
      color: '#bfe9ff',
    });
  }
  // The Bandit's open wounds, bleeding until the longest one closes.
  if (e.bleeds.length > 0) {
    const dps = e.bleeds.reduce((sum, w) => sum + w.dps, 0);
    debuffs.push({
      icon: 'blood',
      name: 'Bleeding',
      detail: `${e.bleeds.length} wound${e.bleeds.length > 1 ? 's' : ''} · ${dps.toFixed(1)} dmg/s`,
      timeLeft: Math.max(...e.bleeds.map((w) => w.left)),
      color: '#e0455a',
    });
  }
  // Poison stacks, eating a share of its max health until the last wears off.
  if (e.poisons.length > 0) {
    const dps = e.poisons.reduce((sum, p) => sum + p.dps, 0);
    debuffs.push({
      icon: 'poison',
      name: 'Poisoned',
      detail: `${e.poisons.length} stack${e.poisons.length > 1 ? 's' : ''} · ${dps.toFixed(1)} dmg/s`,
      timeLeft: Math.max(...e.poisons.map((p) => p.left)),
      color: '#8fd14f',
    });
  }
  // Mid-shove from a Gale Force gust or the Earthsplitter.
  if (e.knockbackRemaining > 0.5) {
    debuffs.push({
      icon: 'back',
      name: 'Knocked back',
      detail: 'Sliding back along the path',
      color: '#d8e4f0',
    });
  }
  // A light-shy foe losing the scent in lantern light.
  if (e.def.lightSlow != null && e.cower > 0.02) {
    debuffs.push({
      icon: 'lantern',
      name: 'Cowering',
      detail: `−${Math.round((1 - e.def.lightSlow) * e.cower * 100)}% speed · in lantern light`,
      color: '#ffd977',
    });
  }
  return {
    uid: e.uid,
    def: e.def,
    health: Math.max(0, Math.ceil(e.health)),
    maxHealth: e.def.health,
    shield: e.shield,
    maxShield: e.shieldMax,
    ward: e.wardReduction,
    debuffs,
  };
}

/** One row of the inspected foe's defences. */
interface EnemyDefence {
  key: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  title?: string;
}

/** Every defence the inspected foe has: resistances, dodge, shield, ward, regen. */
function enemyDefences(foe: EnemyInspect): EnemyDefence[] {
  const def = foe.def;
  const out: EnemyDefence[] = [];
  const pct = (f: number) => `${Math.round(f * 100)}%`;
  if (def.physicalResist) {
    out.push({
      key: 'phys',
      icon: <ResistShield kind="physical" pct={Math.round(def.physicalResist * 100)} />,
      label: 'Physical resist',
      value: pct(def.physicalResist),
      title: 'Physical attacks deal this much less damage.',
    });
  }
  if (def.magicResist) {
    out.push({
      key: 'magic',
      icon: <ResistShield kind="magic" pct={Math.round(def.magicResist * 100)} />,
      label: 'Magic resist',
      value: pct(def.magicResist),
      title: 'Magic attacks deal this much less damage.',
    });
  }
  if (def.dodgeChance) {
    out.push({
      key: 'dodge',
      icon: <Icon name="turn" />,
      label: 'Dodge',
      value: pct(def.dodgeChance),
      title: 'Chance to slip a hit entirely.',
    });
  }
  if (foe.maxShield > 0) {
    out.push({
      key: 'shield',
      icon: (
        <span className="ei-pips">
          {/* A big shield (over 6) is just one pip beside the count. */}
          {Array.from({ length: foe.maxShield > 6 ? 1 : foe.maxShield }, (_, i) => (
            <i key={i} className={i < foe.shield || (foe.maxShield > 6 && foe.shield > 0) ? 'on' : ''} />
          ))}
        </span>
      ),
      label: 'Shield',
      value: `${foe.shield} / ${foe.maxShield} hits`,
      title: 'Each hit, however big, is blocked and costs one point.',
    });
  }
  if (foe.ward > 0) {
    out.push({
      key: 'ward',
      icon: <Icon name="shield" />,
      label: 'Warded',
      value: `−${pct(foe.ward)} damage`,
      title: 'Shielded by a nearby protective aura.',
    });
  }
  if (def.damageAura) {
    out.push({
      key: 'aura',
      icon: <Icon name="sparkle" />,
      label: 'Ward aura',
      value: `−${pct(def.damageAura.reduction)} to allies`,
      title: 'Softens damage to other foes near it.',
    });
  }
  if (def.regen) {
    out.push({
      key: 'regen',
      icon: <Icon name="heart" />,
      label: 'Regeneration',
      value: `+${+(def.regen * 100).toFixed(1)}% HP/s`,
      title: 'Heals a share of its health every second.',
    });
  }
  if (def.unkillable) {
    out.push({
      key: 'unkillable',
      icon: <Icon name="lock" />,
      label: 'Unyielding',
      value: 'Never below 1 HP',
    });
  }
  return out;
}

/**
 * The click-to-inspect foe panel in the battle side panel: live health, its
 * defences and the debuffs on it right now. Esc, the close button or a click
 * anywhere else on the board lets it go; it closes itself when the foe falls.
 */
function EnemyPanel({ foe, onClose }: { foe: EnemyInspect; onClose: () => void }) {
  const def = foe.def;
  const pct = foe.maxHealth > 0 ? Math.max(0, Math.min(1, foe.health / foe.maxHealth)) : 0;
  const defences = enemyDefences(foe);
  return (
    <div className={`panel panel-pad enemy-inspect${def.boss ? ' boss' : ''}`} aria-label={`${def.name} details`}>
      <button type="button" className="ei-close" onClick={onClose} title="Close (Esc)" aria-label="Close">
        <Icon name="close" />
      </button>
      <div className="ei-head">
        <div
          className="unit-portrait ei-portrait"
          style={{ '--rarity': def.boss ? 'var(--red)' : def.visual.color } as CSSProperties}
        >
          <EnemySprite enemy={def} size={50} />
        </div>
        <div className="ei-title">
          <span className="ei-name">{def.name}</span>
          {def.boss && (
            <span className="ei-boss-tag">
              <Icon name="skull" /> Boss
            </span>
          )}
        </div>
      </div>

      <div className="ei-hp">
        <div className="ei-hp-head">
          <span>
            <Icon name="heart" /> Health
          </span>
          <span className="ei-hp-val">
            {foe.health} / {foe.maxHealth}
          </span>
        </div>
        <div className="ei-hpbar">
          <span
            className={pct > 0.5 ? '' : pct > 0.25 ? 'mid' : 'low'}
            style={{ width: `${pct * 100}%` }}
          />
        </div>
      </div>

      <div className="ei-section-head">Defences</div>
      {defences.length === 0 ? (
        <div className="ei-empty">No resistances.</div>
      ) : (
        <div className="ei-defs">
          {defences.map((d) => (
            <div key={d.key} className="ei-def" title={d.title}>
              <span className={`ei-def-ic ei-${d.key}`}>{d.icon}</span>
              <span className="ei-def-label">{d.label}</span>
              <b>{d.value}</b>
            </div>
          ))}
        </div>
      )}

      <div className="ei-section-head">
        Debuffs
        <span className={`buffs-count ${foe.debuffs.length ? 'has ei-has' : ''}`}>{foe.debuffs.length}</span>
      </div>
      {foe.debuffs.length === 0 ? (
        <div className="ei-empty">Nothing is holding it back.</div>
      ) : (
        <div className="buffs-list ei-debuffs">
          {foe.debuffs.map((b) => (
            <div key={b.name} className="buff-row ei-debuff" style={{ '--debuff': b.color } as CSSProperties}>
              <span className="buff-ic">
                <Icon name={b.icon} />
              </span>
              <span className="buff-info">
                <b>{b.name}</b>
                <span>{b.detail}</span>
              </span>
              {b.timeLeft != null && <span className="ei-time">{secondsLeft(b.timeLeft)}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A HUD number in a box wide enough for `digits` digits, so a value gaining a
 * digit (gold 99 → 100, foes 9 → 10) never resizes its stat and reflows the HUD.
 */
function HudNum({ value, digits, align }: { value: number; digits: number; align?: 'right' }) {
  return (
    <span className="hud-num" style={{ minWidth: `${digits}ch`, textAlign: align }}>
      {value}
    </span>
  );
}

/** Endless HUD hint: how far off the next boss wave is (wave `n` is 1-based). */
function bossCountdown(n: number): string {
  const left = (ENDLESS_BOSS_EVERY - (n % ENDLESS_BOSS_EVERY)) % ENDLESS_BOSS_EVERY;
  return left === 0 ? 'Boss wave' : `Boss in ${left}`;
}

/** The end of an endless run: waves held, gems won, and the chapter record. */
function EndlessResultCard({
  wavesCleared,
  gemsEarned,
  newBest,
  best,
  armorDrops,
  onExit,
  onHome,
  onRetry,
}: {
  wavesCleared: number;
  gemsEarned: number;
  newBest: boolean;
  best: number;
  armorDrops: ArmorRoll[];
  onExit: () => void;
  onHome: () => void;
  onRetry: () => void;
}) {
  return (
    <div className={`panel result-card ${newBest ? 'win' : 'lose'}`}>
      <h2>
        <Icon name={newBest ? 'trophy' : 'flag'} /> {newBest ? 'New Record' : 'Run Over'}
      </h2>
      <p style={{ color: 'var(--text-dim)' }}>
        You held the line for {wavesCleared} {wavesCleared === 1 ? 'wave' : 'waves'}.
      </p>
      <div className="reward">
        <div style={{ color: '#6fd6ff' }}>
          Gems earned · <Icon name="gem" /> {gemsEarned}
        </div>
        <div style={{ color: 'var(--text-dim)' }}>Best · {best} waves</div>
      </div>
      <LootList drops={armorDrops} />
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button className="btn ghost" onClick={onHome}>
          Home
        </button>
        <button className="btn ghost" onClick={onExit}>
          Continue
        </button>
        <button className="btn primary" onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  );
}

function ResultCard({
  outcome,
  gemReward,
  victoryLine,
  firstClear,
  armorDrops,
  onExit,
  onHome,
  onRetry,
}: {
  outcome: Outcome;
  gemReward: number;
  /** The stage's own line under "Victory" (`LevelDef.victoryLine`), else the usual one. */
  victoryLine?: string;
  firstClear: boolean;
  armorDrops: ArmorRoll[];
  onExit: () => void;
  onHome: () => void;
  onRetry: () => void;
}) {
  const won = outcome === 'won';
  return (
    <div className={`panel result-card ${won ? 'win' : 'lose'}`}>
      <h2>
        <Icon name={won ? 'trophy' : 'skull'} /> {won ? 'Victory' : 'Defeated'}
      </h2>
      <p style={{ color: 'var(--text-dim)' }}>
        {won
          ? victoryLine ?? 'The realm is saved. The boss lies vanquished!'
          : 'Your castle has fallen. Regroup and try again.'}
      </p>
      <div className="reward">
        {won && firstClear && (
          <div style={{ color: '#6fd6ff' }}>Realm reward · <Icon name="gem" /> {gemReward}</div>
        )}
        {won && !firstClear && (
          <div style={{ color: '#6fd6ff' }}>
            Replay reward · <Icon name="gem" /> {REPLAY_GEM_REWARD}
          </div>
        )}
      </div>
      <LootList drops={armorDrops} />
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

/** The "armor found" toast that rises over the board when a boss drops a piece. */
function LootToast({ roll }: { roll: ArmorRoll }) {
  const rarity = ARMOR_RARITIES[roll.rarity];
  return (
    <div className="loot-toast" style={{ '--rarity': rarity.color } as CSSProperties}>
      <ArmorIcon piece={roll} size={46} />
      <div>
        <div className="loot-toast-kicker">Armor found</div>
        <div className="loot-toast-name">
          {rarity.name} {armorPieceName(roll)}
        </div>
        <div className="loot-toast-stats">
          {armorStatLines(roll.stats).map((l) => `${l.label} ${l.value}`).join(' · ')}
        </div>
      </div>
    </div>
  );
}

/** The pieces this battle's bosses dropped, on the result card. */
/** Armor tiles shown on the result card before the rest collapse into "+N more". */
const LOOT_LIST_MAX = 3;

function LootList({ drops }: { drops: ArmorRoll[] }) {
  if (drops.length === 0) return null;
  // Rarest first; only the top few get a tile so a long endless run still fits the card.
  const sorted = [...drops].sort((a, b) => ARMOR_RARITIES[b.rarity].order - ARMOR_RARITIES[a.rarity].order);
  const shown = sorted.slice(0, LOOT_LIST_MAX);
  const rest = sorted.slice(LOOT_LIST_MAX);
  return (
    <div className="loot-list">
      <div className="loot-list-head">
        {drops.length > 1 ? `${drops.length} armor pieces found` : 'Armor found'} · added to your armory
      </div>
      <div className="loot-list-items">
        {shown.map((roll, i) => {
          const rarity = ARMOR_RARITIES[roll.rarity];
          const lines = armorStatLines(roll.stats).map((l) => `${l.label} ${l.value}`);
          return (
            <div
              key={i}
              className="loot-item"
              style={{ '--rarity': rarity.color } as CSSProperties}
              title={[`${rarity.name} ${armorPieceName(roll)}`, ...lines].join('\n')}
            >
              <ArmorIcon piece={roll} size={44} />
              <span>{armorPieceName(roll)}</span>
            </div>
          );
        })}
        {rest.length > 0 && (
          <div
            className="loot-item loot-item-more"
            title={rest.map((roll) => `${ARMOR_RARITIES[roll.rarity].name} ${armorPieceName(roll)}`).join('\n')}
          >
            <strong>+{rest.length}</strong>
            <span>more</span>
          </div>
        )}
      </div>
    </div>
  );
}
