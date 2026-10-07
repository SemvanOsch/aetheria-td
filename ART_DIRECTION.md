# Art & Music Direction

The single reference for how Aetheria looks and sounds: visual style, palettes, sprite / figure / board-rendering conventions, UI art language, sound effects and background music. `CLAUDE.md` covers the code architecture and points here for anything art or audio. **Read this before any sprite, prop, VFX, UI-styling, SFX or music work.**

Standing rule: **when generating sprites, don't show the user the end result** (no screenshots of new sprite art).

---

## 1. Vision

A **dark medieval storybook**. Lacquered night-blue surfaces, hammered gold and bronze trim, parchment text and warm candlelight. Everything is procedural — sprites, props, terrain, icons, sound and music are drawn or synthesized in code; **no image or audio assets ship** (the only exceptions are the four round hero ability medallion PNGs in `public/`).

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
- **Developer menu.** A grid of tool cards under a gilded hammer badge: each card has an icon badge, a Cinzel title and a line of help over compact `dev-btn` buttons and pill chips (rarity chips take the rarity colour). Wide cards (Hero class, Armor forge, Danger zone) span both columns; the Danger zone is tinted red.
- **Champion detail sheet.** Two columns. On the left: a large portrait over a rarity-coloured glow, the name in gilt (plus "Hero of the …" for the player champion), tags, the description and the purple skill-tree button. On the right, "Battle profile": stat tiles, each with a label, a value in the title font and a sub-line. Below that are the in-stage levels with gold numbered medallions, the deltas in green, and an ability-granting tier picked out in gold.
- **Mastery skill tree.** A node board on a gridded dark well, with the champion at the top. Nodes are round gems; capstones (`major`) are diamonds. Each node's glyph comes from its first effect field (`nodeIcon` in `MasteryTree.tsx`). Locked nodes are dim, learnable ones pulse gold, learned ones fill with gold, and the links between them light gold as nodes are learned (a learned exclusive path that isn't the active one keeps a dark, unlit link). Selecting a node opens it in the side panel, which holds the Learn or Activate button and the total-bonuses list.
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
- **Oversized foes.** A sprite that scales itself past a normal token (bosses using `ctx.scale`) hangs below the path. Register it in `footLiftFor` (`renderer.ts`) with a foot-lift that roughly tracks its scale: king 1.7× → 16, warden 1.5× → 13, captain 1.28× → 9, Roland 1.3× → 9.
- **Captain Roland (`boss6`, `drawRoland`)** is the reference for a mounted boss, built on the Outrider's horse but heavier: a dark bay warhorse with feathered hooves, a steel chanfron with a gold spike, and a navy Squadron 8 caparison with a scalloped gold hem and the squadron's gold eight-pointed star. The rider is bare-headed in pale plate (the boss colour) with long golden hair under a thin gold circlet. In side view the hair streams back over a short navy cape and the lance is couched with its pennant trailing. In front and back views the lance is held upright, and in back view the hair falls down his back over the cape. The horse covers the rider's waist in front view and its rump does so in back view, so he reads as seated.
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

**The Magic adventurer's casting arms** (`drawPlayerCastArms`) run on two inputs: `draw` is the orb charge (0..1, 24 steps), and the attack value is the release (0.35s, linear).
1. **Gather and build:** the hands rise from the sides and cup the orb just above and below its edge at every size. The orb is drawn back toward the body as it swells (`magicOrbAnchor`, `magicOrbRadius`, shared with the renderer that paints it), with a slight lean back.
2. **Throw:** a two-handed palm thrust to `MAGIC_CAST_POINT`, where the engine launches the orb.
3. **Recover:** the hands ease back down to the sides.

During a Mana Ray the thrust is held. The beam leaves the palms (`beamOrigin`) while the figure leans and trembles into it, and the recovery plays when the channel ends. The upper arms go under the mantle and the forearms are repainted over it (`forearm`), so raised hands are never hidden.

