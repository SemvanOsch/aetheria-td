# Art & Music Direction

The single reference for how Aetheria looks and sounds: visual style, palettes, sprite / figure / board-rendering conventions, UI art language, sound effects and background music. `CLAUDE.md` covers the code architecture and points here for anything art or audio. **Read this before any sprite, prop, VFX, UI-styling, SFX or music work.**

Standing rule: **when generating sprites, don't show the user the end result** (no screenshots of new sprite art).

---

## 1. Vision

A **dark medieval storybook**. Lacquered night-blue surfaces, hammered gold and bronze trim, parchment text and warm candlelight. Everything is procedural — sprites, props, terrain, icons, sound and music are drawn or synthesized in code; **no image or audio assets ship** (the only exceptions are the three hero ability PNGs in `public/`).

- **Gameplay reads first.** Decoration is reserved for anchors (headers, modals, legendary content, the journal); everyday chrome stays quiet.
- **One painted world.** Board, props, VFX and menu portraits share one palette and one finishing pass, so nothing looks pasted in.
- **Warm light, cool shadow.** Light families are warm (fire, candle, window) unless the setting is magical or nocturnal; shadows lean plum and blue, never pure black.

---

## 2. Palette

### Canvas art — `engine/palette.ts`
The only source of *shared* colours on the canvas. Pull ink, shadows, light families and materials from here, and never add a new hex for something it already covers. Per-champion accent colours come from content data (`visual.color`); everything that shades, outlines or lights them comes from the palette.

| Group | Use |
|---|---|
| `INK` | Outlines. `base` is a warm plum-black (`#140d17`, never `#000`); `soft` is for menu portraits; `select` gold marks the chosen champion; `threat` coral marks a hovered foe. |
| `SHADOW` | `contact` under the feet, a wider `cast` shadow, and `ao` where props meet the floor. |
| `LIGHT` | Light families as `{ core, glow }`: fire, candle, lantern, window, moon, arcane, frost, wind, holy, dark, poison, blood. Every light source picks one family. |
| `MATERIAL` | Base tones (steel, iron, gold, wood, leather, stone, marble, cloth, skin, boot, foliage, water, ember, flame). Derive lit and dark variants with `shade()`. |

Easing curves and the seeded RNG live in `palette.ts` too.

### UI — CSS variables at the top of `ui/styles.css`
- **Surfaces:** `--bg-0..2` (night blue-black), `--panel*`, `--well`.
- **Trim:** `--gold`, `--gold-hi`, `--gold-deep`, `--bronze`, the `--gild` gradient and the `--gild-line` hairline.
- **Text:** parchment `--text` (`#f2ebda`), `--text-dim`, `--text-faint`.
- **Semantic:** green/red/blue, magic purple, frost, fire, poison, mana.
- **Rarity:** `--r-common/rare/epic/legendary/hero` (mirrors `domain/rarity.ts`).
- Plus the depth, radius, type-scale and motion tokens. Use the tokens, not raw values.

---

## 3. Typography & UI art language

- **Fonts** load from Google Fonts in `index.html`.
  - **Cinzel:** titles and buttons.
  - **EB Garamond:** story and flavour text.
  - **Inter:** functional UI, numbers and metadata.
  - **Caveat:** handwriting in the journal (`--font-hand`).
