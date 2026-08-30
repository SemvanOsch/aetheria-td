import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  defaultPlayerSprite,
  isValidPlayerName,
  MAX_NAME_LENGTH,
  randomPlayerSprite,
  sanitizePlayerName,
  type PlayerSpriteConfig,
} from '../../domain/playerSprite';
import { PlayerSprite } from './PlayerSprite';
import { PlayerSpriteCreator } from './PlayerSpriteCreator';
import { playIntroSound } from '../introAudio';
import { JOURNAL_CHAPTERS, chapterPageTexts, unlockedChapterCount } from '../../domain/journal';
import {
  DEFAULT_PROFICIENCY,
  PROFICIENCIES,
  proficiencyDef,
  type Proficiency,
} from '../../domain/proficiency';

interface Props {
  /**
   * Called once, at the very end of the sequence, with the finished adventurer.
   * The parent commits it (marking the intro complete) — committing earlier
   * would unmount this component mid-animation. Omitted in review mode.
   */
  onComplete?: (name: string, sprite: PlayerSpriteConfig, proficiency: Proficiency) => void;
  /**
   * When provided, the journal opens in **review mode**: the identification page
   * is shown already filled in with this existing adventurer. The portrait, name
   * and proficiency remain editable, and the same open/close cinematic plays.
   * `onClose` runs when the player dismisses it, carrying the (possibly edited)
   * profile so the parent can persist any changes.
   */
  review?: { name: string; sprite: PlayerSpriteConfig; proficiency: Proficiency };
  /** Dismiss handler for review mode; receives the current (edited) profile. */
  onClose?: (name: string, sprite: PlayerSpriteConfig, proficiency: Proficiency) => void;
  /** Stages cleared so far — drives how many lore chapters are unlocked. */
  stagesCleared?: number;
  /** Chapter indices already read — their lore renders instantly, not typed. */
  readChapters?: number[];
  /** Called when a chapter finishes typing out for the first time ever. */
  onChapterRead?: (index: number) => void;
}

/** Cinematic phases: black → book opens → interactive page → book closes. */
type Phase = 'intro' | 'opening' | 'page' | 'closing';

/** Shown in the reader for a chapter whose lore hasn't been written yet. */
const CHAPTER_PLACEHOLDER =
  "The ink here has yet to dry. This chapter's tale will be written soon…";

/**
 * One turnable reader page. A chapter's lore is split into several of these so
 * the player pages through it instead of scrolling; an unwritten chapter
 * contributes a single placeholder leaf.
 */
interface ReaderLeaf {
  /** Owning chapter index. */
  chapter: number;
  /** Page within the chapter (0-based). */
  sub: number;
  /** Total pages in the owning chapter. */
  total: number;
  /** This page's text (the placeholder when the chapter is unwritten). */
  text: string;
  /** True when the chapter has no lore yet (renders the placeholder styling). */
  isEmpty: boolean;
}

/** Flatten the first `count` chapters into the reader's page sequence. */
function buildLeaves(count: number): ReaderLeaf[] {
  const leaves: ReaderLeaf[] = [];
  for (let c = 0; c < count; c++) {
    const pages = chapterPageTexts(c);
    if (pages.length === 0) {
      leaves.push({ chapter: c, sub: 0, total: 1, text: CHAPTER_PLACEHOLDER, isEmpty: true });
    } else {
      pages.forEach((text, sub) =>
        leaves.push({ chapter: c, sub, total: pages.length, text, isEmpty: false }),
      );
    }
  }
  return leaves;
}

/** Stable key for a leaf — remembers which pages have finished typing. */
const leafKey = (l: { chapter: number; sub: number }) => `${l.chapter}:${l.sub}`;

/**
 * First-time player introduction.
 *
 * On first launch (no saved player profile) this replaces the normal app shell.
 * It fades in from black, opens an adventurer's journal, and turns the first
 * page into an immersive character-creation "Identification Page": the player
 * taps the empty portrait to open the preset sprite creator, then writes their
 * name onto the line. When both are done a guild seal is stamped, the page is
 * saved, and the journal closes into the game. The profile is only committed at
 * the end, so quitting halfway simply replays the intro next launch.
 */
