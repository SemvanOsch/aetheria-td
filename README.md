# Aetheria — Fantasy Tower Defense

A small but fully playable Tower Defense MVP. Collect champions via a summon
system, deploy them to defend against waves of enemies, and defeat the boss of
each realm.

Built with **Vite + React + TypeScript** and a plain `<canvas>` for the board —
no game engine or extra runtime libraries.

## Run

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # type-check + production build
npm run lint     # eslint
npm run typecheck
```

## How to play

1. On first launch, pick **one** free Common starter (Archer / Swordsman / Spearman).
2. **Summon** more champions with 💎 gems (100 each). Once you own a unit type
   you keep it for good and can deploy it in any stage — no stacking. Summoning
   a type you already own **refunds 20% of the gems**.
3. Browse the **Champions** menu to see every champion; tap one for a detail
   sheet with full stats, attack (AoE) type and DPS.
4. **Play** a realm: select a champion, click a green tile to deploy it beside
   the path (spending 🪙 gold), then **Start** each wave. Units attack
   automatically. You may deploy up to **4 of each unit type per stage**.
   Right-click or press **Esc** to cancel a placement.
5. Select a deployed unit to change its **targeting** (First / Last / Strongest)
   or sell it.
6. Kill enemies for gold, survive the waves, and slay the **boss** to win.
   Don't let foes reach your castle. Clearing a realm unlocks the next and pays
   a 💎 gem reward. Progress persists.

### Currencies

- **💎 Gems** — the only persistent currency: earned from clearing realms, spent
  summoning champions.
- **🪙 Gold** — a per-stage battle resource only: each level starts you with a
  fixed amount, you earn more from slain enemies, and you spend it deploying
  units. It does not carry between stages and is not shown on the menus.

### Attack (AoE) types

- **Single Target** — Archer and Swordsman hit one enemy per attack.
- **Line AoE** — the Spearman drives a piercing line to the end of its range,
  hitting every enemy caught in a straight line toward its target.

## Architecture

Concerns are separated so new content is data-only to add:

```
src/
  domain/          Pure game data & rules (no framework)
    rarity.ts        Rarity ladder (Common..Legendary; only Common available)
    units.ts         Data-driven unit catalog + starter ids  ← add units here
    enemies.ts       Data-driven enemy/boss catalog           ← balance here
    levels.ts        Levels, paths & waves                    ← add levels here
    targeting.ts     Targeting strategies (first/closest/strongest)
    grid.ts          Board geometry helpers
  application/     Use-cases / state
    gameState.ts     Central GameState model + pure transitions
    summon.ts        Data-driven summon roll (rarity weights)
    store.tsx        React binding: owns state, persists, exposes actions
  infrastructure/
    storage.ts       The ONLY localStorage access point
  engine/          Real-time battle simulation (framework-agnostic)
    GameEngine.ts    The tick loop: spawns, movement, combat, waves, win/lose
    renderer.ts      Canvas drawing (reads engine snapshot; no rules)
    types.ts         Runtime entity types
  ui/              React screens & components (no business rules)
    App.tsx, screens/, components/
```

### Extending

- **New unit:** add an entry to `UNITS` in `domain/units.ts` (includes its
  `deployLimit` — the per-stage placement cap).
- **New enemy / boss:** add to `ENEMIES` in `domain/enemies.ts`.
- **New level:** append to `LEVELS` in `domain/levels.ts` (path + waves). Give
  it an optional `theme` (floor/path colours) and `decor` (an array of props) to
  dress the stage — open **Settings → Level Designer** to draw the path, stamp
  props and pick colours visually, then paste the exported `path:`/`theme:`/`decor:`
  snippet straight into the level spec. Prop kinds live in `domain/decor.ts`.
- **Enable a rarity:** flip `available: true` in `domain/rarity.ts` and author
  units of that rarity — the summon roll picks it up automatically.
- **New targeting strategy:** add it to `TARGETING_STRATEGIES` in
  `domain/targeting.ts`; add it to `SELECTABLE_TARGETING` to expose it in-stage.
- **New AoE shape:** extend `AoeType` in `domain/units.ts` and handle it in
  `GameEngine.fire()` (+ a shot style in `engine/renderer.ts`).

All persistence flows through `application/gameState.ts` + `infrastructure/storage.ts`.
Nothing in the UI touches `localStorage` or game rules directly.
