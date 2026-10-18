import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

interface Props {
  /** The tip's text. */
  tip: string;
  /** Optional glyph and title shown in the tip's head (e.g. Bleed). */
  icon?: IconName;
  title?: string;
  /** Tip accent colour (head glyph, border glow); defaults to gold. */
  accent?: string;
  /** Extra class on the anchor wrapper. */
  className?: string;
  /** Render the anchor as a block element (for a whole tile) instead of inline. */
  block?: boolean;
  children: ReactNode;
}

/** Gap (px) between the anchor and the tip, and the viewport margin it keeps. */
const GAP = 10;
const MARGIN = 8;

/**
 * A hover/focus tooltip for a keyword or a stat tile: a small dark plate with a
 * gilt hairline that rises in above its anchor (below it when there's no room).
 * Portalled to `document.body` and positioned `fixed`, so a modal's scroll box
 * or `.screen` transform can never clip it. Keyboard users get it on focus.
 */
export function Hint({ tip, icon, title, accent, className, block, children }: Props) {
  const anchor = useRef<HTMLElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean; arrow: number } | null>(null);

  // Place the tip once it has rendered (its size is needed), centred on the anchor.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const a = anchor.current?.getBoundingClientRect();
    const b = bubble.current?.getBoundingClientRect();
    if (!a || !b) return;
    const below = a.top - GAP - b.height < MARGIN;
    const cx = a.left + a.width / 2;
    const x = Math.min(window.innerWidth - MARGIN - b.width, Math.max(MARGIN, cx - b.width / 2));
    const y = below ? a.bottom + GAP : a.top - GAP - b.height;
    setPos({ x, y, below, arrow: Math.min(b.width - 14, Math.max(14, cx - x)) });
  }, [open, tip]);

  const Tag = block ? 'div' : 'span';
  const style = { '--hint-accent': accent ?? 'var(--gold)' } as CSSProperties;

  return (
    <>
      <Tag
        ref={anchor as never}
        style={style}
        className={`hint-anchor${className ? ` ${className}` : ''}`}
        tabIndex={0}
        aria-describedby={open ? 'hint-tip' : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </Tag>
      {open &&
        createPortal(
          <div
            ref={bubble}
            id="hint-tip"
            role="tooltip"
            className={`hint-tip${pos ? ' shown' : ''}${pos?.below ? ' below' : ''}`}
            style={{ ...style, left: pos?.x ?? 0, top: pos?.y ?? 0, '--hint-arrow': `${pos?.arrow ?? 0}px` } as CSSProperties}
          >
            {(icon || title) && (
              <div className="hint-head">
                {icon && <Icon name={icon} />}
                {title && <span>{title}</span>}
              </div>
            )}
            <div className="hint-body">{tip}</div>
          </div>,
          document.body,
        )}
    </>
  );
}