export function PlayerIntro({
  onComplete,
  review,
  onClose,
  stagesCleared = 0,
  readChapters,
  onChapterRead,
}: Props) {
  const isReview = review != null;
  const [phase, setPhase] = useState<Phase>('intro');
  const [showCreator, setShowCreator] = useState(false);

  // After confirming the first-launch identification the journal stays open on
  // its introduction chapter (rather than closing straight to the game), so the
  // book becomes navigable exactly like review mode from that point on.
  const [reading, setReading] = useState(false);
  const navigable = isReview || reading;

  // Journal paging: 0 = Identification, 1 = Chapters index, 2+ = a reader leaf.
  // Chapters are split into several turnable leaves (see buildLeaves), so page
  // 2 + leafIndex reads the flat sequence across all unlocked chapters.
  const unlockedChapters = navigable ? unlockedChapterCount(stagesCleared) : 0;
  const leaves = useMemo(() => buildLeaves(unlockedChapters), [unlockedChapters]);
  const lastPage = navigable ? 1 + leaves.length : 0;
  const [page, setPage] = useState(0);

  const turnPage = (dir: 'next' | 'prev') => {
    const target = dir === 'next' ? page + 1 : page - 1;
    if (target < 0 || target > lastPage) return;
    playIntroSound('pageTurn');
    setPage(target);
  };

  const openChapter = (chapterIndex: number) => {
    if (chapterIndex >= unlockedChapters) return;
    const leafIdx = leaves.findIndex((l) => l.chapter === chapterIndex);
    if (leafIdx < 0) return;
    playIntroSound('pageTurn');
    setPage(2 + leafIdx);
  };

  // Portrait state: the confirmed sprite, plus a transient "ink drawing itself"
  // flag that gates it from counting as done until the reveal finishes.
  const [portrait, setPortrait] = useState<PlayerSpriteConfig | null>(review?.sprite ?? null);
  const [portraitInking, setPortraitInking] = useState(false);

  // Name state: the working input, the letter-by-letter handwriting progress,
  // and the final written name (set once the animation finishes).
  const [nameInput, setNameInput] = useState('');
  const [writing, setWriting] = useState(false);
  const [writeCount, setWriteCount] = useState(0);
  const [writtenName, setWrittenName] = useState(review?.name ?? '');
  const [nameError, setNameError] = useState(false);

  // Proficiency: chosen from a dropdown after the name is signed, then written
  // out letter-by-letter (like the name). `proficiency` is the current dropdown
  // selection; `writtenProficiency` is set once its handwriting finishes.
  const [proficiency, setProficiency] = useState<Proficiency | null>(review?.proficiency ?? null);
  const [profWriting, setProfWriting] = useState(false);
  const [profWriteCount, setProfWriteCount] = useState(0);
  const [writtenProficiency, setWrittenProficiency] = useState<Proficiency | null>(
    review?.proficiency ?? null,
  );

  const [sealed, setSealed] = useState(isReview);
  const [fading, setFading] = useState(false);

  // Chapter lore is typed out letter-by-letter the *first* time each page is
  // opened; already-seen pages render instantly. `revealedLeaves` remembers
  // which reader pages have finished typing (keyed by leafKey); `typeCount`
  // drives the currently-typing one. A fully-read chapter (from readChapters)
  // marks all of its leaves revealed up front.
  const [revealedLeaves, setRevealedLeaves] = useState<Set<string>>(() => {
    const read = new Set(readChapters ?? []);
    const set = new Set<string>();
    buildLeaves(unlockedChapterCount(stagesCleared)).forEach((l) => {
      if (read.has(l.chapter)) set.add(leafKey(l));
    });
    return set;
  });
  const [typeCount, setTypeCount] = useState(0);
  const currentLeafIndex = page >= 2 ? page - 2 : null;
  const currentLeaf = currentLeafIndex != null ? leaves[currentLeafIndex] ?? null : null;

  const nameInputRef = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);
  const sealedOnce = useRef(false);

  const after = useCallback((ms: number, fn: () => void) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  }, []);

  // Clear every pending timer on unmount.
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((id) => clearTimeout(id));
  }, []);

  const portraitDone = portrait != null && !portraitInking;
  const nameDone = writtenName.length > 0;
  const proficiencyDone = writtenProficiency != null && !profWriting;
  const allDone = portraitDone && nameDone && proficiencyDone;

  // --- Opening cinematic: fade in, open the book, settle on the first page ---
  // The spread unfurls *during* the opening phase (its CSS transition fires the
  // moment the phase flips), so the identification page is revealed continuously
  // as the cover lifts — no blank gap before it appears.
  useEffect(() => {
    playIntroSound('open');
    // Linger on the closed cover for a beat before it opens.
    const a = after(1700, () => {
      setPhase('opening');
      playIntroSound('pageTurn');
    });
    const b = after(2600, () => setPhase('page'));
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Portrait: open the creator ---
  const openCreator = () => {
    if (writing) return;
    playIntroSound('pageTurn');
    setShowCreator(true);
  };

  // --- Review mode: re-open the name for editing ---
  const editName = () => {
    if (writing) return;
    setNameInput(writtenName);
    setWrittenName('');
    playIntroSound('pageTurn');
  };

  const confirmPortrait = (cfg: PlayerSpriteConfig) => {
    setShowCreator(false);
    setPortrait(cfg);
    // Play the "magic ink fills the frame" reveal (with a sketching sound over
    // it), then mark it done.
    setPortraitInking(true);
    playIntroSound('sketch');
    after(1300, () => setPortraitInking(false));
  };

  // Focus the name field as soon as the portrait is finished and the name is
  // still empty, guiding attention to the next step.
  useEffect(() => {
    if (portraitDone && !nameDone && !writing) {
      const id = after(200, () => nameInputRef.current?.focus());
      return () => clearTimeout(id);
    }
  }, [portraitDone, nameDone, writing, after]);

  // --- Name: submit + handwriting animation ---
  const submitName = () => {
    const clean = sanitizePlayerName(nameInput);
    if (!isValidPlayerName(clean)) {
      setNameError(true);
      return;
    }
    setNameError(false);
    setNameInput(clean);
    setWriting(true);
    setWriteCount(0);
  };

  // Reveal the name one letter at a time while `writing`.
  useEffect(() => {
    if (!writing) return;
    const clean = sanitizePlayerName(nameInput);
    if (writeCount >= clean.length) {
      const id = after(220, () => {
        setWriting(false);
        setWrittenName(clean);
      });
      return () => clearTimeout(id);
    }
    const id = after(writeCount === 0 ? 120 : 105, () => {
      setWriteCount((n) => n + 1);
      playIntroSound('quill');
    });
    return () => clearTimeout(id);
  }, [writing, writeCount, nameInput, after]);

  // --- Proficiency: choose from the dropdown, then handwrite the label ---
  const chooseProficiency = (id: Proficiency) => {
    setProficiency(id);
    setWrittenProficiency(null);
    setProfWriting(true);
    setProfWriteCount(0);
  };

  // Re-open the dropdown to change the choice (intro only — locked in review).
  const editProficiency = () => {
    setWrittenProficiency(null);
    setProfWriting(false);
  };

  // Reveal the proficiency label one letter at a time while `profWriting`.
  useEffect(() => {
    if (!profWriting || !proficiency) return;
    const label = proficiencyDef(proficiency).label;
    if (profWriteCount >= label.length) {
      const id = after(200, () => {
        setProfWriting(false);
        setWrittenProficiency(proficiency);
      });
      return () => clearTimeout(id);
    }
    const id = after(profWriteCount === 0 ? 120 : 105, () => {
      setProfWriteCount((n) => n + 1);
      playIntroSound('quill');
    });
    return () => clearTimeout(id);
  }, [profWriting, profWriteCount, proficiency, after]);

  // --- Confirm: the player commits once everything is filled in. Stamps the
  // seal, then turns to the journal's Introduction chapter (the profile isn't
  // committed until they finally close the journal, via `dismiss`). ---
  const confirmIdentity = () => {
    if (!allDone || sealed || sealedOnce.current) return;
    sealedOnce.current = true;
    setSealed(true);
    playIntroSound('stamp');
    // Admire the sealed page, then open the book to the Introduction (page 2).
    after(1200, () => {
      setReading(true);
      setPage(2);
      playIntroSound('pageTurn');
    });
  };

  // Type the current page's lore out letter-by-letter the first time it's
  // opened. Reaching the last page of a chapter fires onChapterRead once.
  useEffect(() => {
    if (currentLeaf == null) return;
    const key = leafKey(currentLeaf);
    const text = currentLeaf.text;
    if (revealedLeaves.has(key)) {
      setTypeCount(text.length);
      return;
    }
    setTypeCount(0);
    let count = 0;
    let id = 0;
    const step = () => {
      count += 1;
      setTypeCount(count);
      if (count % 3 === 0) playIntroSound('quill');
      if (count >= text.length) {
        setRevealedLeaves((prev) => new Set(prev).add(key));
        if (currentLeaf.sub === currentLeaf.total - 1) onChapterRead?.(currentLeaf.chapter);
        return;
      }
      id = window.setTimeout(step, 26);
    };
    id = window.setTimeout(step, 220);
    timers.current.push(id);
    return () => clearTimeout(id);
    // Intentionally keyed only on the page: `revealedLeaves` is read once at entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // --- Dismiss the journal: close cinematic, then hand the finished profile to
  // the parent. Commits (onComplete) on first launch, saves edits (onClose) in
  // review mode. ---
  const dismiss = () => {
    if (fading || portrait == null) return;
    const savedSprite = portrait;
    const savedName = nameDone ? writtenName : sanitizePlayerName(nameInput) || review!.name;
    const savedProficiency =
      writtenProficiency ?? proficiency ?? review?.proficiency ?? DEFAULT_PROFICIENCY;
    setPhase('closing');
    playIntroSound('pageTurn');
    after(800, () => setFading(true));
    after(1400, () => {
      if (isReview) onClose?.(savedName, savedSprite, savedProficiency);
      else onComplete?.(savedName, savedSprite, savedProficiency);
    });
  };

  const displayWriting = sanitizePlayerName(nameInput).slice(0, writeCount);
  const profLabel = proficiency ? proficiencyDef(proficiency).label : '';
  const displayProfWriting = profLabel.slice(0, profWriteCount);
  const registered = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className={`intro-root ${fading ? 'fading' : ''}`}>
      <div className="journal-stage">
        <div className={`journal-book phase-${phase}`}>
          {/* Closed leather cover — visible before/while opening, and on close. */}
          <div className="book-cover">
            <div className="book-cover-emblem">✦</div>
            <div className="book-cover-title">Adventurer&apos;s Journal</div>
          </div>

          {/* The open two-page spread. */}
          <div className="book-spread">
            {navigable && page === 1 ? (
              /* ---- Chapters index ---- */
              <>
                <div className="book-page left" key="chapters-left">
                  <div className="page-flourish top">❧</div>
                  <div className="frontispiece">
                    <div className="compass-rose">✧</div>
                    <div className="frontispiece-title">Chronicles<br />of Aetheria</div>
                    <div className="frontispiece-motto">
                      {unlockedChapters} {unlockedChapters === 1 ? 'chapter' : 'chapters'} written
                    </div>
                  </div>
                  <div className="page-flourish bottom">❧</div>
                </div>
                <div className="book-page right" key="chapters-right">
                  <div className="id-header">Chapters</div>
                  <div className="id-rule" />
                  <div className="chapter-list">
                    {/* Only unlocked (written) chapters are shown; sealed ones
                        stay hidden until the player unlocks them. */}
                    {JOURNAL_CHAPTERS.slice(0, unlockedChapters).map((ch, i) => (
                      <button
                        key={i}
                        className="chapter-entry"
                        onClick={() => openChapter(i)}
                      >
                        <span className="chapter-index">{i === 0 ? '❖' : i}</span>
                        <span className="chapter-title">{ch.title}</span>
                        <span className="chapter-status">›</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : navigable && page >= 2 && currentLeaf ? (
              /* ---- Chapter reader (one turnable page of a chapter) ---- */
              (() => {
                const leaf = currentLeaf;
                const chapter = JOURNAL_CHAPTERS[leaf.chapter];
                const key = leafKey(leaf);
                const done = revealedLeaves.has(key);
                const shown = done ? leaf.text : leaf.text.slice(0, typeCount);
                const paras = shown.split(/\n\s*\n/);
                return (
                  <>
                    <div className="book-page left" key={`ch-left-${page}`}>
                      <div className="page-flourish top">❧</div>
                      <div className="frontispiece">
                        <div className="compass-rose">
                          {leaf.chapter === 0 ? '❖' : '✦'}
                        </div>
                        <div className="chapter-reader-kicker">
                          {leaf.chapter === 0 ? 'The Opening Words' : `Chapter ${leaf.chapter}`}
                        </div>
                        <div className="frontispiece-title">{chapter.title}</div>
                        {leaf.total > 1 && (
                          <div className="frontispiece-motto">
                            Page {leaf.sub + 1} of {leaf.total}
                          </div>
                        )}
                      </div>
                      <div className="page-flourish bottom">❧</div>
                    </div>
                    <div className="book-page right" key={`ch-right-${page}`}>
                      <div className="id-header">{chapter.title}</div>
                      <div className="id-rule" />
                      <div className={`chapter-body ${leaf.isEmpty ? 'empty' : ''}`}>
                        {paras.map((para, i) => (
                          <p
                            key={i}
                            className={leaf.isEmpty ? 'chapter-body-empty' : undefined}
                          >
                            {para}
                            {!done && i === paras.length - 1 && (
                              <span className="name-cursor" />
                            )}
                          </p>
                        ))}
                      </div>
                    </div>
                  </>
                );
              })()
            ) : (
              /* ---- Identification (page 0, and the first-launch intro) ---- */
              <>
            {/* Left page — decorative frontispiece. */}
            <div className="book-page left">
              <div className="page-flourish top">❧</div>
              <div className="frontispiece">
                <div className="compass-rose">✳</div>
                <div className="frontispiece-title">The Adventurers&apos;<br />Guild</div>
                <div className="frontispiece-motto">“Every legend begins<br />with a name.”</div>
              </div>
              <div className="page-flourish bottom">❧</div>
            </div>

            {/* Right page — the Identification form. */}
            <div className="book-page right">
              <div className="id-header">Adventurer Identification</div>
              <div className="id-rule" />

              <div className="id-top">
                {/* Portrait frame (top-left). */}
                <div className="id-portrait-block">
                  <div className="id-label">Portrait</div>
                  <button
                    className={`id-portrait-frame ${portrait ? 'filled' : 'empty'} ${
                      portraitInking ? 'inking' : ''
                    } ${!portrait && !showCreator ? 'beckon' : ''}`}
                    onClick={openCreator}
                    aria-label={portrait ? 'Edit portrait' : 'Create your portrait'}
                    disabled={writing || (sealed && !isReview)}
                    title={isReview ? 'Tap to edit portrait' : undefined}
                  >
                    {portrait ? (
                      <PlayerSprite config={portrait} size={116} label="Your portrait" />
                    ) : (
                      <span className="id-portrait-hint">
                        <span className="id-portrait-plus">✎</span>
                        <span className="id-portrait-tap">Tap to sketch</span>
                      </span>
                    )}
                  </button>
                </div>

                {/* Registration details (decorative, hand-written). */}
                <div className="id-details">
                  <div className="id-detail-row">
                    <span className="id-label">Guild Rank</span>
                    <span className="id-handwritten">Novice</span>
                  </div>
                  <div className="id-detail-row">
                    <span className="id-label">Registered</span>
                    <span className="id-handwritten small">{registered}</span>
                  </div>
                  <div className="id-detail-row">
                    <span className="id-label">Seal</span>
                    <span className={`wax-seal ${sealed ? 'stamped' : ''}`}>
                      {sealed ? '✦' : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Name line. */}
              <div className={`id-name-block ${portraitDone ? 'active' : 'locked'}`}>
                <div className="id-label">Name</div>
                <div className="id-name-line">
                  {nameDone ? (
                    isReview || !sealed ? (
                      <button
                        className="id-name-written final editable"
                        onClick={editName}
                        disabled={sealed && !isReview}
                        title="Tap to edit name"
                      >
                        {writtenName}
                        <span className="id-name-edit-pencil">✎</span>
                      </button>
                    ) : (
                      <span className="id-name-written final">{writtenName}</span>
                    )
                  ) : writing ? (
                    <span className="id-name-written">
                      {displayWriting}
                      <span className="name-cursor" />
                    </span>
                  ) : portraitDone ? (
                    <div className="id-name-entry">
                      <input
                        ref={nameInputRef}
                        className="id-name-input"
                        value={nameInput}
                        maxLength={MAX_NAME_LENGTH}
                        placeholder="Sign your name…"
                        onChange={(e) => {
                          setNameInput(e.target.value);
                          if (nameError) setNameError(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitName();
                        }}
                        aria-label="Adventurer name"
                      />
                      <button
                        className="id-name-submit"
                        onClick={submitName}
                        disabled={!isValidPlayerName(nameInput)}
                        aria-label="Ink your name"
                        title="Ink your name"
                      >
                        ➜
                      </button>
                    </div>
                  ) : (
                    <span className="id-name-placeholder">
                      ✒ ____________________
                    </span>
                  )}
                </div>
                {nameError && <div className="id-name-error">Every adventurer needs a name.</div>}
                {!portraitDone && !portrait && (
                  <div className="id-name-hint">Sketch your portrait first ↑</div>
                )}
              </div>

              {/* Proficiency — a dropdown, then handwritten like the name.
                  Editable during the intro; fixed (read-only) in review mode. */}
              <div className={`id-prof-block ${nameDone || isReview ? 'active' : 'locked'}`}>
                <div className="id-label">Proficiency</div>
                <div className="id-prof-line">
                  {isReview && writtenProficiency ? (
                    // Review: show the chosen path, not editable.
                    <span className="id-prof-written final">
                      {proficiencyDef(writtenProficiency).label}
                    </span>
                  ) : proficiencyDone && writtenProficiency ? (
                    // Intro, chosen & written: clickable to change.
                    <button
                      className="id-prof-written final editable"
                      onClick={editProficiency}
                      disabled={sealed}
                      title="Tap to change your path"
                    >
                      {proficiencyDef(writtenProficiency).label}
                      <span className="id-name-edit-pencil">✎</span>
                    </button>
                  ) : profWriting ? (
                    <span className="id-prof-written">
                      {displayProfWriting}
                      <span className="name-cursor" />
                    </span>
                  ) : (
                    <select
                      className="id-prof-select"
                      value={proficiency ?? ''}
                      disabled={!nameDone}
                      onChange={(e) => chooseProficiency(e.target.value as Proficiency)}
                      aria-label="Choose your proficiency"
                    >
                      <option value="" disabled>
                        Choose your path…
                      </option>
                      {PROFICIENCIES.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label} — {p.blurb}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {!nameDone && !isReview && (
                  <div className="id-name-hint">Sign your name first ↑</div>
                )}
              </div>

              {sealed && (
                <div className="id-complete-flourish">
                  {isReview ? 'Registered Adventurer ✓' : 'Registration Complete ✓'}
                </div>
              )}
            </div>
              </>
            )}

            {/* Page-turn arrows (navigable book). Each shows only when there is
                a page to move to in that direction. */}
            {navigable && phase === 'page' && page > 0 && (
              <button
                className="journal-arrow left"
                onClick={() => turnPage('prev')}
                aria-label="Previous page"
              >
                ‹
              </button>
            )}
            {navigable && phase === 'page' && page < lastPage && (
              <button
                className="journal-arrow right"
                onClick={() => turnPage('next')}
                aria-label="Next page"
              >
                ›
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Close button beneath the journal (review, or after confirming). */}
      {navigable && phase === 'page' && (
        <button className="journal-close-btn" onClick={dismiss}>
          Close Journal
        </button>
      )}

      {/* Confirm button beneath the journal (intro). Only clickable once the
          portrait, name and proficiency are all filled in. */}
      {!navigable && phase === 'page' && !sealed && (
        <button
          className="journal-close-btn confirm"
          onClick={confirmIdentity}
          disabled={!allDone}
          title={allDone ? 'Seal your identification' : 'Fill in every field first'}
        >
          Confirm &amp; Begin
        </button>
      )}

      {/* The sprite creator floats over the journal while open. */}
      {showCreator && (
        <div className="creator-overlay" onClick={() => setShowCreator(false)}>
          <PlayerSpriteCreator
            initial={portrait ?? seededSprite()}
            onConfirm={confirmPortrait}
            onCancel={() => setShowCreator(false)}
          />
        </div>
      )}
    </div>
  );
}

/** A pleasant, slightly-random starting point for a first-time creator. */
function seededSprite(): PlayerSpriteConfig {
  // Bias toward the tidy default but randomise colour/hair so it feels personal
  // without ever looking broken.
  const base = defaultPlayerSprite();
  const rand = randomPlayerSprite();
  return { ...base, hair: rand.hair, hairColor: rand.hairColor, outfitColor: rand.outfitColor };
}
