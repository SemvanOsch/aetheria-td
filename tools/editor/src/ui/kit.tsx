/**
 * The editor's form and layout kit: labelled fields that show their own
 * validation issues, number/colour/text inputs that commit through the store,
 * dialogs with focus handling, and small layout pieces. Independent of the
 * game's UI components.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';
import { ConfirmCtx, IssueCtx, useFieldIssues, type ConfirmOptions } from './kitHooks';
import type { Issue } from '../validation/validate';
import type { NumField } from '../model/catalog';
import { rangeText } from '../model/catalog';
import { HEX_COLOR } from '../model/catalog';

// ----------------------------------------------------------------- buttons

type BtnTone = 'primary' | 'ghost' | 'danger' | 'plain' | 'subtle';

export function Button({
  children,
  icon,
  tone = 'ghost',
  size = 'md',
  onClick,
  disabled,
  title,
  type = 'button',
  className,
  ...rest
}: {
  children?: ReactNode;
  icon?: IconName | string;
  tone?: BtnTone;
  size?: 'sm' | 'md';
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
  className?: string;
  'aria-label'?: string;
  'aria-pressed'?: boolean;
  'aria-expanded'?: boolean;
}) {
  return (
    <button
      type={type}
      className={`ed-btn ${tone} ${size}${children ? '' : ' icon-only'}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={rest['aria-label'] ?? (!children ? title : undefined)}
      aria-pressed={rest['aria-pressed']}
      aria-expanded={rest['aria-expanded']}
    >
      {icon && <Icon name={icon} />}
      {children && <span>{children}</span>}
    </button>
  );
}

// ----------------------------------------------------------- issue context



/** Make an entity's issues available to the fields inside (matched by field path). */
export function IssueScopeProvider({ issues, children }: { issues: Issue[]; children: ReactNode }) {
  const value = useMemo(() => ({ issues }), [issues]);
  return <IssueCtx.Provider value={value}>{children}</IssueCtx.Provider>;
}


export function SeverityIcon({ severity }: { severity: Issue['severity'] }) {
  return (
    <span className={`ed-sev ${severity}`}>
      <Icon name={severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : 'info'} title={severity} />
    </span>
  );
}

