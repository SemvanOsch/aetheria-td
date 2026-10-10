import { createPortal } from 'react-dom';
import { Icon } from './Icon';

interface Props {
  onClose: () => void;
}

interface PatchEntry {
  /** Version or date label shown as the entry heading. */
  version: string;
  /** Short list of changes in this release. */
  changes: string[];
}

/**
 * Changelog shown in the Patch Notes modal (next to the Settings icon).
 *
 * IMPORTANT: Prepend a new entry here whenever you push to GitHub — the newest
 * release goes first so it renders at the top of the list. See CLAUDE.md.
 */
const PATCH_NOTES: PatchEntry[] = [
  {
    version: '2026-10-10 · Flight from the Capital',
    changes: [
      'Four new Capital stages: Market Square, The Outskirts, The Sewers and The Getaway. The Sewers and The Getaway are still being built: for now they have placeholder waves and no boss yet.',
      'Market Square: the royal army closes in across the town square at blue hour, with ash from the burning castle drifting over the roofs. The road wraps the square on three sides, around a fountain, a clock-towered guildhall, a bakery, a tavern and a market.',
      'The Outskirts is drowned in mist: every champion has 30% less range unless it stands near a lit lantern. Click a dark lantern post to light it for 50 gold. It clears the mist within 2.5 tiles and shows a warm ring of its reach when you hover it. Champions whose range the mist is cutting show “Lost in the Mist” on their stats.',
      'The Sewers: wade through brick tunnels along a channel of murky water. From wave 3 a new channel opens out of the cistern and joins the main one.',
      'The Getaway: out of the sewers at dawn, down the riverbank to the wagon waiting for you. Winning it plays a cutscene: your champions sprint for the wagon and leap in, it gallops off the board, and a whole day passes on the ride (farmland, meadow, the old forest, the Capital burning far behind) until you stop at an inn at the forest’s edge. Skip it with the Skip button, Escape, Enter or Space. The ride has its own music, Flight from the Capital.',
      'New foe, the Man-at-Arms, now a Capital soldier in full plate: his tower shield blocks the first 5 hits completely, however big they are, and only then does he take damage. His remaining shield shows as pips over his health bar. (He no longer appears in the Castle.)',
      'New foe, the Bloodhound: a very fast tracking hound. Inside a lit lantern’s light it loses your scent and slows to a crawl.',
      'New boss, the Sergeant-at-Arms (Market Square): his shield blocks the first 15 hits, and every 6 seconds he stops to raise the royal standard, giving every other foe on the board 3 more shield points.',
      'New boss, the Hound Master (The Outskirts): every 5 seconds he blows his whistle and 3 Bloodhounds burst out at his side.',
      'Field notes: the first time you record a new foe in a battle, a note pops up beside the board. Click it to pause and read its bestiary page. Foes are now recorded in the bestiary after 1 kill instead of 100.',
      'Winning a stage now gives every champion in your team 5 EXP per wave of the stage, deployed or not.',
      'Farmers now earn 1 EXP per 5 gold harvested (was 10). Better Soil and Fresh Food now cost 250 EXP (was 100).',
      'The Kingsguard set bonus (Oath of the Crown) is now +15% range only; it no longer gives +10% damage.',
      'Once you clear every Castle stage, the castle seen through the window on the home desk smoulders with a few small fires.',
      'Lots of new props, all in the Level Designer too: town square buildings and street furniture, outskirts hovels, wall towers and lantern posts, sewer walls, arches and pipes, a river, an escape wagon, a camp and pine trees. There is a new sewer path material, and paths may now end at a sewer entrance or the escape wagon.',
      'New stage moods for the Capital: dusk in town, misty outskirts, the sewer depths and a rose-gold dawn by the river.',
      'New sounds for shield blocks and breaks, the rally, lighting a lantern and the Hound Master’s whistle.',
      'Fixed a faint crackle in the Capital battle theme and other sounds.',
      'The Inn chapter now comes before the Forest on the chapter list.',
      'Garrick Vane’s and the Iron Warden’s bestiary descriptions are shorter.',
      'Settings → Developer: a new Reset field notes button wipes all foe kills so the field notes pop up again.',
    ],
  },
  {
    version: '2026-10-07 · Arcane Staff & The Capital',
    changes: [
      'Magic: Arcane Staff. A new rival style to Greater Orb (500 EXP). Your adventurer takes up a crystal-tipped staff, raises it for each cast and fires three mana bolts (9 damage each). The bolts fan out upward, then curve in on a different enemy in range each; if there are fewer enemies than bolts, the extra bolts hit again. Its in-stage levels are Arcane Tempo and Arcane Force.',
      'New ability, Arcane Storm (Arcane Staff): hold the staff overhead for 5 seconds and fire mana bolts at 2.5× your attack speed. Each bolt arcs up and falls on a random enemy in range (40 mana, 16s cooldown). Mana pools at your feet and spirals up around you while it lasts. It has its own animations, effects and sounds.',
      'The Capital chapter is open. Its first stage, Castle Door, is now Escape: the castle burns behind you and you have to fight your way out through seven tougher waves of guards, rangers and mages.',
      'New boss: Captain Roland replaces Thornmaw the Ancient. He’s a fast mounted knight with golden hair, riding a warhorse in Squadron 8 colours with his lance couched.',
      'New prop: the Burning Castle, a sacked version of the castle with a collapsed tower, charred banners, flames and smoke. It is also in the Level Designer.',
      'New battle music for the Capital, Hunted by the Crown: a fast, tense chase with alarm bells, pursuing drums and two rival horn calls.',
      'Balance: Earthsplitter now costs 30 mana (was 35), has a 14s cooldown (was 16) and knocks enemies back much further. Quickdraw’s cooldown goes from 15s to 21s, and Mana Ray’s from 14s to 18s.',
      'Armor bonuses no longer apply while your adventurer’s mastery is switched off.',
      'Garrick Vane’s description now correctly says he dodges a fifth of all hits.',
      'Greater Orb and some level descriptions are shorter. The journal champion page no longer shows the champion’s description, and its buttons are arranged in a neat two-column grid.',
      'Champion stats show “3 mana bolts” for the Staff, and the developer champion stats page lists the Staff form. There is a new developer stage sheet (#stages) that lists every stage’s waves.',
    ],
  },
  {
    version: '2026-10-07 · Fighting Styles',
    changes: [
      'Adventurer skill trees now branch after Ironclad into rival fighting styles (500 EXP each). You can learn both, but only the one you pick is active; switch any time with Activate path. Paths you have switched off are drawn dimmed in the tree, and learned nodes no longer show an Active/Learned label.',
      'Blade: Cross Slash. Every third attack, both swords cross in one X-shaped cut for 1.8× damage. If its target dies first, the cut moves to the nearest foe in reach.',
      'Blade: Claymore. Trade the dual swords for a giant two-handed claymore: slow, heavy swings (26 damage, 0.5 attacks/s) that cleave every foe in a 100° arc in front. It has its own in-stage levels (Sharper Blade, Longer Edge) and a new ability, Earthsplitter: the claymore slams down and opens a fissure out to twice your range, hitting everything along it for 2.25× damage and knocking survivors back (35 mana, 16s cooldown). A glowing crack shows where it will strike during the wind-up.',
      'Bow: Fourfold Volley. Each burst fires four arrows instead of three.',
      'Bow: Longbow. Trade the shortbow for a longbow: slow, full draws loosing one heavy arrow (36 damage) from an enormous 230 range. Its own in-stage levels are Heavy Draw and Longer Reach, and its ability is Piercing Shot: your next 3 arrows fly to the end of your range and hit every foe along the way (30 mana, 16s cooldown).',
      'Magic: Greater Orb. Your hero leaps up, gathers a huge orb overhead and hurls it down. Casting is 40% slower, but the orb deals +70% damage with a 30% wider blast.',
      'Each new style has its own animations, effects and sounds, and your adventurer holds the new weapon on the journal page, the Armory and every champion card.',
      'Damaging abilities (Cyclone Slash, Mana Ray, Earthsplitter) can only be cast with an enemy in reach, and aim at the nearest one if your target is out of reach. Without one, the button dims and pressing it tells you no enemies are in range, without using any mana or cooldown.',
      'New round medallion icons for every hero ability, including Earthsplitter.',
      'Champion stats show Cross Slash when it is active, and the Claymore’s damage reads “per enemy in arc”.',
      'Flourishing Blades (Blade adventurer’s second in-stage level) now gives +5 damage instead of +6. Ability and level descriptions are reworded and shorter.',
      'Developer champion stats page: the Claymore and Longbow forms are listed, and clicking a champion opens a full breakdown page.',
    ],
  },
  {
    version: '2026-10-06 · Armor & Hero Polish',
    changes: [
      'Armor for your adventurer: a helmet, chestplate, leg piece and boots in Common, Rare, Epic or Legendary. Bosses in endless runs have a 50% chance to drop a piece of their chapter’s set (the Castle’s Kingsguard); campaign bosses never drop armor. A toast shows each piece as it drops, and the result card lists everything you found.',
      'Every armor piece rolls its own random stats: 2 on Common and Rare, 3 on Epic and Legendary, with bigger values at higher rarities. Stats include damage, attack speed, range, crit chance, crit damage, max mana, mana regen and ability cooldown. Wearing all four Kingsguard pieces adds Oath of the Crown (+10% damage, +15% range).',
      'The new Armory (Armor button on your adventurer’s journal page, or from their champion sheet) shows your adventurer surrounded by the four slots. Equip and unequip pieces, filter by slot, see where each roll landed in its range, and salvage unworn pieces for gems (5 / 15 / 40 / 100 by rarity). Armor isn’t drawn on your adventurer; it appears only as item icons.',
      'Adventurer skill trees reworked for all three classes: Honed Will (+10% damage), Hero’s Instinct (+10% in-stage EXP, so your hero levels up faster in battle) and Ironclad, the major node, which unlocks armor. Until you learn Ironclad, the armor slots show as locked. If you already owned the old second node, it carries over to Hero’s Instinct.',
      'Pause menu: press Esc (with nothing selected) or the new pause button to freeze the battle. It has the volume sliders, an Auto-start waves switch that starts the next wave as soon as one is cleared, and a button to leave the stage or end an endless run.',
      'Bard tune switch: silence the Bard’s lute tune from his champion sheet or from a small switch on his in-stage panel.',
      'Drag a champion from the journal roster onto your company to add it, either into an empty slot or replacing a member.',
      'Blade adventurer: each attack is now a two-blade combo. The lead sword chops down, then the off-hand blade cuts back up a moment later, each for half damage with its own crit roll. There’s a new wind-up and swing animation with blade trails. The in-stage levels are renamed Sharper Blades and Flourishing Blades.',
      'Bow adventurer: a new shortbow animation. The bow rests lowered, rises and draws for each shot, snaps on release and stays up through a volley. Quickdraw now makes the bow glow, adds speed streaks and rising motes, and arrows fly as glowing bolts while it lasts.',
      'Magic adventurer: a new two-handed cast. The hands gather and cradle the orb as it grows, then thrust it forward. Its orb, hits, kills and Mana Ray now glow in your outfit colour. The Mana Ray is redrawn with a sigil at the palms, a rippling beam, helix strands and a crackling flare where it ends. Mana Ray now hits every 0.4s instead of 0.5s, and Dense Core gives +8 damage instead of +9.',
      'Champion stats now show Crit rate and Crit damage as separate tiles, and Mana shows any regen per second.',
      'The screen now shakes only when a boss appears.',
      'The Castle Door no longer has the two banners by the castle.',
      'Settings → Developer is now a grid of tool cards, with an Armor forge (roll any piece) and a Hero class switch.',
    ],
  },
  {
    version: '2026-10-05 · Endless Mode',
    changes: [
      'Endless mode is here: clear every stage of a chapter to unlock its endless run (Play → Endless). Each run fields only that chapter’s foes, with tougher ones joining in later waves, in randomly rolled waves that keep growing and get sturdier the longer you last.',
      'Every 5th endless wave brings a boss — the chapter’s stage bosses in order, looping with more health each lap. Clearing a boss wave pays 50 gems on the spot, and you keep them however the run ends.',
      'The endless picker shows each chapter’s run with a board preview, your best record, the foes it fields and from which wave, the boss rotation and your team. In battle the HUD shows gems earned and how far off the next boss is; "End run" (click twice to confirm) ends a run on your terms, and the result screen shows waves held, gems won and whether you set a new best.',
      'Bard skill tree: Lively Tempo (+5% to his attack-speed buff), Carrying Voice (+10% range) and Lingering Melody (his tune lasts 2 seconds longer). His cards, stat sheet and in-stage panel all show the upgraded numbers.',
      'The Bard now strikes up a short lute phrase — three soft plucked notes from a random tune in a random key — instead of the same rolled chord every time, and his tune no longer draws a ring on the ground.',
      'Crits are calmer: the CRIT! popup is smaller, the extra gold damage number is gone, and critical hits and kills no longer shake the screen.',
      'Where enemy paths meet or share a corridor, the ground now paints them as one clean path (no darker overlaps or doubled trim), and the moving arrow trail is drawn once along shared stretches.',
      'The HUD’s gold, wave and foe counters keep a fixed width, so the bar no longer jumps when a number gains a digit.',
      'Stage moods are now named presets (golden dusk, feast hall, moonlit hall and more), with a dozen new ones ready for future stages: spring dawn, autumn glade, misty marsh, frozen pass, arcane sanctum, blood moon and others. The Castle Door now uses bright midday and the Capital’s gate golden dusk.',
      'Level Designer: edit every enemy path (a tab per path; clicking onto another path merges into it so both reach the same castle), with Undo, start from any stage or endless map, preview every mood preset, and export the mood and endless-map code too.',
      'Sergeants now deal 1 damage to your castle instead of 2.',
      'Fixed the Summon screen’s collection counter counting champions that can’t be summoned.',
    ],
  },
  {
    version: '2026-10-03 · The Journal Hub',
    changes: [
      'The Adventurer’s Journal is now home to your champions and the bestiary. Three silk bookmarks along the top of the book switch between your own pages (identification and lore, named after you), Champions and the Bestiary, and a gold dot on a bookmark shows when something new is waiting.',
      'Champions, redrawn as journal pages: the selected champion sits in an arched plate with its traits, description and a handwritten ledger of its battle stats, plus buttons to enlist it, open its skill tree or read its full record. The facing page holds your company (drag to reorder, × to remove) and the roster, nine to a page, with wax seals on team members and sepia sketches for champions you haven’t recruited yet.',
      'The Bestiary moves into the journal too: foes and bosses on their own tabs, undiscovered foes as dark silhouettes with an unlock bar, and each recorded foe written up as field notes with its numbers, resistances, its special trick and its lore.',
      'The home screen’s Champions and Bestiary tiles are gone, leaving Summon and the Journal side by side. The top bar’s Champions tab and the campaign’s Edit team button now open the journal on the Champions bookmark.',
      'Revamped Level Designer (Settings → Developer): a live preview drawn exactly like the real battle board (lighting, weather, flickering props), start from any existing stage, four tool panels (Path, Props, Ground, Mood), hover previews that show whether a prop fits, floor and path materials and colours, a preview of any stage’s mood, smarter warnings, and exported code that includes the floor and path materials.',
      'Bard: his tune now lasts 6 seconds instead of 8.',
      'The Bow hero’s second level is now called Stronger String, and many champion, ability and skill-tree descriptions were tightened up.',
    ],
  },
  {
    version: '2026-10-03 · The Great Revamp',
    changes: [
      'A full visual overhaul of the battle board: painted stone, wood and grass floors with worn paths, real-time lighting (torches, candles, windows and moonlight pooling in dark rooms), a mood of its own for every stage, depth-sorted props that fade when a figure walks behind them, and new effects — sparks, slash arcs, impact rings, corpses, screen shake (off with reduced motion) and soft cast shadows.',
      'Every champion and enemy has been redrawn with proper bodies — jointed legs and knees, shoulders, elbows, hands, capes — plus shading, rim light and a crisp outline, so each archetype has its own build: broad tanks, lean rangers, robed casters.',
      'Gowzer, the Night Falcon (stage 4) is reborn: a hooded assassin in midnight cloth with a bronze falcon mask, glowing gold eyes, a gold-tipped feather mantle and twin talon daggers. He now stalks forward in a crouch, twirls a dagger while delivering his lines, and bursts into drifting feathers as the shadows swallow him.',
      'The Wizard’s Guiding Gale now spirals soft wind ribbons up around the champions it empowers, wrapping behind and in front of them, with a faint swirl at their feet.',
      'New look across every menu: a living night-sky backdrop (softly blurred so menus stand out), hand-drawn icons instead of emoji, new fonts, gilded panels and an Aetheria crest.',
      'New home screen: your adventurer front and centre with their stats, a Continue button that drops you straight into your next stage, live shortcut tiles (Summon, Champions, Journal, Bestiary — with a red dot when something is ready), and campaign progress per chapter.',
      'New Campaign screen: chapter tabs, a winding map of the chapter’s stages (cleared ones light the road gold), and a briefing panel for the selected stage with a preview of its battlefield, waves, castle health, gold and gem reward, its boss (a dark silhouette until you’ve beaten it), the enemies you’ll face (marked New if you haven’t met them) and your team. Locked stages can’t be selected, and a back button returns to the mode picker.',
      'Redesigned champion details: a large portrait in the champion’s rarity glow, a battle profile of stat tiles, and its levels with stat gains in green and ability tiers highlighted in gold.',
      'Redesigned mastery skill tree: nodes on a map linked by lines that light up gold as you learn them, capstones as diamonds, and a side panel to inspect and learn each node plus a running list of your total bonuses.',
      'The summon ceremony is now animated with swirling energy, a flash and a silhouette reveal. The result now shows the champion with its rarity, name and note fading in underneath — no extra card and no Again button (just press Summon again) — with gentler embers.',
      'Background music: a calm menu theme, and a battle theme for the Castle that builds up when a wave starts. It has its own Music volume slider in Settings.',
      'Placing a champion now plays a soft thump and chime, and a dull knock when you can’t place there (both follow the Combat volume).',
      'Fixed the first hit of a battle sometimes playing without sound.',
      'The Adventurer’s Journal has been revamped with a mini contents page and page labels, and your adventurer has far more to customise: eye colour, face markings, many more hairstyles and colours, facial hair, new outfits, an accent colour, headwear and cloaks — each with its own colour. Gear colours are now separate from your outfit, the nose and hood are gone, and hair highlights are softer (no more grey cap on dark hair).',
    ],
  },
  {
    version: '2026-08-30 · The Journal & The Capital',
    changes: [
      'The Adventurer’s Journal now opens with a written Introduction — a first-person diary recounting Aetheria’s golden age, King Kael’s turn to war two years ago, and the night the Voice of the World named you a Hero.',
      'Journal chapters now turn page by page instead of scrolling: when a page fills, the writing pauses, and turning to the next page picks the story back up — with slightly quicker handwriting.',
      'New realm on the world map: The Capital (🏘️) — coming soon while it’s still being built.',
      'The Castle chapter’s description now reads “Fight your way through the castle to get to the king.”',
    ],
  },
  {
    version: '2026-08-29 · Hero Abilities & Mana',
    changes: [
      'Each of your three heroes now unlocks a signature activated ability at their level-3 upgrade (in place of a stat boost): the Blade’s Cyclone Slash — a whirlwind of steel that cuts every foe in range at once; the Bow’s Quickdraw — a burst of blistering attack speed for a few seconds; and the Magic hero’s Mana Ray — a channelled beam, locked where it’s first aimed, that sears everything walking through it while the mage holds it (no orb-casting meanwhile).',
      'Abilities appear as clickable icons in the in-stage champion panel, each with its own art, a radial cooldown countdown, and a mana cost.',
      'New mana system: heroes have a 50 mana pool shown as a bar in their in-stage panel. Casting an ability costs mana, and the only way to refill it is by landing killing blows — every enemy now grants mana on death (shown in the Enemy Index).',
      'Quickdraw stacks with the Bard’s tune (multiplying attack speed) and flares your hero’s coloured foot-outline while active, with its own buff entry.',
      'In-stage stat panel: buffed stats are now colour-coded by category — attack speed blue, damage red, range green, crit yellow, DPS violet — and the little trailing buff icons behind the numbers are gone.',
    ],
  },
  {
    version: '2026-08-29 · The Bard & Buffs',
    changes: [
      'New champion: the Bard, a Common support minstrel who never draws a blade. Every few beats he strikes up a tune that hastens the attack speed of a couple of random nearby champions for a while (never himself) — with his own lute-strumming sprite, a jaunty performance jingle, and in-stage upgrades that widen his reach and add a rousing anthem to rally one more ally.',
      'Buffed champions now float music notes in the Bard’s colour, and the exact stat each buff lifts is highlighted in the in-stage panel — attack speed for the Bard’s tune, damage for the Swordsman’s Better Morale, and range for the Wizard’s Guiding Gale.',
      'New “Active Buffs” button in the in-stage champion panel: expand it to see every buff currently on that champion — the Bard’s haste (with a live countdown), Better Morale, and Guiding Gale (now showing its exact +% range).',
      'The strongest buff always wins — a weaker Bard’s tune never overwrites a stronger one — and Bards now spend each performance on allies they can actually help instead of re-buffing the already well-buffed.',
      'The Wizard’s Guiding Gale now wraps affected champions in a small swirling wind rather than a glow pooled at their feet.',
      'Your adventurer (all three proficiencies) now levels up from in-stage EXP instead of buying upgrades with gold — it earns EXP each cleared wave and levels automatically, shown as an EXP progress bar on its panel.',
      'Your adventurer is now free to deploy — it’s locked to your team and unsellable anyway.',
      'Rebalanced all three of your adventurer’s proficiencies (Blade, Bow, Magic): lower starting damage and retuned, cheaper upgrade tiers.',
    ],
  },
  {
    version: '2026-08-26 · Magic Champion',
    changes: [
      'Magic proficiency: your adventurer is now playable as a staff-less spellcaster. Each attack gathers a slow-charging magic orb — visibly conjured in your character’s own colour between their raised hands — then hurls it to burst on impact, striking every enemy caught in the blast circle. Comes with three in-stage upgrades and its own mastery tree (Focused Will · Raw Power · Arcane Mastery).',
      'New “Circle AoE” attack type with its own on-board indicator: selecting the caster now shows the blast radius around where the orb will land, just like the Line and Cone previews.',
      'The Magic caster’s hands now rest naturally at their sides on cards and while idle, rising to cradle the orb only as it charges.',
    ],
  },
  {
    version: '2026-08-26 · Your Champion',
    changes: [
      'Your adventurer is now a deployable champion of the exclusive new Champion rarity — granted the moment you finish the Journal identification (existing saves receive theirs on next launch), and drawn from the very portrait you created so it matches your character exactly. It joins your collection and, space permitting, your team automatically; editing your name or portrait in the Journal updates it without ever duplicating or replacing it.',
      'Blade proficiency: a dual-wielding melee duelist who fights with two short swords, with a quick slicing strike, three in-stage upgrades and its own mastery tree.',
      'Bow proficiency: a nimble shortbow archer who looses arrows in quick bursts of three, with three in-stage upgrades and its own mastery tree.',
      'Your champion’s foot shadow now carries a subtle outline in your outfit colour on the board, marking it as your own hero. Burst shooters show their volley size in the stats (e.g. “DPS 6 x3”).',
      'Your champion is always with you: it’s pinned to the first team slot — it can’t be removed, reordered, or dragged out of place — and it can’t be sold during a stage. It wears a distinct rose-and-gold locked look in the team bar and on its card.',
    ],
  },
  {
    version: '2026-08-26 · Polish',
    changes: [
      'The Swordsman’s attack now has an airier whoosh that matches the Spearman’s, replacing the old laser-like sweep.',
      'Closing the Adventurer’s Journal now fades out smoothly to the home screen, mirroring the open animation, instead of cutting instantly.',
    ],
  },
  {
    version: '2026-08-25 · Sound & Settings',
    changes: [
      'Champions now have battle sounds: every champion has its own attack and impact cue — the Archer’s bow, the Swordsman’s slice, the Spearman’s thrust (with a heavier Javelin Toss), the Crossbow’s bolt, the Wizard’s gust and sweeping Wind Slice, and the Elf’s enchanted arrows. They’re kept soft and layered so a full board never turns into a wall of noise.',
      'New Settings menu with volume controls — separate Master, Interface, and Combat sliders plus a Mute toggle, all saved between sessions.',
      'The old debug/authoring tools (gem & EXP grants, the Level Designer, and account reset) have moved into a dedicated Developer Menu, opened from the bottom of Settings.',
    ],
  },
  {
    version: '2026-08-25 · Journal & Proficiency',
    changes: [
      'The Adventurer’s Journal can now be reopened from the home screen — page through it with arrows and read a growing Chapters section: an introduction plus a fresh chapter for every stage you clear. New lore types itself out letter-by-letter the first time you open each chapter.',
      'Character creation now includes choosing a proficiency — Blade, Bow, or Magic — with a Confirm step before your adventurer is finalised.',
      'Added synthesized sound: quill scratches and a sketching flurry during the journal intro, plus Summoning Altar cues — a charge-up as the orb winds up and a reveal chime that grows grander with the champion’s rarity.',
    ],
  },
  {
    version: '2026-08-25 · Adventurer Intro',
    changes: [
      'First-launch cinematic: a new player now opens an Adventurer’s Journal, sketches their own custom character portrait, and signs their name onto the Identification Page before entering the game.',
      'New preset-based sprite creator (body, skin, hair + colour, headwear, outfit + colour) with a live preview, per-part steppers, colour swatches, a free custom-colour picker on every colour, and a Randomize button — drawn in the same procedural style as the champions.',
      'Your adventurer (name + look) is saved and reused across sessions, ready for future features. Returning players skip the intro; existing saves keep all their progress and simply create an identity on next launch.',
    ],
  },
  {
    version: '2026-08-25',
    changes: [
      'New champion: the Elf, a Rare woodland archer whose enchanted arrows leap from foe to foe — with a mastery tree and Chain Enchantment upgrade to make them bounce further.',
      'Duplicate summons now grant mastery EXP for that champion (Common +20, Rare +30) on top of the gem refund.',
      'Cleaned up the champion detail sheet: stats are now grouped (cost/limit, then damage/speed/DPS/range, then crit) with dividers, and redundant rows already shown as tags at the top were removed.',
    ],
  },
  {
    version: '2026-08-24',
    changes: [
      'Added this Patch Notes menu next to the Settings icon.',
      'New Castle enemy: the Man-at-Arms, an armoured veteran with his own sprite.',
      'Rebalanced Castle foes — Sergeant and Siege Ram hit the castle harder, and King Kael has slightly less health.',
      'Post-battle: the win screen now has Home + Continue, and the loss screen has Home + Retry.',
      'You can now select and carry a champion you cannot yet afford — the "not enough gold" popup only fires when you actually try to place it.',
      'The placement range circle turns red when you cannot afford the unit; the "cannot build there" popup takes priority over the gold warning.',
      'Fixed the flash popup sliding in from the right before snapping to centre.',
    ],
  },
];

/**
 * Patch Notes modal. Portalled to <body> so the TopBar's backdrop-filter can't
 * trap this fixed overlay inside the header (same reasoning as Settings).
 */
export function PatchNotes({ onClose }: Props) {
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel modal patch-notes-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        <h2><Icon name="scroll" /> Patch Notes</h2>

        {PATCH_NOTES.map((entry) => (
          <div className="patch-entry" key={entry.version}>
            <div className="patch-version">{entry.version}</div>
            <ul className="patch-changes">
              {entry.changes.map((change, i) => (
                <li key={i}>{change}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
