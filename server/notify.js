// Notifications: an in-app inbox plus Web Push (works on Android, desktop, and iOS 16.4+ once installed to the home screen).
import webpush from 'web-push';
import { one, all, run, id, kvGet, kvSet } from './db.js';

function vapid() {
  let pub = process.env.VAPID_PUBLIC_KEY || kvGet('vapid_public');
  let priv = process.env.VAPID_PRIVATE_KEY || kvGet('vapid_private');
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    pub = k.publicKey; priv = k.privateKey;
    kvSet('vapid_public', pub); kvSet('vapid_private', priv);
  }
  return { pub, priv };
}
const keys = vapid();
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:cadence@example.com', keys.pub, keys.priv);
export const vapidPublicKey = keys.pub;

export async function notifyUser(userId, { title, body, url }) {
  run('INSERT INTO notifications (id, user_id, title, body, url) VALUES (?,?,?,?,?)', id(), userId, title, body || '', url || '/');
  const subs = all('SELECT * FROM push_subscriptions WHERE user_id=?', userId);
  const payload = JSON.stringify({ title, body, url: url || '/' });
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: JSON.parse(s.keys) }, payload, { TTL: 60 * 60 * 12 });
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) run('DELETE FROM push_subscriptions WHERE endpoint=?', s.endpoint);
      else console.warn('push failed', e.statusCode, e.body || e.message);
    }
  }));
}

export async function notifyTeam(teamId, msg, { except } = {}) {
  const members = all('SELECT user_id FROM memberships WHERE team_id=?', teamId);
  for (const m of members) if (m.user_id !== except) await notifyUser(m.user_id, msg);
}

const once = key => {
  if (one('SELECT 1 FROM sent_reminders WHERE key=?', key)) return false;
  run('INSERT INTO sent_reminders(key) VALUES (?)', key);
  return true;
};

const H = 3600 * 1000;
const fmtWhen = (iso, tz) => new Date(iso).toLocaleString('en-US', {
  weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: tz || 'America/New_York',
});

// Thresholds, most urgent first. Only the most urgent one that applies is sent.
const ASSIGNMENT_STEPS = [
  { h: 3, label: () => 'Due in a few hours' },
  { h: 24, label: () => 'Due tomorrow' },
  { h: 72, label: () => 'Due in 3 days' },
];

export async function runReminders(now = Date.now()) {
  const upcoming = all(`SELECT a.*, t.tz AS tz FROM assignments a JOIN teams t ON t.id = a.team_id
                        WHERE a.due_at IS NOT NULL AND a.due_at > ? AND a.due_at < ?`,
    new Date(now).toISOString(), new Date(now + 72 * H).toISOString());

  for (const a of upcoming) {
    const left = new Date(a.due_at).getTime() - now;
    const idx = ASSIGNMENT_STEPS.findIndex(s => left <= s.h * H);
    if (idx < 0) continue;
    // mark this and all less-urgent steps; send only if this one is new
    const fresh = once(`a:${a.id}:${a.due_at}:${ASSIGNMENT_STEPS[idx].h}`);
    for (const s of ASSIGNMENT_STEPS.slice(idx + 1)) once(`a:${a.id}:${a.due_at}:${s.h}`);
    if (!fresh) continue;
    const open = one('SELECT COUNT(*) n FROM tasks WHERE assignment_id=? AND done=0', a.id).n;
    const tail = open ? ` · ${open} task${open > 1 ? 's' : ''} still open` : '';
    await notifyTeam(a.team_id, { title: `${ASSIGNMENT_STEPS[idx].label()}: ${a.title}`, body: `Due ${fmtWhen(a.due_at, a.tz)}${tail}`, url: `/a/${a.id}` });
  }

  // Personal task reminders: 24h before the task's own due date (or the assignment's).
  const tasks = all(`SELECT k.*, COALESCE(k.due_at, a.due_at) AS eff_due, a.title AS a_title, t.tz AS tz
                     FROM tasks k JOIN assignments a ON a.id = k.assignment_id JOIN teams t ON t.id = a.team_id
                     WHERE k.done = 0 AND k.assignee_id IS NOT NULL
                       AND COALESCE(k.due_at, a.due_at) > ? AND COALESCE(k.due_at, a.due_at) < ?`,
    new Date(now).toISOString(), new Date(now + 24 * H).toISOString());
  for (const k of tasks) {
    if (!once(`t:${k.id}:${k.eff_due}:${k.assignee_id}`)) continue;
    await notifyUser(k.assignee_id, { title: `Your task is due soon`, body: `${k.title} · ${k.a_title} · ${fmtWhen(k.eff_due, k.tz)}`, url: `/a/${k.assignment_id}?task=${k.id}` });
  }
}