/** A list of issues with their fixes. */
export function IssueList({ issues, compact = false, onPick }: { issues: Issue[]; compact?: boolean; onPick?: (i: Issue) => void }) {
  if (issues.length === 0) return null;
  return (
    <ul className={`ed-issues${compact ? ' compact' : ''}`}>
      {issues.map((i, n) => (
        <li key={n} className={i.severity}>
          <SeverityIcon severity={i.severity} />
          <div>
            {onPick ? (
              <button type="button" className="ed-link" onClick={() => onPick(i)}>
                {i.message}
              </button>
            ) : (
              <span className="msg">{i.message}</span>
            )}
            <span className="fix">{i.fix}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The issues of one field path, inline (for controls not wrapped in a `Field`). */
export function InlineIssues({ path, deep = false }: { path: string; deep?: boolean }) {
  const issues = useFieldIssues(path, deep);
  return <IssueList issues={issues} compact />;
}

// ------------------------------------------------------------------ fields

/**
 * Contextual help: an accessible "?" with a tooltip. The tooltip is portalled
 * and fixed-positioned so no scrolling pane or section clips it, and it is
 * kept inside the window (above the icon, or below it when there's no room).
 */
export function Help({ text }: { text: string }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    if (!open) return;
    // Place the tip beside the icon, inside the window; follow the icon as its pane scrolls.
    const place = () => {
      const el = tip.current;
      const a = anchor.current?.getBoundingClientRect();
      if (!el || !a) return;
      const t = el.getBoundingClientRect();
      const margin = 8;
      const gap = 6;
      const left = Math.max(margin, Math.min(a.left + a.width / 2 - t.width / 2, window.innerWidth - t.width - margin));
      const above = a.top - gap - t.height;
      const top = above >= margin ? above : Math.min(a.bottom + gap, window.innerHeight - t.height - margin);
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.visibility = 'visible';
    };
    place();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, text]);

  return (
    <span
      ref={anchor}
      className="ed-help"
      tabIndex={0}
      role="note"
      aria-label={text}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <Icon name="help" size={13} />
      {open &&
        createPortal(
          <div ref={tip} className="ed-tip" aria-hidden style={{ left: 0, top: 0, visibility: 'hidden' }}>
            {text}
          </div>,
          document.body,
        )}
    </span>
  );
}

/**
 * A labelled field: label, contextual help, the control, an optional hint, and
 * any validation issues for `path` (from the surrounding issue scope).
 */
export function Field({
  label,
  help,
  path,
  hint,
  children,
  wide,
  inline,
}: {
  label: string;
  help?: string;
  path?: string;
  hint?: ReactNode;
  children: (id: string, describedBy: string | undefined, invalid: boolean) => ReactNode;
  wide?: boolean;
  inline?: boolean;
}) {
  const id = useId();
  const issues = useFieldIssues(path);
  const invalid = issues.some((i) => i.severity === 'error');
  const describedBy = issues.length || hint ? `${id}-d` : undefined;
  return (
    <div className={`ed-field${wide ? ' wide' : ''}${inline ? ' inline' : ''}${invalid ? ' invalid' : ''}`} data-field={path}>
      <label htmlFor={id} className="ed-label">
        {label}
        {help && <Help text={help} />}
      </label>
      {children(id, describedBy, invalid)}
      {(hint || issues.length > 0) && (
        <div id={describedBy} className="ed-field-foot">
          {hint && <span className="ed-hint">{hint}</span>}
          <IssueList issues={issues} compact />
        </div>
      )}
    </div>
  );
}

const fmtNum = (n: number | undefined) => (n === undefined || Number.isNaN(n) ? '' : String(n));

/**
 * A number input that keeps its own text while typing and commits parsed
 * values. Empty means "unset" for optional fields (applied on blur). Arrow keys step (Shift ×10).
 */
export function NumberInput({
  value,
  onChange,
  spec,
  optional = false,
  placeholder,
  id,
  describedBy,
  invalid,
  ariaLabel,
  disabled,
  width,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  spec?: Partial<NumField>;
  optional?: boolean;
  placeholder?: string;
  id?: string;
  describedBy?: string;
  invalid?: boolean;
  ariaLabel?: string;
  disabled?: boolean;
  width?: number;
}) {
  const [text, setText] = useState(fmtNum(value));
  const [local, setLocal] = useState<string | null>(null);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current || Number(text) !== value) setText(fmtNum(value));
    // Only follow external changes (undo, other fields), not our own typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = (raw: string) => {
    setText(raw);
    const t = raw.trim().replace(',', '.');
    if (t === '') {
      // An optional field is only cleared on blur, so backspacing a value to
      // retype it doesn't drop the field mid-edit.
      setLocal(optional ? null : 'Required');
      return;
    }
    const n = Number(t);
    if (!Number.isFinite(n)) {
      setLocal('Not a number');
      return;
    }
    setLocal(null);
    if (n !== value) onChange(n);
  };

  const step = (dir: number, big: boolean) => {
    const s = (spec?.step ?? (spec?.kind === 'fraction' ? 0.05 : 1)) * (big ? 10 : 1);
    const cur = value ?? spec?.min ?? 0;
    let next = Math.round((cur + dir * s) * 1e6) / 1e6;
    if (spec?.min != null) next = Math.max(spec.min, next);
    if (spec?.max != null) next = Math.min(spec.max, next);
    commit(String(next));
  };

  return (
    <span className={`ed-num${invalid || local ? ' invalid' : ''}`} style={width ? { width } : undefined}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={invalid || !!local || undefined}
        aria-describedby={describedBy}
        title={local ?? (spec ? `Allowed: ${rangeText(spec as NumField)}` : undefined)}
        onFocus={() => (focused.current = true)}
        onBlur={(e) => {
          focused.current = false;
          if (optional && e.currentTarget.value.trim() === '') {
            if (value !== undefined) onChange(undefined);
          } else if (local) {
            setText(fmtNum(value));
            setLocal(null);
          }
        }}
        onChange={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            step(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
          }
        }}
      />
      {spec?.unit && <span className="unit">{spec.unit}</span>}
    </span>
  );
}

