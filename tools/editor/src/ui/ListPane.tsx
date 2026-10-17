/**
 * The left-hand list of a workspace: search, filters, sort, a toolbar of
 * collection actions, and the rows themselves (Arrow keys move the selection).
 */

import { useRef, type ReactNode, type KeyboardEvent } from 'react';
import { Icon } from './Icon';

export interface ListRow {
  key: string;
  title: string;
  subtitle?: string;
  /** Small right-aligned text (id, stats). */
  meta?: ReactNode;
  /** Leading visual (swatch, sprite). */
  lead?: ReactNode;
  errors?: number;
  warnings?: number;
  /** Shown dimmed (archived, read-only). */
  muted?: boolean;
  /** Rows sharing a group render under one heading. */
  group?: string;
  /** A tag shown beside the title (e.g. "Archived", "New"). */
  tag?: string;
}

export function ListPane({
  label,
  rows,
  selected,
  onSelect,
  query,
  onQuery,
  filters,
  toolbar,
  empty,
  footer,
}: {
  label: string;
  rows: ListRow[];
  selected: string | null;
  onSelect: (key: string) => void;
  query: string;
  onQuery: (q: string) => void;
  filters?: ReactNode;
  toolbar?: ReactNode;
  empty?: ReactNode;
  footer?: ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const i = rows.findIndex((r) => r.key === selected);
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    const row = rows[next];
    if (!row) return;
    onSelect(row.key);
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(row.key)}"]`)?.focus());
  };

  let lastGroup: string | undefined;
  return (
    <aside className="ed-list" aria-label={label}>
      <div className="ed-list-head">
        <label className="ed-search">
          <Icon name="search" />
          <input type="search" value={query} placeholder={`Search ${label.toLowerCase()}…`} aria-label={`Search ${label}`} onChange={(e) => onQuery(e.target.value)} />
        </label>
        {filters && <div className="ed-list-filters">{filters}</div>}
        {toolbar && (
          <div className="ed-list-toolbar" role="toolbar" aria-label={`${label} actions`}>
            {toolbar}
          </div>
        )}
      </div>
      <div className="ed-list-rows" ref={listRef} role="listbox" aria-label={label} onKeyDown={onKey}>
        {rows.length === 0 && (empty ?? <p className="ed-list-empty">Nothing matches.</p>)}
        {rows.map((r) => {
          const heading = r.group !== undefined && r.group !== lastGroup ? r.group : null;
          lastGroup = r.group;
          return (
            <div key={r.key} role="presentation">
              {heading && <div className="ed-list-group" role="presentation">{heading}</div>}
              <button
                type="button"
                role="option"
                aria-selected={r.key === selected}
                data-key={r.key}
                tabIndex={r.key === selected || (!selected && r === rows[0]) ? 0 : -1}
                className={`ed-row${r.key === selected ? ' on' : ''}${r.muted ? ' muted' : ''}`}
                onClick={() => onSelect(r.key)}
              >
                {r.lead && <span className="lead">{r.lead}</span>}
                <span className="body">
                  <span className="title">
                    {r.title}
                    {r.tag && <span className="ed-tag">{r.tag}</span>}
                  </span>
                  {r.subtitle && <span className="sub">{r.subtitle}</span>}
                </span>
                <span className="end">
                  {!!r.errors && <span className="ed-count error" title={`${r.errors} error(s)`}>{r.errors}</span>}
                  {!!r.warnings && <span className="ed-count warning" title={`${r.warnings} warning(s)`}>{r.warnings}</span>}
                  {r.meta && <span className="meta">{r.meta}</span>}
                </span>
              </button>
            </div>
          );
        })}
      </div>
      {footer && <div className="ed-list-foot">{footer}</div>}
    </aside>
  );
}

/** A compact filter chip toggle. */
export function Chip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button type="button" className={`ed-chip${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick} title={title}>
      {children}
    </button>
  );
}