**The Greater Orb** (the Magic's `greater_orb` node, same shape `player-magic`; the renderer passes `empowered` and the sprite swaps `drawPlayerCastArms` for `drawPlayerGreaterOrbArms`). The phases are the `GREATER_ORB_*` constants in `engine/types.ts`, shared by the sprite, the renderer's body motion (`greaterOrbBody`) and the engine's dust cues, so retime them together.
1. **Crouch** (charge 0 → 0.16): the arms swing back and down while the body squashes.
2. **Leap** (→ 0.38): the crouch snaps into a stretch, the body rises `GREATER_ORB_JUMP` (10px) and both arms swing forward and up (rotated round the shoulders) into a wide V either side of the head, elbows out. The legs tuck (`greaterOrbTuck`: feet drawn up, knees forward). The contact shadow stays on the floor and shrinks.
3. **Hang** (→ 1): a slow bob at the apex turning to a strained tremble. A huge orb kindles just before the apex and swells to 6.6 above the head, resting on the palms (`greaterOrbAnchor`, `greaterOrbRadius`), with motes spiralling into it (`drawOrbGather`). The near forearm is repainted after the head and headwear so a brim or hair never hides it.
4. **Throw-down** (a signature move, `specialAnim` over 0.62s): both arms whip over and forward-down as the orb leaves from overhead (`GREATER_ORB_MUZZLE` in the engine), hold through the fall, touch down at 0.55 in a squash, then ease back to the sides.

The charge pose is drawn in 48 steps (the arms sweep up in a short slice of a long charge). In flight the orb is drawn at 1.35× to match the held one; it bursts with the `heavy` blast. A Mana Ray cast mid-leap switches straight to the plain thrust, but the body doesn't snap down: `settleLeap` (renderer state, keyed per tower) eases it from the height it was last drawn at to the floor over `LEAP_DROP_TIME` (0.1s, accelerating), puts dust at the feet on touchdown and settles a quick squash.

**The Magic's Arcane Staff** (`drawPlayerStaff`, the Magic's Arcane Staff node, shape `player-staff`). A plain wooden staff (dark outline, mid wood, a faint lit streak) with a brass shoe and a brass collar under a carved two-prong crook cradling a long faceted crystal in the outfit colour (lightened, with a white facet). Every frame comes from `staffPose(release, draw, stance)`; the renderer's glow pass reads `staffTip` to light the crystal (`drawStaffGlows`: a faint idle shimmer, brighter through the raise, a flare as the volley flies, burning hot through a Mana Storm).
- **Rest:** planted upright beside the body, leaning a touch forward, held in the front hand; the rear arm hangs.
- **Raise** (`draw`, the 0.34s cast): lifted high in both hands, the rear hand sliding up onto the shaft. The bolts leave the crystal at the top of the raise (`staffTip(0, 1)`, the engine's `STAFF_MUZZLE`).
- **Release** (0.42s, linear): swept forward to point (outCubic) above 0.78, held pointing to 0.45, then lowered back to rest.
- **Mana Storm hold** (the ability, played as the signature move with `anim` = `manaStormStance`): hoisted upright in both hands just in front of the face (`STAFF_HIGH`), the front hand up at the crown and the crystal to the sky, raised over `MANA_STORM_RAISE` (0.22s) and lowered over the last `MANA_STORM_LOWER` (0.25s). Hoisted, the near forearm, the staff and both fists are repainted after the head and headwear (like the Greater Orb's arms); the far forearm stays behind the head. The figure stands a little taller and trembles. The glow pass burns the crystal hot, turns three arcs about it, spirals nine motes up from the feet into it and flares an upward spark as each bolt leaves (`stormFlash`); the crystal also lights a wide pool. Mana overflows onto the ground (`drawManaPools`, drawn on the ground layer under every figure, additive): a pool in the caster's colour wells out from the feet, spreading to `MANA_POOL_RADIUS` (19px, squashed 0.45 for the floor) over `MANA_POOL_SPREAD` (0.7s) and draining over the channel's last `MANA_POOL_DRAIN` (0.45s), both through `manaPoolLevel`. Its edge wobbles and keeps spilling out in slow lobes, with a bright rim, a glowing heart, a soft outer bleed, ripples running out from the centre and glints twinkling on it. `Vfx.manaPool` bubbles motes up off its surface and flicks the odd droplet up out of it, and a ground light in the caster's colour lights it in dark rooms. Out of it the mana spirals up around the caster (`drawManaSwirls`): three glowing ribbons orbiting the body, each a helix rising `MANA_SWIRL_HEIGHT` (34px) from the pool's rim over `MANA_SWIRL_TURNS` (1.3) turns, narrowing and fading as it climbs, with bright pulses running up it. For depth each ribbon is drawn in two halves: the arcs on the far side of the orbit on the ground layer behind the figure, the near arcs in the glow pass in front of it.

**The Bow's shortbow** (`drawPlayerShortbow`) takes two inputs. `draw` (0..1) is how far it has raised and drawn for the next shot; the renderer's `bowDraw` sets it. It is held at full draw through a volley and drawn up over the last 0.32s of the reload when there's a target.
- **Rest:** relaxed, with the bow lowered and tilted and an arrow nocked on a slack string.
- **Each arrow:** `release` (the attack value, 0.24s, linear) snaps the string forward with a shiver and flicks the draw hand back. A new arrow is nocked and pulled straight back.
- **After the volley's last arrow:** the bow stays up through the follow-through, then lowers.

The limbs flex as the string is drawn. It layers like the Blade: sleeves, then the mantle, then the bow and arrow, then the fists. Fivefold Volley only changes the volley size (5 arrows), not the art.

**The Bow's Longbow** (`drawPlayerLongbow`, the Bow's Longbow node, shape `player-longbow`). A gently bent D about as tall as the archer (`LB_LIMB` 13 per limb), thick at the grip and tapering to pale horn nocks, with the grip wrapped in the adventurer's **accent** colour. Its arrow is long (`LB_ARROW` 19) with broad fletching and a bodkin point. Every pose comes from one pure function, `longbowPose(release, draw, castAnim)`, which the renderer's glow pass also reads (`longbowArrow`) so the kindled arrow lines up with the sprite.
- **Rest:** lowered beside the body, upright, lower tip near the ground, **no arrow nocked** (the long arrow jutting past a lowered bow read as aiming).
- **Draw:** the charge (`draw`, 24 steps, `LONGBOW_DRAW_TIME` 0.85s). The bow rises upright over the first ~quarter, then the string is hauled slowly back to the jaw and held for the last tenth. The draw elbow folds back as it comes in. The body leans back into the draw and trembles at full draw. At full draw the point sits at ~(15, -7), the engine's `LONGBOW_MUZZLE` at board scale.
- **Loose:** the release (`attackAnimTime` 0.5s, linear): the string snaps forward with a shiver, the draw hand flicks back past the ear, the bow stays up through the follow-through, then lowers. The body rocks back slightly instead of lunging.
- **Arrows in flight** are the plain arrow at 1.5× scale.
- **Piercing Shot cast** (`PIERCING_CAST_ANIM_TIME` 0.6s, a signature move on `specialAnim`): the bow is raised with a half-drawn arrow aimed at the sky, held, then lowered (`longbowCastLevel`). The body stretches tall. `drawLongbowGlows` kindles the arrow in the archer's colour, a glow down the shaft with a flaring, turning four-point star at the point. `Vfx`'s `piercingShot` cast adds a cinching ring, a ground ring, motes streaming up and an arcane light pulse, all tinted.
- **Piercing arrows nocked:** the arrow on the string keeps a soft pulsing glow and one glowing diamond pip per remaining arrow floats above the head. In flight a piercing arrow (`drawPiercingArrow`) is a blazing streak and halo in the archer's colour with a white-hot point, an arcane sparkle trail and a tinted light; each foe it passes through takes a burst in that colour.

**The Blade's dual short swords** (`drawDualShortSwords`) pose their own arms from keyframes (`BladePose`: hand point, blade angle, elbow bend).
- **Rest:** a ready guard, with the lead blade raised forward and the off blade held low and forward.
- **Strike:** a three-beat swing (`swingPose`), read as `u = 1 - anim`. The lead blade winds up over the shoulder and chops down through the target, and the off blade rips back up across it a beat later.

The layers go sleeves → mantle/scarf → swords → fists, off side before lead side.
- The mantle still covers the shoulders and upper arms.
- Each blade sits in front of its own forearm and over the mantle.
- Only the fist closes over the grip.

The wind-up hand rises beside the head, not over it, since the head is drawn after the arms and would hide it. The swing runs `attackAnimTime('player-blade')` (0.3s, longer than other champions' 0.18s) so it reads. It is driven linearly, not eased, so its two cuts line up with the engine's two half-damage hits. The lead chop lands as the attack fires, and the off-hand cut lands `BLADE_SECOND_HIT_DELAY` (0.13s) later. Retime both together. The tip streaks come from `drawBladeTrails`, which the renderer calls straight after the figure, outside the compositor, so they stay clean light rather than inked shapes.

**Signature moves** play from `Tower.specialAnim` over their own time (`specialAnimTime`), reach the sprite as the `throwing`/`special` flag, and use 24 cached anim steps instead of 12. Each lands its blow `*_HIT_DELAY` into the move, matched to the sprite's cut window, so retime the two together.
- **Cross Slash** (the Blade's every-third-attack node, `CROSS_SLASH_ANIM_TIME` 0.5s, hit at 0.19s). It runs on `signaturePose`: guard → coil (reached a little early and held) → cut → held follow-through → guard. The coil spreads the blades wide: the lead is raised high with its blade laid back over the head, and the off blade drops low behind. A gleam swells on the lead blade (`drawGleam`). Both blades then cut at once over one shared window. The tip-path trails of that double swing would draw a circle, not an X, so the cross draws its own trail instead: `drawCrossStreaks`, two straight tapered cuts that wipe across the space ahead ("\" for the lead's chop, "/" for the off blade's rip) and cross at chest height. The body settles back into the coil, then lunges through the cut.
- **The Claymore** (`drawClaymore`, the Blade's Claymore node, shape `player-claymore`). A two-handed great sword about twice a short sword's length, with a long wrapped grip, heavy brass-capped pommel, wide knobbed crossguard, ricasso, broad fullered blade and a lit edge (`drawClaymoreBlade`). Both hands share the grip, the lead hand under the guard and the back hand `CLAY_GRIP_GAP` down. Its layers go sleeves → mantle → blade → fists (far, then near). It is posed from `ClaymorePose` keyframes:
  - **Rest:** a high guard, with the blade raised forward.
  - **Heft:** the wind-up, driven by the charge (`draw`, 24 steps, `CLAYMORE_WINDUP_TIME` 0.34s). It goes through a lift keyframe, with the blade upright in front of the face, before the hands climb beside the head and the blade tips back over it. Going straight from rest to heft swept the blade behind the head, so it seemed to sprout from it. The body leans back and sinks while it hefts.
  - **Cleave:** the release (`attackAnimTime` 0.42s, linear). The blade comes over the top and down through the arc ahead into a low follow-through, then lifts back to guard. The lunge carries further than other champions' (6.5px).
  - **Earthsplitter slam** (`EARTHSPLITTER_ANIM_TIME` 1.05s, impact at 0.6s): hoisted straight up, then drawn further back over the head and held, trembling, while the blade kindles (molten glow along the edge, a flaring point, embers; `drawClaymoreKindle`) and the crack's coming path smoulders on the floor (`drawSlamTelegraphs`). Then an accelerating fall that drives the point into the ground ahead. The tip deliberately runs past the figure box, so it reads as buried. It holds a beat, then is wrenched free. The body stretches tall on the hoist and crouches into the impact.
  - **Smear:** `drawClaymoreTrails` replaces the thin streak with a broad band between the blade's middle and its point, densest at the blade, with a bright edge on the point's path.

### Armor icons — `engine/armorArt.ts`
Armor is stat-boosting equipment: it is **never drawn on the adventurer** (the figure looks the same with or without it). It appears only as item icons: the helm (with the set's plume), the cuirass (breastplate, gorget, pauldrons and the set's cloth tabard), the leg piece (cuisses, greaves, knee cops and tassets) and the sabatons. Each is authored in figure space with flat fills, like a sprite part.
- **A set's shape comes from its `style`, its metal from rarity** (`FINISH`, built from `MATERIAL`/`LIGHT`): Common is dull iron with leather trim; Rare is polished steel with a frost gem; Epic is blackened steel with gold trim and an arcane gem; Legendary is gilded plate with pale-gold trim and a blood-red gem. The set's `cloth` colours the plume and tabard (Kingsguard: the castle's crimson `#9a2a33`).
- **Icons go through the compositor.** `drawArmorIcon` draws one piece (the helmet's face opening shows dark padding; boots and greaves stand close together), framed by `ARMOR_ICON_BOX`, and the UI's `ArmorIcon` finishes it through the figure compositor like a portrait.
- **UI.** The Armory is a paper doll: the four slot sockets flank the adventurer (holding their class weapon, without the armor drawn on), and a full set adds a warm halo behind them. Rarity frames read `--rarity`, and drops get a rarity-tinted toast over the board (with the rolled stats beneath the name). Each inventory tile carries one rarity-coloured pip per rolled stat; the detail panel shows every rolled value with a slim bar for where it landed in its rarity's range, plus the range itself.

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
Darkness, light family, weather, fog, grade, vignette and sun are pure data. Named presets live in `MOODS` (`goldenDusk`, `feastHall`, `moonlitHall`, `violetChamber`, `crimsonThrone`, `brightMidday`, plus spare presets for new stages such as `springDawn`, `autumnGlade`, `mistyMarsh`, `moonlitNight`, `frozenPass`, `arcaneSanctum`, `sacredChapel`, `emberForge`, `ashenRuins`, `hauntedCrypt`, `bloodMoon`); a stage picks one with `mood: '<name>'` in its `LevelSpec` beside `path`/`theme`/`decor` (the Level Designer exports that line). A stage without `mood` falls back to its chapter's `SECTION_MOODS` entry:

| Chapter | Mood |
|---|---|
| Castle | Torchlit stone: fire light, dust, a warm amber grade, heavy vignette (darkness 0.42). Castle Door is a gold-lit dusk courtyard; the Throne Room is a torchlit crimson hall. |
| Capital | Bright city: window light, drifting petals, a low warm sun, light vignette (darkness 0.14). |
| Forest | Moonlit: fireflies, green fog and grade, heavy vignette. |
| Inn | Candlelit interior: dust, a warm orange grade. |

### VFX — `engine/vfx.ts`
The engine emits cosmetic `fx` events: `hit`, `kill`, `blast`, `cast`, `crossSlash`, `cleave`, `fissure`, `dodge`, `breach`, `deploy` and `bossSpawn`. They are the visual twin of `sfx`. `Vfx` turns them into:
- particles (pooled, capped at 900);
- rings, flashes, slash crescents and light pulses;
- Cross Slash X marks, Claymore cleave arcs and Earthsplitter fissures;
- exposure lifts and hit recoil;
- corpses;
- screen shake, used only when a boss spawns, for the Earthsplitter's slam and for a Greater Orb crashing down (both lighter), and off under `prefers-reduced-motion`.

Effects pick a `LIGHT` family for their colour. Ground marks (the fissures) are a decal pass, `Vfx.drawDecals`, drawn straight after the baked ground so every figure stands on top of them.

**The Blade's signature hits:**
- **Cross Slash X** (`crossSlash`): two tapered diagonal cuts wipe in over the foe one after the other, a colour edge under a white core, then thin and fade. The X is screen-aligned, never rotated to the blow, because a rotated X read as a "+" on vertical paths. Which cut leads mirrors with the blow's side, matching the hero's swing. Sparks fly both ways along both cuts. The flash stays small (26px) so it doesn't wash the X out.
- **Claymore cleave** (`cleave`): drawn at a fixed radius (`CLAYMORE_CLEAVE_FX_RADIUS` 70px, or the range if shorter) so range boosts never push it away from the blade. A broad crescent band in the hero's colour whose leading edge sweeps across the cleaved arc. It always enters from the arc's upper side, like the overhead swing, with a bright rim and dust kicked up from the floor beneath.
- **Earthsplitter fissure** (`fissure`): a jagged crack runs out over 0.2s with side cracks. It is drawn as a soft dark scorch, a pale broken lip and a dark channel (the decal), plus a molten ember-orange glow inside for its first 0.6s (deep orange, not yellow-white, so it reads as broken earth rather than lightning). Rock, dust and smoke are thrown up along it, with a shock ring at the root and fire-family light pulses along it. The decal fades over its last 40% (1.8s life).

**Mana Ray** (`drawBeams` in `renderer.ts`, particles from `Vfx.beam`) follows a lifecycle from `beamPhase`. It lances out over 0.16s, swells briefly on each damage tick, and collapses to a thread over the last 0.3s. Its look has several layers:
- a squashed, rotating sigil disc at the caster's thrust-out palms (`beamOrigin`), like a portal the ray is fired through;
- a tapered, rippling ribbon body with deep edges, a pale body and a white core;
- two helix strands and energy packets running outward;
- a crackling flare where the beam ends.

Only the outer haze is additive. The body is normal-blend so it keeps its colour on bright floors, and its lights use a low `glow` for the same reason.

**The Greater Orb's effects** (all in the caster's colour): `cast` `leap` and `land` are dust puffs and a faint ground ring at the feet on take-off and touchdown; `cast` `greaterOrb` is a flash, an outward ring and sparks shed downward where the orb leaves the raised hands. Its `blast` carries `heavy`: on top of the normal burst, a white-hot core, a slower outer shock ring rolling along the floor, sparks thrown upward, dust kicked out from the rim and a light shake. Its charging light sits overhead and lights a wider pool once the orb kindles.

**The Staff's mana bolts** (`style: 'mana'`, `drawManaBolt`): a long crystalline shard in the caster's colour (soft halo, coloured body, pale lit facet, white-hot point) rotated to its own heading, streaking a `drawMagicTrail` whose core is a light tint of the caster's colour rather than the Elf's pale violet, plus `arcane` trail motes and a small coloured light. Each volley fans three bolts out upward (leaned toward the aim) so they arc wide before curving in; they leave the crystal one after another, `STAFF_BOLT_STAGGER` (0.07s) apart, the middle one first. Each lands with a small coloured burst. The Mana Storm's bolts (`Projectile.rain`, drawn the same at 0.9×) climb straight up off the hoisted crystal, tip over high above and fall straight down onto their foe (a cubic curve over about a second). Its cast (`manaStorm` in `Vfx`) is a ring cinching in on the caster, a faint ground ring out to its reach, motes and shards flung skyward and a light pulse, all in the caster's colour.

**Caster-coloured magic.** The Magic adventurer's orb (charge, flight, blast), its hits and kills, and the Mana Ray all use the player's outfit colour instead of the fixed arcane violet. `tintRamp(color)` in `palette.ts` builds a MAGIC-shaped ramp from that colour. The engine tags its `hit`/`kill`/`blast` events with `tint` (`fxTintFor`). `Light.tint` and the `Vfx.pulse` tint replace a light family's glow colour.

**Buff auras on champions** are drawn in `renderer.ts` around the figure, not as `fx` events. Each one reads as its own shape and colour:
- **Better Morale:** a gold ground glow.
- **Bard tune:** music notes circling the head.
- **Quickdraw:** the foot ring flares. `drawQuickdraws` adds a pulsing glow on the bow and speed streaks peeling back off the figure, all in the archer's colour. `Vfx.quickdraw` adds rising motes. Arrows loosed meanwhile fly as glowing bolts (`drawQuickdrawStreak` plus a sparkle trail). Everything fades with `quickdrawLevel`.
- **Guiding Gale** (`drawGale`): wind-family ribbons spiral up from the feet past the head over a ground swirl. Each orbit is split by depth, with a `back` layer before the figure and a `front` layer after it, so the wind wraps the body. It also adds a faint `wind` light so it shows in dark rooms. An aura that wraps a figure should use the same back/front split.

### Props — `engine/props.ts`
- Each prop kind has a `PROP_ART` entry: an origin, a shadow, a `body` cached through the compositor with a quiet ink, and an animated `live` overlay for flames or water.
- Each also has a `PROP_META` entry: draw layer, `bounds`, base depth line, `occludes`, lights, flames and chimneys.
- **When you redraw a prop, update its `bounds` too.** They size the compositor box and the occlusion test.
- **`burningCastle`** is the sacked twin of `castle` (same 3×3 footprint and silhouette, for the Capital escape). The right tower's top has collapsed into a burning shell, with its back wall standing higher than its front lip. The left tower's slate roof is burnt through to its rafters. The keep's upper window is blown out into a breach, the crenels are chipped or missing, the banners are charred rags on snapped poles, and the portcullis is half-raised and buckled over the blaze behind the gate. Rubble and a fallen beam spill from the tower. Stone is dulled by a smoke overlay (`source-atop`), every opening has a soot plume, and the fire glow pulses in the `live` pass alongside the flames. Its `PROP_META` carries strong fire lights, ember/smoke `flames` emitters and two smoke columns.

---

## 6. Sound effects

All SFX are **synthesized placeholders** built from Web Audio primitives. Every sound routes through `ui/audioBus.ts`:

```
source → category gain (ui | combat | music) → master → speakers
```

The Settings sliders map onto those gains.

- **Interface** (`introAudio.ts`, `summonAudio.ts`): soft paper, quill and chime cues.
- **Home desk** (`deskAudio.ts`): choosing the map plays `map` (a soft parchment slide, ~1.3s, as the lean over it begins); choosing the orb plays `orb` (a rising airy whirl with two slowly beating glass voices and a climbing shimmer, ending on a high ring as the altar opens). Coming back, `mapClose` draws the slide back down and `orbClose` winds the whirl down with the orb's spin-down. The journal uses the intro's `open` cue.
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
  - The Bard's `bardPlay` is a short, unhurried lute phrase built from the `pluck` primitive (detuned saw + triangle through a snapping lowpass): three notes 0.2s apart from a random `BARD_PHRASES` motif in a random major key from `BARD_ROOTS`, and nothing after (a closing strum was tried and removed). Keep it sparse and soft — denser runs felt overwhelming.
  - The Blade's `crossSlash` is two crossing noise swishes 35ms apart (one rising, one falling, via `noiseSweep`'s `delay`), a triangle thud and a short, quiet two-partial sine "shing" off the crossed blades.
  - The Claymore's `claymoreSwing` is a long, low descending noise whoosh. `claymoreHit` is a deep triangle thud with a lowpassed crunch, played once per swing however many foes it cleaves.
  - `earthsplitterRise` (on cast) is a swelling low rumble with a rising, straining grind under the wind-up. `earthsplitter` is a sub sine boom, a rolling lowpassed rumble and bandpassed gravel crumbling just after.
  - The Longbow's `longbowDraw` is a quiet, slow creak of the stave (a narrow bandpass sweep plus a low triangle) as each draw begins. `longbowShot` is a deeper, heavier thwump than the shortbow's twang; `longbowHit` a solid triangle thunk (throttled like an AoE hit, since a piercing arrow strikes several foes).
  - Piercing Shot: `pierceCast` is a bright rising shimmer over a taut string pull, with a faint ring held as the arrow is raised; `pierceShot` is a hard crack and long tearing whoosh as each piercing arrow is loosed.
  - The Arcane Staff: its cues are FM voices (`fmZap`: a sine carrier frequency-modulated at an inharmonic ratio whose depth dies away, so a bright metallic attack melts into a pure tail) with a glitter of tiny high pips (`sparkle`), never bandpassed noise plus a plain glide, which reads as a flute. `staffCast` is a warbling FM shimmer swelling up with sparks as the crystal kindles; `staffShot` is three falling FM "pew" zaps 70ms apart (matching the bolt stagger), each with sparks; `staffHit` is a small fiery "whoomp" (modelled on a fire-magic burst, squeezed to ~0.25s): a soft highpassed click as the point bites, then lowpassed noise flaring open to ~1.6kHz and darkening back to a rumble over a low sine dropping from ~165Hz (throttled to 80ms, since three bolts land close together). Its Mana Storm: `manaStorm` is a deep sawtooth swell climbing under an airy rising sweep, with a high sine shimmer ringing on after it; `stormBolt` is one soft rising FM zap with a couple of sparks per bolt (throttled to 80ms).
  - The Greater Orb: `greaterOrbCast` (replacing `orbCast`) is a soft lowpassed whump as the feet leave the floor, then a deeper, longer rising sine swell with an airy sweep and a faint high shimmer as the orb gathers. `greaterOrbThrow` is a heavy descending whoosh as it is hurled down. `greaterOrbBurst` (replacing `orbBurst`) is a sub sine boom, a triangle thud, a long rolling lowpassed rumble and a bandpassed crackle.

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
| `capital` — *Hunted by the Crown* | Capital battles | The king has fallen and the royal army gives chase. 150 BPM, C minor. Progression Cm–Cm–A♭–B♭–Cm–D♭–Fm–G (the D♭ Neapolitan lurch, a G-major dominant pulling back to C). Restless sixteenth-note low-string ostinato, the city's alarm bells tolling every other bar. **Build phase:** a timpani heartbeat, the pursuers' snare cadence drawing nearer (crescendo across each phrase) and their fanfare in the distance. **During a wave:** running war drums (a 3-3-2 stumble, then straight), the snare cadence at full cry, offbeat brass stabs and a crash each phrase. Two horn lines: the army's low, clipped *royal fanfare* (loops 1 and 3) and the rebels' call (loop 2), which opens on the castle's horn call moved to C minor. On loop 4 both play at once, the army right behind. A harmonic-minor string run leads into each phrase. Reverb 0.26. |

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
| Forest | Mysterious and pulsing. Low drums, a modal flute, string drones. |
| Inn | Folkish and rowdy. A 6/8 jig feel with plucked lute-like voices and hand drums. |
