import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { initials } from './util.js';

const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 18l-6-6 6-6',
  chev: 'M9 18l6-6-6-6',
  down: 'M6 9l6 6 6-6',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  link: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  sync: 'M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5',
  copy: 'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
  trash: 'M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
  sparkle: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  key: 'M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  sub: 'M6 3v12a3 3 0 0 0 3 3h11M16 14l4 4-4 4',
  note: 'M4 6h16M4 12h16M4 18h10',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
};

export function Icon({ name, size = 20, stroke = 1.6, className = '', style }) {
  return (
    <svg className={`icon ${className}`} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Avatar({ user, size = 28, ring = false, title }) {
  if (!user) {
    return <span className="avatar avatar--empty" style={{ width: size, height: size }} title={title || 'Unassigned'}>
      <Icon name="user" size={size * 0.5} />
    </span>;
  }
  return (
    <span className={`avatar ${ring ? 'avatar--ring' : ''}`} title={title || user.name}
      style={{ width: size, height: size, fontSize: size * 0.38, '--c': user.color }}>
      {initials(user.name)}
    </span>
  );
}

export function AvatarStack({ users, size = 24, max = 4 }) {
  if (!users?.length) return null;
  const shown = users.slice(0, max);
  return (
    <span className="avatar-stack">
      {shown.map(u => <Avatar key={u.id} user={u} size={size} ring />)}
      {users.length > max && <span className="avatar avatar--more" style={{ width: size, height: size, fontSize: size * 0.36 }}>+{users.length - max}</span>}
    </span>
  );
}

export function Ring({ pct = 0, size = 34, stroke = 3, children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const complete = pct >= 1;
  return (
    <span className={`ring ${complete ? 'ring--done' : ''}`} style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring__track" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} className="ring__bar" strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, pct))} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="ring__label">{complete ? <Icon name="check" size={size * 0.42} stroke={2.2} /> : children}</span>
    </span>
  );
}

export function Check({ checked, onChange, size = 24, label }) {
  const [pop, setPop] = useState(false);
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label || (checked ? 'Mark not done' : 'Mark done')}
      className={`check ${checked ? 'check--on' : ''} ${pop ? 'check--pop' : ''}`} style={{ width: size, height: size }}
      onClick={e => {
        e.stopPropagation();
        if (!checked) { setPop(true); setTimeout(() => setPop(false), 500); navigator.vibrate?.(12); }
        onChange(!checked);
      }}>
      <Icon name="check" size={size * 0.6} stroke={2.6} />
    </button>
  );
}

export function Button({ variant = 'primary', loading, children, className = '', ...rest }) {
  return (
    <button className={`btn btn--${variant} ${loading ? 'is-loading' : ''} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Spinner /> : children}
    </button>
  );
}

export const Spinner = ({ size = 18 }) => <span className="spinner" style={{ width: size, height: size }} />;

export function Sheet({ open, onClose, title, children, footer, tall = false }) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const panel = useRef(null);
  useEffect(() => {
    if (open) { setMounted(true); requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true))); }
    else { setVisible(false); const t = setTimeout(() => setMounted(false), 320); return () => clearTimeout(t); }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = e => e.key === 'Escape' && onClose?.();
    addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => { removeEventListener('keydown', onKey); document.body.classList.remove('no-scroll'); };
  }, [open, onClose]);

  // swipe down to dismiss
  const drag = useRef(null);
  const onTouchStart = e => {
    if (panel.current.scrollTop > 0) return;
    drag.current = { y: e.touches[0].clientY, dy: 0 };
  };
  const onTouchMove = e => {
    if (!drag.current) return;
    const dy = Math.max(0, e.touches[0].clientY - drag.current.y);
    drag.current.dy = dy;
    panel.current.style.transform = `translateY(${dy}px)`;
    panel.current.style.transition = 'none';
  };
  const onTouchEnd = () => {
    if (!drag.current) return;
    const { dy } = drag.current; drag.current = null;
    panel.current.style.transition = '';
    panel.current.style.transform = '';
    if (dy > 110) onClose?.();
  };

  if (!mounted) return null;
  return createPortal(
    <div className={`sheet ${visible ? 'is-open' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet__scrim" onClick={onClose} />
      <div className={`sheet__panel ${tall ? 'sheet__panel--tall' : ''}`} ref={panel}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <div className="sheet__grab" />
        {title && <div className="sheet__head">
          <h2 className="sheet__title">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>}
        <div className="sheet__body">{children}</div>
        {footer && <div className="sheet__foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function MemberPicker({ members, value, onChange, allowNone = true }) {
  return (
    <div className="picker">
      {allowNone && (
        <button type="button" className={`picker__opt ${!value ? 'is-on' : ''}`} onClick={() => onChange(null)}>
          <Avatar user={null} size={36} /><span>Anyone</span>
        </button>
      )}
      {members.map(m => (
        <button type="button" key={m.id} className={`picker__opt ${value === m.id ? 'is-on' : ''}`} onClick={() => onChange(m.id)}>
          <Avatar user={m} size={36} /><span>{m.name.split(' ')[0]}</span>
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon = 'sparkle', title, children, action }) {
  return (
    <div className="empty">
      <div className="empty__icon"><Icon name={icon} size={22} /></div>
      <h3 className="empty__title">{title}</h3>
      {children && <p className="empty__text">{children}</p>}
      {action}
    </div>
  );
}

export function Toasts({ toasts }) {
  return createPortal(
    <div className="toasts" aria-live="polite">
      {toasts.map(t => <div key={t.id} className={`toast toast--${t.tone || 'info'}`}>{t.text}</div>)}
    </div>,
    document.body,
  );
}
