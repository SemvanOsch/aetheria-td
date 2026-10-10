import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import type { EnemyDef } from '../../domain/enemies';
import { playIntroSound } from '../introAudio';
import { EnemySprite } from './EnemySprite';
import { Icon } from './Icon';
import { foeKicker, foeLedgerRows, foeTraits } from '../foeNotes';
import { PageCorners } from './JournalArt';
import { useFitText } from '../useFitText';

/**
 * In-battle bestiary notes. The first time a foe is recorded mid-battle a small
 * journal tab peeks in at the side of the board (`FieldNoteTab`); clicking it
 * pauses the battle and opens one journal page (`FieldNotePage`) where the
 * entry writes itself in, line by line, as if being jotted down on the spot.
 * The page has no bookmarks or page turns: it closes straight back to battle.
 */

/** Longest the whole entry may take to write itself (s). */
const WRITE_MAX = 2.4;
/** Ink time per character of a written line (s), before the cap above. */
const PER_CHAR = 0.02;

interface TabProps {
  /** The foe waiting to be written up (the oldest one queued). */
  def: EnemyDef;
  /** How many foes are waiting in all. */
  count: number;
  onOpen: () => void;
}

/** The little journal that pops in at the board's side for a new foe. */
export function FieldNoteTab({ def, count, onOpen }: TabProps) {
  const nameRef = useFitText<HTMLSpanElement>(def.name, 12);
  return (
    <button
      type="button"
      className="field-note-tab"
      onClick={onOpen}
      title="Record this foe in your journal (pauses the battle)"
    >
      <span className="fn-tab-book" aria-hidden="true">
        <Icon name="bestiary" />
      </span>
      <span className="fn-tab-text">
        <span className="fn-tab-kicker">New foe</span>
        <span className="fn-tab-name" ref={nameRef}>
          {def.name}
        </span>
      </span>
      {count > 1 && <span className="fn-tab-count">{count}</span>}
    </button>
  );
}

/** One timed stroke of the entry: when it starts and how long it takes (s). */
interface Stroke {
  at: number;
  dur: number;
}

/** Lays the entry's strokes out one after another, squeezed to fit `WRITE_MAX`. */
function planStrokes(def: EnemyDef, rows: { label: string; value: string }[]) {
  const line = (text: string, min = 0.14, max = 0.42) => Math.min(max, Math.max(min, text.length * PER_CHAR));
  const durs = {
    kicker: line(foeKicker(def)),
    name: line(def.name, 0.3, 0.5),
    traits: line(foeTraits(def)),
    // The ledger is written two rows (one per column) at a time.
    rows: rows.map((r) => line(`${r.label} ${r.value}`, 0.12, 0.26)),
    mechanic: def.mechanic ? 0.55 : 0,
    lore: 0.75,
  };
  const pairs = Math.ceil(rows.length / 2);
  const pairDur = (p: number) => Math.max(durs.rows[p * 2] ?? 0, durs.rows[p * 2 + 1] ?? 0);
  const gap = 0.05;
  let natural = durs.kicker + durs.name + durs.traits + durs.mechanic + durs.lore + gap * 5;
  for (let p = 0; p < pairs; p++) natural += pairDur(p);
  const k = Math.min(1, WRITE_MAX / natural);

  let t = 0.15; // a breath while the page settles
  const next = (d: number): Stroke => {
    const s = { at: t, dur: d * k };
    t += (d + gap) * k;
    return s;
  };
  const kicker = next(durs.kicker);
  const name = next(durs.name);
  const traits = next(durs.traits);
  const rowStrokes: Stroke[] = [];
  for (let p = 0; p < pairs; p++) {
    const start = t;
    const d = pairDur(p);
    rowStrokes.push({ at: start, dur: durs.rows[p * 2] * k });
    if (p * 2 + 1 < rows.length) rowStrokes.push({ at: start, dur: durs.rows[p * 2 + 1] * k });
    t += (d + gap) * k;
  }
  const mechanic = def.mechanic ? next(durs.mechanic) : null;
  const lore = next(durs.lore);
  return { kicker, name, traits, rows: rowStrokes, mechanic, lore, end: t };
}

