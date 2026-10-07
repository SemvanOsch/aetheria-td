# Aetheria — Fantasy Tower Defense

A small but fully playable Tower Defense game. Create your own adventurer,
collect champions through summons, deploy them to hold back waves of enemies,
and defeat the boss of each stage.

Built with **Vite + React + TypeScript** and a plain `<canvas>` for the board —
no game engine and no runtime libraries beyond React. All sprites, props,
terrain, sound effects and music are drawn or synthesized in code.

## Run

```bash
npm install
npm run dev        # start the dev server (http://localhost:5173)
npm run build      # type-check + production build
npm run lint       # eslint
npm run typecheck  # tsc only
npm run champions  # dev server opened on the champion stats sheet (#champions)
npm run enemies    # dev server opened on the enemy stats sheet (#enemies)
```

## How to play

1. **First launch** opens the journal: create your adventurer's portrait, pick
   a class (Blade, Bow or Magic) and sign your name. Your adventurer joins you
   as a deployable **hero** champion. You also start with the Swordsman and
   the Archer.
2. The **home desk** is the menu: the **map** leads to Play, the **crystal
   ball** to Summon and the **journal** to your adventurer, champions and
   bestiary. Gems, patch notes and settings sit in the top-right corner.
3. **Summon** more champions with 💎 gems (100 each). Once you own a champion
   you keep it for good — no stacking. Summoning one you already own refunds
   20% of the gems.
4. Build your **team** of up to 6 champions in the journal's Champions pages;
   only team members can be deployed in a stage.
5. **Play** a stage: select a champion, click a free tile beside the path to
   deploy it (spending 🪙 gold), then start each wave. Champions attack
   automatically. Each champion has its own deploy limit per stage. Right-click
   or press **Esc** to cancel a placement.
6. Select a deployed champion to buy its in-stage **upgrades** with gold,
   change its **targeting** (First / Last / Strongest) or sell it. Heroes level
   up in battle and unlock an activated **ability** that costs mana.
7. Kill enemies for gold and survive every wave on every path to win. Don't
   let foes reach your castle. Clearing a stage unlocks the next and pays a 💎
   gem reward the first time. Progress is saved automatically.
8. Every stage, won or lost, earns **mastery EXP** to spend in each champion's
   permanent **skill tree** (from the journal).
9. Clear every stage of a chapter to unlock its **endless** mode: randomly
   rolled waves that keep growing, with a boss every 5th wave worth 50 gems.
10. Once your adventurer learns the armor node in their skill tree, endless
    bosses may drop **armor** for them: a helmet, chestplate, leg piece or
    boots in Common, Rare, Epic or Legendary. Every piece rolls random stats
    (2 on Common and Rare, 3 on Epic and Legendary). Equip it in the
    **Armory** from the journal; all four pieces of one set add its set bonus.
    Unworn pieces can be salvaged for gems.

### Currencies

- **💎 Gems** — the persistent currency: earned from first clears and endless
  bosses, spent on summons.
- **✨ Mastery EXP** — earned by each champion from its kills in every stage, spent in its
  skill tree.
- **🪙 Gold** — a per-stage battle resource only: each stage starts you with a
  fixed amount, slain enemies (and the Farmer) add more, and you spend it on
  deploying and upgrading champions. It does not carry between stages.

### Champions

- **Swordsman, Archer, Crossbow** — hit one enemy per attack.
- **Spearman** — a piercing line that strikes every enemy toward its target.
- **Wizard** — a gust of wind that homes in on one enemy.
- **Elf** — enchanted arrows that leap on to nearby enemies.
- **Farmer** — produces gold each wave instead of fighting.
- **Bard** — plays a tune that speeds up nearby champions' attacks.
- **Your adventurer** — a hero with a mana pool and an activated ability: the
  Blade's dual swords, the Bow's arrow bursts or the Magic hero's exploding orbs.

## Architecture

Strict one-directional layering (`ui → application → domain`, with `engine` a
self-contained sibling), so new content is mostly a data edit:

```
src/
  domain/          Pure game data & rules (no framework)
    units.ts         Champion catalog + in-stage upgrades     ← add champions here
    enemies.ts       Enemy catalog + bosses (BOSS_META)       ← balance here
    levels.ts        Chapters, stages, paths/lanes & waves    ← add stages here
    endless.ts       Endless-mode maps and foe pools
    mastery.ts       Permanent skill trees
    armor.ts         The adventurer's armor: slots, rarities, stats, sets
    playerChampion.ts, playerSprite.ts, proficiency.ts   The custom adventurer
    rarity.ts        Rarity ladder (Common and Rare are summonable)
    targeting.ts     Targeting strategies
    combat.ts        Crit rules
    atmosphere.ts    Stage moods (lighting, weather, grade)
    decor.ts         Board themes and props
    grid.ts, journal.ts
  application/     Use-cases / state
    gameState.ts     Central GameState model + pure transitions
    summon.ts        Summon roll (rarity weights)
    store.tsx        React binding: owns state, persists, exposes actions
  infrastructure/
    storage.ts       The ONLY localStorage access point
  engine/          Real-time battle simulation (framework-agnostic)
    GameEngine.ts    The tick loop: spawns, movement, combat, waves, win/lose
    renderer.ts      Canvas drawing (reads the engine; no rules)
    sprites.ts, figure.ts, anatomy.ts   Procedural figures + compositor
    terrain.ts, props.ts, lighting.ts, vfx.ts, palette.ts, armorArt.ts
    types.ts         Runtime entity types
  ui/              React screens, components and synthesized audio
    App.tsx, screens/, components/
```

### Extending

- **New champion:** add an entry to `UNITS` in `domain/units.ts` (including its
  `deployLimit`, the per-stage placement cap). Give it a sprite in
  `engine/sprites.ts` or it falls back to its emoji.
- **New enemy:** add to `ENEMIES` in `domain/enemies.ts`; a stage boss is a
  `BOSS_META` entry.
- **New stage:** add a spec to its chapter in `domain/levels.ts` (path or
  lanes, and waves). Give it an optional `theme`, `decor` and `mood` to dress
  it — open **Settings → Developer → Level Designer** to draw paths, stamp
  props and preview moods, then paste the exported snippet into the spec.
- **New endless map:** add an `EndlessSpec` in `domain/endless.ts`.
- **Enable a rarity:** flip `available: true` in `domain/rarity.ts` and author
  champions of that rarity — the summon roll picks it up automatically.
- **New targeting strategy:** add it to `TARGETING_STRATEGIES` in
  `domain/targeting.ts`; add it to `SELECTABLE_TARGETING` to expose it in-stage.
- **Skill tree node:** add it to the champion's `MASTERY_TREES` entry in
  `domain/mastery.ts`.
- **Armor:** everything tunable is data in `domain/armor.ts`: drop chances in
  `ARMOR_DROPS`, rarity odds / stats per piece / salvage gems in
  `ARMOR_RARITIES`, the rollable stats and their ranges in `ARMOR_STATS`, and
  each set's piece names and 4-piece bonus in `ARMOR_SETS` (one per chapter via
  `section`). Settings → Developer has an armor forge.

All persistence flows through `application/store.tsx` + `infrastructure/storage.ts`.
Nothing in the UI touches `localStorage` or game rules directly.
