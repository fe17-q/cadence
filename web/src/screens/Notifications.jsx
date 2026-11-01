import { useEffect, useState } from 'react';
import { get, post } from '../api.js';
import { useStore } from '../store.jsx';
import { Button, Empty, Icon, Sheet } from '../ui.jsx';

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function urlB64ToUint8(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export function usePush() {
  const [state, setState] = useState('checking'); // checking | unsupported | needs-install | off | on | denied
  useEffect(() => {
    (async () => {
      if (!pushSupported()) return setState(isIOS() && !isStandalone() ? 'needs-install' : 'unsupported');
      if (Notification.permission === 'denied') return setState('denied');
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub && Notification.permission === 'granted' ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, []);

  async function enable() {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'off'); return false; }
    const reg = await navigator.serviceWorker.ready;
    const { key } = await get('/push/key');
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(key) });
    await post('/push/subscribe', { subscription: sub.toJSON() });
    setState('on');
    return true;
  }
  async function disable() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await post('/push/unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
    setState('off');
  }
  return { state, enable, disable };
}

export function InstallHint() {
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('hideInstall') === '1'; } catch { return false; } });
  if (hidden || isStandalone() || !isIOS()) return null;
  return (
    <div className="install fade-up">
      <img src="/icon.svg" alt="" className="install__icon" />
      <p>Add Cadence to your Home Screen to get deadline reminders. Tap <Icon name="share" size={15} /> then <strong>Add to Home Screen</strong>.</p>
      <button className="icon-btn icon-btn--sm" aria-label="Dismiss" onClick={() => { setHidden(true); try { localStorage.setItem('hideInstall', '1'); } catch { /* ignore */ } }}><Icon name="x" size={16} /></button>
    </div>
  );
}

// Gentle one-time nudge to turn on notifications after the user is settled in.
export function PushNudge() {
  const { board, toast } = useStore();
  const push = usePush();
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem('pushNudge') === '1'; } catch { return false; } });
  if (dismissed || push.state !== 'off' || !board?.assignments?.length) return null;
  const close = () => { setDismissed(true); try { localStorage.setItem('pushNudge', '1'); } catch { /* ignore */ } };
  return (
    <div className="nudge fade-up">
      <span className="setup__icon"><Icon name="bell" /></span>
      <div className="nudge__text"><strong>Never miss a deadline</strong><span>Get a heads-up 3 days, 1 day, and a few hours before anything is due.</span></div>
      <div className="nudge__actions">
        <Button onClick={async () => { if (await push.enable()) { toast('Reminders are on ✨'); close(); } }}>Turn on</Button>
        <button className="link-btn" onClick={close}>Not now</button>
      </div>
    </div>
  );
}

export function Inbox({ open, onClose }) {
  const { navigate, loadMe } = useStore();
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (!open) return;
    get('/notifications').then(r => { setItems(r.items); post('/notifications/read').then(loadMe); });
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title="Updates" tall>
      {!items ? null : items.length === 0 ? (
        <Empty icon="bell" title="All quiet">New assignments, reminders, and tasks people hand you will show up here.</Empty>
      ) : (
        <ul className="inbox">
          {items.map(n => (
            <li key={n.id} className={`inbox__item ${n.read ? '' : 'is-new'}`} onClick={() => { onClose(); navigate(n.url || '/'); }}>
              <span className="inbox__dot" />
              <div><strong>{n.title}</strong><span>{n.body}</span>
                <time>{new Date(n.created_at + 'Z').toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></div>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