/** A line inked left to right, with the quill riding its leading edge. */
function Ink({
  stroke,
  className,
  bodyRef,
  children,
}: {
  stroke: Stroke;
  className: string;
  bodyRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  const style = { '--at': `${stroke.at}s`, '--dur': `${stroke.dur}s` } as CSSProperties;
  return (
    <div className="fn-ink" style={style}>
      <div className={`fn-ink-body ${className}`} ref={bodyRef}>
        {children}
      </div>
      <span className="fn-quill" aria-hidden="true">
        <Icon name="quill" />
      </span>
    </div>
  );
}

/** A paragraph written word by word across its stroke. */
function InkWords({ stroke, text }: { stroke: Stroke; text: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  const step = stroke.dur / Math.max(1, words.length);
  return (
    <>
      {words.map((w, i) => (
        <span key={i}>
          <span className="fn-word" style={{ '--at': `${stroke.at + i * step}s` } as CSSProperties}>
            {w}
          </span>{' '}
        </span>
      ))}
    </>
  );
}

interface PageProps {
  def: EnemyDef;
  /** Lifetime kills of this foe, counting the battle in progress. */
  kills: number;
  /** Closes the page and resumes the battle. */
  onClose: () => void;
}

/** The single journal page the new foe is written onto while the battle waits. */
export function FieldNotePage({ def, kills, onClose }: PageProps) {
  const rows = useMemo(() => foeLedgerRows(def, kills), [def, kills]);
  const plan = useMemo(() => planStrokes(def, rows), [def, rows]);
  const [done, setDone] = useState(false);
  const nameRef = useFitText<HTMLDivElement>(def.name, 15);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };

  // Voice the writing: the page lands, the nib scratches through each stroke,
  // and the entry is stamped once the ink is down.
  useEffect(() => {
    playIntroSound('open');
    const strokes = [plan.kicker, plan.name, plan.traits, ...plan.rows, plan.mechanic, plan.lore];
    for (const s of strokes) {
      if (!s) continue;
      for (let t = 0; t < s.dur; t += 0.09) {
        timers.current.push(window.setTimeout(() => playIntroSound('quill'), (s.at + t) * 1000));
      }
    }
    timers.current.push(
      window.setTimeout(() => {
        setDone(true);
        playIntroSound('stamp');
      }, plan.end * 1000),
    );
    return clearTimers;
  }, [plan]);

  // Finish the writing at once (a click on the page, or Space/Enter mid-write).
  const finish = () => {
    if (done) return;
    clearTimers();
    setDone(true);
    playIntroSound('stamp');
  };

  // Escape and Enter close a finished page; mid-write they finish it first.
  // (Refs: the battle re-renders this page every frame with fresh callbacks.)
  const keyRef = useRef(() => {});
  keyRef.current = () => (done ? onClose() : finish());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      keyRef.current();
    };
    // Capture, so the battle's own Escape (the pause menu) never sees it.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const spriteStyle = { '--at': `${plan.kicker.at}s`, '--dur': `${plan.end * 0.6}s` } as CSSProperties;

  return createPortal(
    <div className="modal-backdrop field-note-backdrop">
      <div
        className={`book-page field-note-page${done ? ' done' : ''}`}
        onClick={finish}
        role="dialog"
        aria-label={`Journal entry: ${def.name}`}
      >
        <PageCorners />
        <div className={`j-entry foe${def.boss ? ' boss' : ''}`}>
          <Ink stroke={plan.kicker} className="plate-kicker">
            {foeKicker(def)}
          </Ink>
          <div className="j-frame foe fn-sketch" style={spriteStyle}>
            <EnemySprite enemy={def} size={def.boss ? 150 : 128} />
            {done && <span className="j-frame-stamp fn-stamp">Recorded</span>}
          </div>
          <Ink stroke={plan.name} className="j-name" bodyRef={nameRef}>
            {def.name}
          </Ink>
          <Ink stroke={plan.traits} className="j-traits">
            {foeTraits(def)}
          </Ink>

          <div className="j-ledger">
            {rows.map((r, i) => (
              <Ink key={r.label} stroke={plan.rows[i]} className="j-ledger-row">
                <span>{r.label}</span>
                <i aria-hidden="true" />
                <b>{r.value}</b>
              </Ink>
            ))}
          </div>

          <div className="j-notes">
            {def.mechanic && plan.mechanic && (
              <p className="j-mechanic">
                <b className="fn-word" style={{ '--at': `${plan.mechanic.at}s` } as CSSProperties}>
                  Beware:
                </b>{' '}
                <InkWords stroke={plan.mechanic} text={def.mechanic} />
              </p>
            )}
            <p className="j-lore">
              <InkWords stroke={plan.lore} text={def.lore ?? 'The archivists have yet to record this tale…'} />
            </p>
          </div>
        </div>

        <button
          type="button"
          className="j-btn fn-close"
          onClick={(e) => {
            e.stopPropagation();
            if (done) onClose();
            else finish();
          }}
        >
          {done ? (
            <>
              <Icon name="play" /> Back to battle
            </>
          ) : (
            'Skip'
          )}
        </button>
      </div>
    </div>,
    document.body,
  );
}
