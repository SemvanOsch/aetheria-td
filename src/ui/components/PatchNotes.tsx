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
    version: '2026-08-24',
    changes: [
      'Added this Patch Notes menu next to the Settings icon.',
      'New Castle enemy: the Man-at-Arms, an armoured veteran with his own hand-drawn sprite.',
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