/** A number field from a descriptor: label, help, range hint and issues. */
export function NumField({
  spec,
  value,
  onChange,
  path,
  optional,
  placeholder,
  hint,
}: {
  spec: NumField;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  path?: string;
  optional?: boolean;
  placeholder?: string;
  hint?: ReactNode;
}) {
  const pct = spec.kind === 'fraction' && value !== undefined && value <= 1 ? `${Math.round(value * 1000) / 10}%` : null;
  return (
    <Field label={spec.label} help={`${spec.help} Allowed: ${rangeText(spec)}${spec.unit ? ` ${spec.unit}` : ''}.`} path={path ?? spec.key} hint={hint ?? pct}>
      {(id, d, invalid) => (
        <NumberInput id={id} describedBy={d} invalid={invalid} value={value} onChange={onChange} spec={spec} optional={optional} placeholder={placeholder} />
      )}
    </Field>
  );
}

export function TextInput({
  value,
  onChange,
  id,
  describedBy,
  invalid,
  placeholder,
  ariaLabel,
  mono,
  maxLength,
  onBlurCommit,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  describedBy?: string;
  invalid?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  mono?: boolean;
  maxLength?: number;
  /** Commit only on blur/Enter (ids, which re-key the entity). */
  onBlurCommit?: boolean;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      id={id}
      className={`ed-input${mono ? ' mono' : ''}`}
      type="text"
      value={onBlurCommit ? text : value}
      placeholder={placeholder}
      maxLength={maxLength}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      spellCheck={!mono}
      onChange={(e) => (onBlurCommit ? setText(e.target.value) : onChange(e.target.value))}
      onBlur={() => onBlurCommit && text !== value && onChange(text)}
      onKeyDown={(e) => {
        if (onBlurCommit && e.key === 'Enter') e.currentTarget.blur();
        if (onBlurCommit && e.key === 'Escape') setText(value);
      }}
    />
  );
}