- **Icons** are the inline-SVG set in `ui/components/Icon.tsx`. They use `currentColor`, with a duotone `.ic-fill` layer. **No emoji in UI chrome.** Data-level `visual.icon` emoji remain only as sprite fallbacks.
- **Backdrop.** The screens the desk leads to (Summon, the mode picker, the campaign) sit over the desk itself: `DeskBackdrop` in `Home.tsx` renders the same scene held still (no animation, except that the orb behind Summon keeps whirling) and zoomed into the object that leads there (the orb for Summon, the leaned-over map for the mode picker and campaign; `frozenOn`), blurred and dimmed (`blur(8px) brightness(0.5)`), and inert. The journal, opened from the game, floats over the live desk behind a `backdrop-filter: blur(10px)` dim (`.intro-root.over-desk`). The zoomed desk shows through. The first-launch journal keeps its opaque night. The old animated night-sky `Backdrop` canvas is no longer mounted.
- **Ornament.** `.panel.ornate` panels and modals get gilded corners. `UnitCard` frames read `data-rarity`.
- **Summon ceremony.** A timed phase machine in `Summon.tsx` plus the `SummonFx` particle canvas. The reveal shows only the champion figure with its rarity, name and note stacked underneath. That caption is laid out (invisible) from the silhouette phase onwards and fades in as the colour resolves, so the figure never shifts; there is no card and no "Again" button, since Summon can simply be pressed again.
- **Champion detail sheet.** Two columns. On the left: a large portrait over a rarity-coloured glow, the name in gilt (plus "Hero of the …" for the player champion), tags, the description and the purple skill-tree button. On the right, "Battle profile": stat tiles, each with a label, a value in the title font and a sub-line. Below that are the in-stage levels with gold numbered medallions, the deltas in green, and an ability-granting tier picked out in gold.
- **Mastery skill tree.** A node board on a gridded dark well, with the champion at the top. Nodes are round gems; capstones (`major`) are diamonds. Each node's glyph comes from its first effect field (`nodeIcon` in `MasteryTree.tsx`). Locked nodes are dim, learnable ones pulse gold, learned ones fill with gold, and the links between them light gold as nodes are learned. Selecting a node opens it in the side panel, which holds the Learn or Activate button and the total-bonuses list.
- **Home: the adventurer's desk.** The home screen is a desk at night, drawn entirely in inline SVG (`ui/components/DeskArt.tsx`) and CSS. Behind it is a panelled wall with a three-pane window between star-sewn blue drapes on a brass rod, over a windowsill. Through the window is a living night: clouds drifting past the moon, a castle on a cliff with flickering windows and a fluttering flag, a lit bridge, a lake carrying the castle's reflection with moon glitter and mist, swaying pines, fireflies, a passing flight of birds and the odd shooting star. The desk's planks recede in perspective. **Props are anchored by their base** (`bottom` sets how far forward the foot sits) and carry their own contact shadow and warm reflection, so nothing floats: a lantern beside a book stack at back-left, a tall candlestick on two books plus a shorter one at back-right, coins, an inkwell, and a foreground candle cropped by the screen edge. Three objects are the ways in. The violet crystal ball on its brass petal cup (Summon) stands upright. The scroll map of Aetheria (Play) and the strapped journal with its quill (Journal) lie flat, tilted back with `rotateX`, with negative margins reclaiming the upright box. The map is inked, with no glow: coastline ripples, rhumb lines, the chapter names in italic, pins and a dashed route, a sea serpent, a ship, and a brass pocket compass whose needle drifts. Each object has a brass name plaque with a red "ready" dot. Hover or keyboard focus lifts the object. A pinned parchment note on the map continues into the next stage. Each object has its own lead-in before its destination opens. The **orb spins up** (about 1.4s): its vortex whirls faster and faster while the desk zooms in on it, and the altar opens as the spin ends. The **map is leaned over** (about 1.8s): the camera pans down onto it while it rises to face you, straight into the screen. The **journal** is a plain zoom with no veil (about 0.65s), opening over the blurred desk; Continue zooms into a dark leather veil. The desk stays zoomed under the journal until it closes, then zooms back out from it. Coming back works the same way. Returning from Summon draws the desk already zoomed into the orb; returning from Play (the mode picker's Home button, or Home after a battle) draws it already leaned over the raised map. In both cases the desk then zooms back out from that object (the orb's vortex winding down from its whirl to rest as it does) (`returnFrom` on `Home`). Escape cancels the zoom, and reduced motion skips it and stills every ambient animation. On narrow screens the map spans the top, with the orb and journal beneath.
- **Campaign (stage select).** Chapter tabs sit above a chapter map: stage medallions on a winding road (`mapPoint` in `Story.tsx`), with the road dotted until a stage is cleared and then solid gold. The next stage is a breathing gold medallion, cleared stages are gold-rimmed with a check, and locked ones are dim. The briefing panel shows a live still of the board, drawn by `drawBoard` on a fresh `GameEngine`. An unmet boss is a pure black shape with a red edge glow, and unseen foes get a gold "New" badge.
- **Journal.** Parchment leaves inside a leather cover. The ornaments are inline SVG in `ui/components/JournalArt.tsx`: flourish, compass rose, page corners, wax seal and cover corners. Three silk bookmarks peek out of the top of the book (crimson for the adventurer's own pages, royal blue for Champions, green for the Bestiary). Inactive ones sit lower and dimmer, and a gold dot marks one with something new. The Champions and Bestiary spreads share one layout. The left page is an entry plate: an arched frame with the figure, its name in the title font, italic traits, and a two-column ledger of numbers in handwriting with dotted leaders. The right page is an index of parchment cards, nine to a page, turned with the brass arrows. Champions not yet recruited are sepia sketches with a red "Not yet recruited" stamp. Company members carry a small wax seal, and the company itself is a row of parchment medallions. Undiscovered foes are dark silhouettes with an ink progress bar. Everything stays in ink, parchment and leather; the only colours on the page are the figures and their rarity glow.

---

## 4. Figures (champions, foes, the player's adventurer)

### Proportions carry the archetype
Bodies are built from `engine/anatomy.ts` parts, not stick strokes:
- `legSide` / `legFront`: jointed legs with knees and booted feet. `walkLegsSide` / `walkLegsFront` drive a stride from the walk phase, and the far leg is drawn darker.
- `torsoSide` / `torsoFront`: shoulders → waist → flared hem, with lit and cool bands.
- `arm`: elbow and hand, with an optional cuff or bell sleeve.
- `pauldron`, `belt`, `capeSide`.

Tanks are broad with plate, rangers lean and long-legged, casters robed. A new sprite picks its build from these parts rather than redrawing a body.

### Drawing conventions
- Sprite functions draw **flat, unoutlined fills**. Shading, rim light and outline all come from the compositor (below).
- Faces are drawn with `drawProfileFace`, painted *after* the headgear.
- Champions are dispatched by `drawUnitSprite(shape, …)` and gated by `hasSprite(shape)`. The board and every card call the same functions, so a new `drawX` appears everywhere at once. Shapes without a sprite fall back to emoji.
- **Enemies have three authored views** (`front`, `side`, `back`), chosen by travel heading, with the walk cadence driven by distance.
  - **Author every view to completeness.** A `back` view is a whole figure seen from behind, not a `front` view with the face left out.
  - The recurring bug is a `back` branch that draws the helm, hat or hood but no head under it. Every enemy sprite must draw a back of head (nape plus hair or cloak) in `back`.
- **Oversized foes.** A sprite that scales itself past a normal token (bosses using `ctx.scale`) hangs below the path. Register it in `footLiftFor` (`renderer.ts`) with a foot-lift that roughly tracks its scale: king 1.7× → 16, warden 1.5× → 13, captain 1.28× → 9.
- **Poses beyond the walk.** `drawEnemySprite`'s `sit` is a per-sprite pose blend (the king's seated → standing, Gowzer's intro taunt) and `flourish` (0..1) a looping in-pose gesture. The renderer drives Gowzer's taunt while he speaks (`TAUNT_POSE`), with the dagger twirl quantized to 16 cached frames.
- **Gowzer (`boss4`)** is the reference for a dark-clad foe: midnight charcoal cloth, kept darker than the King's Chamber's purple runner so he reads by value, with gold trim carrying the detail. He has a feathered mantle and cape (`drawFeather`), a bronze falcon half-mask, and a small gold light at the eyes. His death scatters feathers (`drawFeatherBurst`) as the shadow swallows him.

### The figure compositor — `engine/figure.ts`
`paintFigure(ctx, draw, style, cacheKey?)` renders a figure into a scratch canvas and finishes it as a whole, then composites it once so fades apply cleanly. The finishing pass adds:
- form shading: a warm head fading to cool ambient occlusion at the feet;
- a rim light on the upper edges, tinted by the stage light;
- hit-flash and status-tint washes;
- a contextual ink outline derived from the accent colour (`inkFor`);
- an optional cast shadow, sheared by the sun.

Caching works like this:
- Pass a `cacheKey` that fully identifies what `draw` paints, and the finished bitmap is reused (LRU).
- Idle breathing is a transform applied *outside* the composite.
- Attack poses are quantized to 12 steps, and walking foes to 16 stride frames via `enemyWalkPeriod` (the `ENEMY_CADENCE` table).
- **Anything that animates from inside the sprite must skip the cache.** That covers flourishes driven by the current time and the king's `sit`.

Menus use the same pass through `ui/portrait.ts`, with a thinner ink and one shared ~24 fps ticker. The player's adventurer portraits (journal and creator) use a much fainter rim (`rimAlpha` 0.07, `shading` 0.5): at large sizes the full rim read as a grey cap on dark hair.

### The player's adventurer
`drawPlayerSprite` composes interchangeable parts from a `PlayerSpriteConfig` but follows all of the conventions above, so it stands beside the champions. It has no nose: `cheek: false` on the profile face. Hair highlights are kept subtle. Strand and lit shades sit close to the base colour, so no "white streak" appears.

---

## 5. The battle board

### Frame pipeline — `renderer.ts` `drawBoard`
The board is drawn in this order:
1. **Baked ground** (`terrain.ts`): a seeded floor material and path material per the `BoardTheme`.
2. **Depth-sorted world:** props, champions, foes and corpses. Tall props that `occludes` fade to 50% when a figure stands behind them.
3. **Normal-blend VFX.**
4. **Lighting** (`lighting.ts`): ambient darkness with the lights punched out, additive glow, the sun wash and a soft-light grade.
5. **Glow pass:** attacks, projectiles and additive VFX. This pass is never darkened.
6. **Vignette.**
7. **Unlit overlays:** health bars, AoE guides, floating text and boss bars.

### Stage mood — `domain/atmosphere.ts`
Darkness, light family, weather, fog, grade, vignette and sun are pure data, keyed by level id, with a fallback mood per chapter:

| Chapter | Mood |
|---|---|
| Castle | Torchlit stone: fire light, dust, a warm amber grade, heavy vignette (darkness 0.42). Castle Door is a gold-lit dusk courtyard; the Throne Room is a torchlit crimson hall. |
| Capital | Bright city: window light, drifting petals, a low warm sun, light vignette (darkness 0.14). |
| Forest | Moonlit: fireflies, green fog and grade, heavy vignette. |
| Inn | Candlelit interior: dust, a warm orange grade. |

### VFX — `engine/vfx.ts`
The engine emits cosmetic `fx` events: `hit`, `kill`, `blast`, `cast`, `dodge`, `breach`, `deploy` and `bossSpawn`. They are the visual twin of `sfx`. `Vfx` turns them into:
- particles (pooled, capped at 900);
- rings, flashes, slash crescents and light pulses;
- exposure lifts and hit recoil;
- corpses;
- screen shake, which is off under `prefers-reduced-motion`.

Effects pick a `LIGHT` family for their colour.

**Buff auras on champions** are drawn in `renderer.ts` around the figure, not as `fx` events. Each one reads as its own shape and colour:
- **Better Morale:** a gold ground glow.
- **Bard tune:** music notes circling the head.
- **Quickdraw:** the foot ring flares.
- **Guiding Gale** (`drawGale`): wind-family ribbons spiral up from the feet past the head over a ground swirl. Each orbit is split by depth, with a `back` layer before the figure and a `front` layer after it, so the wind wraps the body. It also adds a faint `wind` light so it shows in dark rooms. An aura that wraps a figure should use the same back/front split.

### Props — `engine/props.ts`
- Each prop kind has a `PROP_ART` entry: an origin, a shadow, a `body` cached through the compositor with a quiet ink, and an animated `live` overlay for flames or water.
- Each also has a `PROP_META` entry: draw layer, `bounds`, base depth line, `occludes`, lights, flames and chimneys.
- **When you redraw a prop, update its `bounds` too.** They size the compositor box and the occlusion test.

---

## 6. Sound effects

All SFX are **synthesized placeholders** built from Web Audio primitives. Every sound routes through `ui/audioBus.ts`:

```
source → category gain (ui | combat | music) → master → speakers
```

The Settings sliders map onto those gains.

- **Interface** (`introAudio.ts`, `summonAudio.ts`): soft paper, quill and chime cues.
  - To add one, add a name to the `IntroSound` union.
  - Add a `case` in `playIntroSound`, built from the primitives there (`tone`, `noiseSwish`, `inkScratch`, …).
  - Call `playIntroSound('name')` at the moment it should fire.
- **Placement** (`uiAudio.ts`): `GameScreen` plays `place` (a muted thump plus a small D–A chime) when a champion deploys, and `deny` (a dull, low double knock) when it can't.
  - Gains stay around 0.02–0.05, with 0.085 for the thump.
  - Pitches stay low and **steady**: a downward pitch sweep on a bright wave sounds like a laser. Use sines, plus a short filtered-noise tap for a wooden attack.
  - Menus deliberately have **no** button or navigation click sounds. They were tried and removed.
- **Combat** (`combatAudio.ts`): one cue per engine `sfx` event.
  - Each type is throttled.
  - Each cue starts `AUDIO_LEAD` ahead of `currentTime` so its attack isn't clipped.
  - `holdAudioAwake()` keeps the output device from sleeping during a battle.

---

## 7. Music

### Direction
- **Menus** (home, every non-battle screen, the journal) get **calm, warm and wondering** music. It is the hearth between battles: slow, spacious and reverberant, with plucked and breathy instruments over soft chords.
- **Each story chapter** gets its own **battle theme**, fitting that chapter's setting but always martial: driving rhythm, percussion and brass.
- Battle themes **breathe with the game**.
  - In the build phase the theme is thin: strings and timpani, maybe a distant horn.
  - While a wave is on the board it is full: war drums, snare, brass and the melody.
  - After a battle it settles back down.
- Music sits **under** the SFX. Keep peaks modest; a compressor on each track helps. The default Music volume is 60%.

### Current tracks — `ui/music.ts`

| Track | Used for | Character |
|---|---|---|
| `menu` — *Hearthlight* | All screens outside battle | 72 BPM, D minor. Low drone and warm pad; a harp arpeggio in eighths; a flute melody on loops 2–3 (an octave up on loop 3); a bell at each phrase start. Large hall reverb (0.5). |
| `castle` — *Siege of the Keep* | Castle battles; fallback for chapters without a theme | 132 BPM, D minor. Progression Dm–Dm–B♭–C–Dm–B♭–Gm–A. Galloping low strings, timpani on 1 and 3, low string pad. During a wave: war drums on every beat, snare on 2 and 4, a crash at each phrase, a snare roll into it, brass stabs, and a heroic horn melody on alternate 8-bar loops. Drier reverb (0.22). |

### Instrument palette
These are the synthesized voices in `music.ts`; reuse them before writing new ones:
- **Sustained:** `pad` (detuned saws through a lowpass), `drone`.
- **Melodic:** `harp` (pluck), `flute` (sine with delayed vibrato), `horn` (filtered saw and square), `bell` (inharmonic partials).
- **Battle:** `stringHit` (ostinato stab), `brass` (opening-filter chord).
- **Percussion:** `timpani`, `warDrum`, `snare`, `crash`.

### Adding a chapter theme
1. Write a `TrackDef`: `bpm`, `beatsPerBar`, `reverb`, `level`, and a `bar(c, bar, t, beat, intensity)` that schedules one bar. Use 8-bar phrases and vary them across 4 passes with `Math.floor(bar / 8) % 4`.
2. Add its id to `MusicTrackId` and to `TRACKS`.
3. Map the chapter to it in `SECTION_MUSIC`.
4. Honour `intensity`: at least 0.5 means a wave is running (full arrangement); below that, keep it lean.

Suggested direction for the chapters that don't have themes yet:

| Chapter | Suggested direction |
|---|---|
| Capital | A stately, brighter march. A major-leaning key, fanfare brass and snare. |
| Forest | Mysterious and pulsing. Low drums, a modal flute, string drones. |
| Inn | Folkish and rowdy. A 6/8 jig feel with plucked lute-like voices and hand drums. |
