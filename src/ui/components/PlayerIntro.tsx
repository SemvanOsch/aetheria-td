import { useCallback, useEffect, useRef, useState } from 'react';
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

interface Props {
  /**
   * Called once, at the very end of the sequence, with the finished adventurer.
   * The parent commits it (marking the intro complete) — committing earlier
   * would unmount this component mid-animation.
   */
  onComplete: (name: string, sprite: PlayerSpriteConfig) => void;
}

/** Cinematic phases: black → book opens → interactive page → book closes. */
type Phase = 'intro' | 'opening' | 'page' | 'closing';

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
export function PlayerIntro({ onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [showCreator, setShowCreator] = useState(false);

  // Portrait state: the confirmed sprite, plus a transient "ink drawing itself"
  // flag that gates it from counting as done until the reveal finishes.
  const [portrait, setPortrait] = useState<PlayerSpriteConfig | null>(null);
  const [portraitInking, setPortraitInking] = useState(false);

  // Name state: the working input, the letter-by-letter handwriting progress,
  // and the final written name (set once the animation finishes).
  const [nameInput, setNameInput] = useState('');
  const [writing, setWriting] = useState(false);
  const [writeCount, setWriteCount] = useState(0);
  const [writtenName, setWrittenName] = useState('');
  const [nameError, setNameError] = useState(false);

  const [sealed, setSealed] = useState(false);
  const [fading, setFading] = useState(false);

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

  const confirmPortrait = (cfg: PlayerSpriteConfig) => {
    setShowCreator(false);
    setPortrait(cfg);
    // Play the "magic ink fills the frame" reveal, then mark it done.
    setPortraitInking(true);
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

  // --- Completion: stamp the seal, save, and close the journal ---
  useEffect(() => {
    if (portraitDone && nameDone && !sealedOnce.current) {
      sealedOnce.current = true;
      after(350, () => {
        setSealed(true);
        playIntroSound('stamp');
      });
      // Let the player admire the finished page, then close the book, fade out,
      // and hand the finished profile to the parent (which marks intro complete).
      after(2100, () => {
        setPhase('closing');
        playIntroSound('pageTurn');
      });
      after(2900, () => setFading(true));
      after(3500, () => onComplete(writtenName, portrait as PlayerSpriteConfig));
    }
  }, [portraitDone, nameDone, writtenName, portrait, onComplete, after]);

  const displayWriting = sanitizePlayerName(nameInput).slice(0, writeCount);
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
                    disabled={writing || sealed}
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
                    <span className="id-name-written final">{writtenName}</span>
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

              {sealed && <div className="id-complete-flourish">Registration Complete ✓</div>}
            </div>
          </div>
        </div>
      </div>

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