export function TextArea({
  value,
  onChange,
  id,
  describedBy,
  invalid,
  rows = 3,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  describedBy?: string;
  invalid?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      id={id}
      className="ed-input"
      rows={rows}
      value={value}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  id,
  describedBy,
  invalid,
  ariaLabel,
  disabled,
}: {
  value: T;
  options: readonly { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  id?: string;
  describedBy?: string;
  invalid?: boolean;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const known = options.some((o) => o.value === value);
  return (
    <select
      id={id}
      className="ed-input ed-select"
      value={value}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {!known && <option value={value}>{value ? `${value} (missing)` : '— choose —'}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ checked, onChange, label, help, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; help?: string; id?: string }) {
  const auto = useId();
  return (
    <label className="ed-toggle" htmlFor={id ?? auto}>
      <input id={id ?? auto} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" aria-hidden="true">
        <span className="knob" />
      </span>
      <span className="text">{label}</span>
      {help && <Help text={help} />}
    </label>
  );
}

/** A colour swatch plus a hex field (Enter/blur commits; 3-digit shorthand expands). */
export function ColorInput({ value, onChange, id, ariaLabel }: { value: string; onChange: (v: string) => void; id?: string; ariaLabel?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = (raw: string) => {
    let v = raw.trim().toLowerCase();
    if (v && !v.startsWith('#')) v = `#${v}`;
    const short = /^#([0-9a-f]{3})$/.exec(v);
    if (short) v = `#${short[1].split('').map((c) => c + c).join('')}`;
    if (HEX_COLOR.test(v)) {
      if (v !== value) onChange(v);
    } else setText(value);
  };
  return (
    <span className="ed-color">
      <input type="color" value={HEX_COLOR.test(value) ? value : '#000000'} aria-label={`${ariaLabel ?? 'Colour'} picker`} onChange={(e) => onChange(e.target.value)} />
      <input
        id={id}
        className="ed-input mono"
        type="text"
        value={text}
        maxLength={7}
        spellCheck={false}
        aria-label={ariaLabel}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </span>
  );
}

/** A row of mutually exclusive choices (radio group). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = 'md',
}: {
  value: T;
  options: readonly { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
  size?: 'sm' | 'md';
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: ReactKeyboardEvent, i: number) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className={`ed-seg ${size}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          className={o.value === value ? 'on' : undefined}
          title={o.title}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ layout

export function Section({
  title,
  help,
  actions,
  children,
  id,
  issues,
}: {
  title: string;
  help?: string;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
  issues?: Issue[];
}) {
  const errs = issues?.filter((i) => i.severity === 'error').length ?? 0;
  const warns = issues?.filter((i) => i.severity === 'warning').length ?? 0;
  return (
    <section className="ed-section" id={id} aria-label={title}>
      <header>
        <h3>
          {title}
          {help && <Help text={help} />}
          {errs > 0 && <span className="ed-count error">{errs}</span>}
          {warns > 0 && <span className="ed-count warning">{warns}</span>}
        </h3>
        {actions && <div className="ed-section-actions">{actions}</div>}
      </header>
      <div className="ed-section-body">{children}</div>
    </section>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: IconName | string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ed-empty">
      <Icon name={icon} size={36} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  tabs,
  onChange,
  ariaLabel,
}: {
  value: T;
  tabs: readonly { id: T; label: string; icon?: IconName | string; badge?: ReactNode }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="ed-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          tabIndex={t.id === value ? 0 : -1}
          className={t.id === value ? 'on' : undefined}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => {
            const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (!dir) return;
            const next = (i + dir + tabs.length) % tabs.length;
            onChange(tabs[next].id);
            refs.current[next]?.focus();
          }}
        >
          {t.icon && <Icon name={t.icon} />}
          {t.label}
          {t.badge}
        </button>
      ))}
    </div>
  );
}

/** A labelled stat for summaries. */
export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'gold' | 'error' | 'ok' | 'muted' }) {
  return (
    <div className={`ed-stat${tone ? ` ${tone}` : ''}`}>
      <span className="v">{value}</span>
      <span className="l">{label}</span>
    </div>
  );
}

// ------------------------------------------------------------------ dialogs

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal dialog: portalled to <body>, traps Tab focus, closes on Escape or a
 * backdrop click, and returns focus to whatever opened it.
 */
export function Modal({
  title,
  children,
  onClose,
  footer,
  wide,
  labelledBy,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  wide?: boolean | 'xl';
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => opener?.focus?.();
  }, []);
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const nodes = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return createPortal(
    <div className="ed-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className={`ed-modal${wide === 'xl' ? ' xl' : wide ? ' wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? titleId}
        onKeyDown={onKey}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <Button icon="close" tone="plain" title="Close" onClick={onClose} />
        </header>
        <div className="ed-modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}




/** Provides `useConfirm()`: an accessible confirmation dialog for destructive actions. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setOpen({ ...o, resolve })), []);
  const close = (v: boolean) => {
    open?.resolve(v);
    setOpen(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {open && (
        <Modal
          title={open.title}
          onClose={() => close(false)}
          footer={
            <>
              {open.extra && (
                <Button icon="download" onClick={open.extra.run}>
                  {open.extra.label}
                </Button>
              )}
              <span className="grow" />
              <Button onClick={() => close(false)}>Cancel</Button>
              <Button tone={open.tone ?? 'danger'} onClick={() => close(true)}>
                {open.confirmLabel ?? 'Confirm'}
              </Button>
            </>
          }
        >
          <div className="ed-confirm-body">{open.body}</div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}



