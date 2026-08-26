import { createPortal } from 'react-dom';

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
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <h2>📝 Patch Notes</h2>

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
