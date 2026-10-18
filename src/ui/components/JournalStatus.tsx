import { useState, type CSSProperties } from 'react';
import { STATUS_NOTES, type StatusNote } from '../statusNotes';
import { Icon } from './Icon';
import { Flourish, PageCorners } from './JournalArt';

/**
 * The journal's Status Effects bookmark: notes on the conditions champions lay
 * on foes (Bleeding, Brittle). The right page indexes them; the left page is the
 * selected effect's entry: its mark and what it does. Laid out like the
 * Bestiary.
 */
export function JournalStatus() {
  const [selectedId, setSelectedId] = useState(STATUS_NOTES[0]?.id ?? null);
  const selected = STATUS_NOTES.find((n) => n.id === selectedId) ?? null;

  return (
    <>
      <div className="book-page left" key={`js-left-${selected?.id ?? 'none'}`}>
        <PageCorners />
        {selected && <StatusEntry note={selected} />}
      </div>

      <div className="book-page right" key="js-right">
        <PageCorners />
        <div className="id-header">Status Effects</div>
        <Flourish className="id-flourish j-tight" />
        <p className="js-intro">
          Conditions your champions lay on the foe. Click a foe in battle to see which ones it carries and how long they last.
        </p>
        <div className="j-grid">
          {STATUS_NOTES.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`j-card js-card${n.id === selectedId ? ' current' : ''}`}
              style={{ '--fx': n.color } as CSSProperties}
              onClick={() => setSelectedId(n.id)}
            >
              <span className="j-card-art">
                <span className="js-mark small">
                  <Icon name={n.icon} />
                </span>
              </span>
              <span className="j-card-name">{n.name}</span>
              <span className="j-card-sub">{n.kind}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/** The left page: one status effect, written up. */
function StatusEntry({ note }: { note: StatusNote }) {
  return (
    <div className="j-entry js-entry" style={{ '--fx': note.color } as CSSProperties}>
      <div className="plate-kicker">Status effect · {note.kind}</div>
      <div className="j-frame js-frame">
        <span className="js-mark">
          <Icon name={note.icon} />
        </span>
      </div>
      <div className="j-name">{note.name}</div>

      <div className="j-notes">
        <p className="j-mechanic">{note.effect}</p>
      </div>
    </div>
  );
}
