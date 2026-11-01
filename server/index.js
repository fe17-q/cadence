import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import fs from 'node:fs';
import { one, all, run, id, token, tx } from './db.js';
import { encrypt, decrypt, normalizeBaseUrl, listCourses, syncTeam, syncAll } from './canvas.js';
import { notifyUser, runReminders, vapidPublicKey } from './notify.js';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const PALETTE = ['#C9A96E', '#8FA6C9', '#B98AA6', '#7FB0A0', '#C98F7A', '#A49BD1', '#D1B07F', '#8CB7C9'];
const SESSION_DAYS = 120;

// ---------- helpers ----------
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (msg, status = 400) => { throw new HttpError(status, msg); };
const publicUser = u => u && ({ id: u.id, name: u.name, email: u.email, color: u.color });

function startSession(res, userId) {
  const t = token();
  run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)', t, userId, Date.now() + SESSION_DAYS * 864e5);
  res.cookie('sid', t, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: SESSION_DAYS * 864e5 });
}

function auth(req, res, next) {
  const t = req.cookies.sid;
  const s = t && one('SELECT * FROM sessions WHERE token=? AND expires_at > ?', t, Date.now());
  if (!s) return res.status(401).json({ error: 'Please sign in' });
  req.user = one('SELECT * FROM users WHERE id=?', s.user_id);
  if (!req.user) return res.status(401).json({ error: 'Please sign in' });
  next();
}

function member(teamId, userId) {
  const m = one('SELECT * FROM memberships WHERE team_id=? AND user_id=?', teamId, userId);
  if (!m) bad('You are not on this team', 403);
  return m;
}
const teamOfAssignment = aid => one('SELECT * FROM assignments WHERE id=?', aid) || bad('Assignment not found', 404);
const taskOrThrow = tid => one('SELECT * FROM tasks WHERE id=?', tid) || bad('Task not found', 404);

const attempts = new Map();
function throttle(key) {
  const now = Date.now();
  const a = (attempts.get(key) || []).filter(t => now - t < 15 * 60e3);
  if (a.length >= 20) bad('Too many attempts. Try again in a few minutes.', 429);
  a.push(now); attempts.set(key, a);
}

function joinTeam(teamId, userId, role = 'member') {
  run('INSERT OR IGNORE INTO memberships (team_id, user_id, role) VALUES (?,?,?)', teamId, userId, role);
}

function teamSummary(t, userId) {
  const m = one('SELECT role FROM memberships WHERE team_id=? AND user_id=?', t.id, userId);
  return {
    id: t.id, name: t.name, role: m?.role, invite_code: t.invite_code,
    canvas: {
      mode: t.canvas_token ? 'token' : t.ical_url ? 'ical' : null,
      base_url: t.canvas_base_url, course_ids: JSON.parse(t.canvas_course_ids || '[]'),
      ical_filter: t.ical_filter, last_synced_at: t.last_synced_at, error: t.sync_error,
    },
  };
}

// ---------- auth ----------
app.post('/api/auth/signup', wrap(async (req, res) => {
  throttle('signup:' + req.ip);
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!name) bad('What should we call you?');
  if (!/^\S+@\S+\.\S+$/.test(email)) bad('That email doesn\'t look quite right');
  if (password.length < 6) bad('Use at least 6 characters for your password');
  if (one('SELECT 1 FROM users WHERE email=?', email)) bad('There\'s already an account with that email. Try signing in.');
  const uid = id();
  const n = one('SELECT COUNT(*) n FROM users').n;
  run('INSERT INTO users (id, name, email, pw_hash, color) VALUES (?,?,?,?,?)', uid, name, email, await bcrypt.hash(password, 10), PALETTE[n % PALETTE.length]);
  let teamId = null;
  if (req.body.invite) {
    const t = one('SELECT * FROM teams WHERE invite_code=?', req.body.invite);
    if (t) { joinTeam(t.id, uid); teamId = t.id; }
  }
  startSession(res, uid);
  res.json({ ok: true, teamId });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  throttle('login:' + req.ip);
  const email = String(req.body.email || '').trim().toLowerCase();
  const u = one('SELECT * FROM users WHERE email=?', email);
  if (!u || !(await bcrypt.compare(String(req.body.password || ''), u.pw_hash))) bad('That email and password don\'t match', 401);
  let teamId = null;
  if (req.body.invite) {
    const t = one('SELECT * FROM teams WHERE invite_code=?', req.body.invite);
    if (t) { joinTeam(t.id, u.id); teamId = t.id; }
  }
  startSession(res, u.id);
  res.json({ ok: true, teamId });
}));

app.post('/api/auth/logout', (req, res) => {
  if (req.cookies.sid) run('DELETE FROM sessions WHERE token=?', req.cookies.sid);
  res.clearCookie('sid'); res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => {
  const teams = all('SELECT t.* FROM teams t JOIN memberships m ON m.team_id=t.id WHERE m.user_id=? ORDER BY m.joined_at', req.user.id);
  const unread = one('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read=0', req.user.id).n;
  res.json({ user: publicUser(req.user), teams: teams.map(t => teamSummary(t, req.user.id)), unread });
});

app.patch('/api/me', auth, wrap(async (req, res) => {
  const name = req.body.name != null ? String(req.body.name).trim() : null;
  if (name) run('UPDATE users SET name=? WHERE id=?', name, req.user.id);
  if (req.body.color && PALETTE.includes(req.body.color)) run('UPDATE users SET color=? WHERE id=?', req.body.color, req.user.id);
  res.json({ user: publicUser(one('SELECT * FROM users WHERE id=?', req.user.id)) });
}));

// ---------- invites & teams ----------
app.get('/api/invite/:code', (req, res) => {
  const t = one('SELECT * FROM teams WHERE invite_code=?', req.params.code);
  if (!t) return res.status(404).json({ error: 'This invite link is no longer valid. Ask your teammate for a fresh one.' });
  const members = all('SELECT u.name, u.color FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.team_id=?', t.id);
  res.json({ team: { id: t.id, name: t.name }, members });
});

app.post('/api/invite/:code/join', auth, (req, res) => {
  const t = one('SELECT * FROM teams WHERE invite_code=?', req.params.code);
  if (!t) return res.status(404).json({ error: 'This invite link is no longer valid' });
  joinTeam(t.id, req.user.id);
  res.json({ teamId: t.id });
});

app.post('/api/teams', auth, (req, res) => {
  const name = String(req.body.name || '').trim() || 'Senior Design';
  const tid = id();
  tx(() => {
    run('INSERT INTO teams (id, name, invite_code, tz) VALUES (?,?,?,?)', tid, name, token(9), validTz(req.body.tz));
    joinTeam(tid, req.user.id, 'owner');
  });
  res.json({ team: teamSummary(one('SELECT * FROM teams WHERE id=?', tid), req.user.id) });
});

app.patch('/api/teams/:tid', auth, (req, res) => {
  member(req.params.tid, req.user.id);
  const name = String(req.body.name || '').trim();
  if (name) run('UPDATE teams SET name=? WHERE id=?', name, req.params.tid);
  res.json({ team: teamSummary(one('SELECT * FROM teams WHERE id=?', req.params.tid), req.user.id) });
});

app.post('/api/teams/:tid/invite/reset', auth, (req, res) => {
  const m = member(req.params.tid, req.user.id);
  if (m.role !== 'owner') bad('Only the team owner can reset the invite link', 403);
  run('UPDATE teams SET invite_code=? WHERE id=?', token(9), req.params.tid);
  res.json({ team: teamSummary(one('SELECT * FROM teams WHERE id=?', req.params.tid), req.user.id) });
});

app.delete('/api/teams/:tid/members/:uid', auth, (req, res) => {
  const m = member(req.params.tid, req.user.id);
  if (req.params.uid !== req.user.id && m.role !== 'owner') bad('Only the owner can remove teammates', 403);
  run('DELETE FROM memberships WHERE team_id=? AND user_id=?', req.params.tid, req.params.uid);
  run(`UPDATE tasks SET assignee_id=NULL WHERE assignee_id=? AND assignment_id IN (SELECT id FROM assignments WHERE team_id=?)`, req.params.uid, req.params.tid);
  res.json({ ok: true });
});

// Everything the app needs for one team in a single round trip.
app.get('/api/teams/:tid/board', auth, (req, res) => {
  member(req.params.tid, req.user.id);
  const team = one('SELECT * FROM teams WHERE id=?', req.params.tid);
  const members = all(`SELECT u.id, u.name, u.email, u.color, m.role FROM users u JOIN memberships m ON m.user_id=u.id
                       WHERE m.team_id=? ORDER BY m.joined_at`, team.id);
  const assignments = all('SELECT * FROM assignments WHERE team_id=? ORDER BY due_at IS NULL, due_at', team.id)
    .map(a => ({ ...a, attachments: JSON.parse(a.attachments || '[]') }));
  const tasks = all(`SELECT k.* FROM tasks k JOIN assignments a ON a.id=k.assignment_id WHERE a.team_id=? ORDER BY k.position, k.created_at`, team.id)
    .map(k => ({ ...k, done: !!k.done }));
  res.json({ team: teamSummary(team, req.user.id), members, assignments, tasks });
});

// ---------- Canvas ----------
app.post('/api/teams/:tid/canvas/courses', auth, wrap(async (req, res) => {
  member(req.params.tid, req.user.id);
  const team = one('SELECT * FROM teams WHERE id=?', req.params.tid);
  const base = normalizeBaseUrl(req.body.base_url || team.canvas_base_url);
  const tk = String(req.body.token || '').trim() || decrypt(team.canvas_token);
  if (!tk) bad('Paste your Canvas access token');
  try { res.json({ base_url: base, courses: await listCourses(base, tk) }); }
  catch (e) { bad(e.message.includes('rejected') ? e.message : `Couldn't reach Canvas at ${base}. Double-check the address.`); }
}));

app.post('/api/teams/:tid/canvas', auth, wrap(async (req, res) => {
  member(req.params.tid, req.user.id);
  const team = one('SELECT * FROM teams WHERE id=?', req.params.tid);
  const base = normalizeBaseUrl(req.body.base_url);
  const tk = String(req.body.token || '').trim() || decrypt(team.canvas_token);
  const courses = (req.body.course_ids || []).map(String);
  if (!tk) bad('Paste your Canvas access token');
  if (!courses.length) bad('Pick at least one course');
  run('UPDATE teams SET canvas_base_url=?, canvas_token=?, canvas_course_ids=?, ical_url=NULL, sync_error=NULL WHERE id=?',
    base, encrypt(tk), JSON.stringify(courses), team.id);
  const result = await syncTeam(team.id, { quiet: true });
  res.json({ result, team: teamSummary(one('SELECT * FROM teams WHERE id=?', team.id), req.user.id) });
}));

app.post('/api/teams/:tid/ical', auth, wrap(async (req, res) => {
  member(req.params.tid, req.user.id);
  const url = String(req.body.url || '').trim();
  if (!/^(https?|webcal):\/\//i.test(url)) bad('Paste the full calendar feed link from Canvas');
  run('UPDATE teams SET ical_url=?, ical_filter=?, canvas_token=NULL, canvas_course_ids=NULL, sync_error=NULL WHERE id=?',
    url, String(req.body.filter || '').trim() || null, req.params.tid);
  const result = await syncTeam(req.params.tid, { quiet: true });
  res.json({ result, team: teamSummary(one('SELECT * FROM teams WHERE id=?', req.params.tid), req.user.id) });
}));

app.delete('/api/teams/:tid/canvas', auth, (req, res) => {
  member(req.params.tid, req.user.id);
  run('UPDATE teams SET canvas_token=NULL, canvas_course_ids=NULL, ical_url=NULL, ical_filter=NULL, sync_error=NULL WHERE id=?', req.params.tid);
  res.json({ team: teamSummary(one('SELECT * FROM teams WHERE id=?', req.params.tid), req.user.id) });
});

app.post('/api/teams/:tid/sync', auth, wrap(async (req, res) => {
  member(req.params.tid, req.user.id);
  const result = await syncTeam(req.params.tid);
  res.json({ result, team: teamSummary(one('SELECT * FROM teams WHERE id=?', req.params.tid), req.user.id) });
}));

// ---------- assignments ----------
app.post('/api/teams/:tid/assignments', auth, (req, res) => {
  member(req.params.tid, req.user.id);
  const title = String(req.body.title || '').trim() || bad('Give it a name');
  const aid = id();
  run(`INSERT INTO assignments (id, team_id, source, external_id, title, description_html, due_at) VALUES (?,?,?,?,?,?,?)`,
    aid, req.params.tid, 'manual', aid, title, req.body.description ? escapeHtml(req.body.description).replace(/\n/g, '<br>') : '', req.body.due_at || null);
  res.json({ assignment: { ...one('SELECT * FROM assignments WHERE id=?', aid), attachments: [] } });
});

app.patch('/api/assignments/:aid', auth, (req, res) => {
  const a = teamOfAssignment(req.params.aid);
  member(a.team_id, req.user.id);
  if (a.source !== 'manual') bad('Canvas assignments update automatically from Canvas');
  const title = req.body.title != null ? String(req.body.title).trim() : a.title;
  const due = req.body.due_at !== undefined ? req.body.due_at : a.due_at;
  run(`UPDATE assignments SET title=?, due_at=?, updated_at=datetime('now') WHERE id=?`, title || a.title, due, a.id);
  res.json({ assignment: { ...one('SELECT * FROM assignments WHERE id=?', a.id), attachments: [] } });
});

app.delete('/api/assignments/:aid', auth, (req, res) => {
  const a = teamOfAssignment(req.params.aid);
  member(a.team_id, req.user.id);
  if (a.source !== 'manual') bad('Canvas assignments can\'t be deleted here');
  run('DELETE FROM assignments WHERE id=?', a.id);
  res.json({ ok: true });
});

// ---------- tasks ----------
async function announceAssignment(task, actor) {
  if (!task.assignee_id || task.assignee_id === actor.id) return;
  const a = one('SELECT title FROM assignments WHERE id=?', task.assignment_id);
  await notifyUser(task.assignee_id, {
    title: `${actor.name.split(' ')[0]} assigned you a task`,
    body: `${task.title} · ${a.title}`,
    url: `/a/${task.assignment_id}?task=${task.id}`,
  });
}

app.post('/api/assignments/:aid/tasks', auth, wrap(async (req, res) => {
  const a = teamOfAssignment(req.params.aid);
  member(a.team_id, req.user.id);
  const title = String(req.body.title || '').trim() || bad('Name the task');
  const parent = req.body.parent_id ? taskOrThrow(req.body.parent_id) : null;
  if (parent && parent.assignment_id !== a.id) bad('Parent task belongs to another assignment');
  const assignee = req.body.assignee_id || null;
  if (assignee) member(a.team_id, assignee);
  const pos = (one('SELECT MAX(position) p FROM tasks WHERE assignment_id=? AND parent_id IS ?', a.id, parent?.id ?? null).p ?? 0) + 1;
  const kid = id();
  run(`INSERT INTO tasks (id, assignment_id, parent_id, title, assignee_id, due_at, position, created_by) VALUES (?,?,?,?,?,?,?,?)`,
    kid, a.id, parent?.id ?? null, title, assignee, req.body.due_at || null, pos, req.user.id);
  const task = one('SELECT * FROM tasks WHERE id=?', kid);
  await announceAssignment(task, req.user);
  res.json({ task: { ...task, done: !!task.done } });
}));

app.patch('/api/tasks/:id', auth, wrap(async (req, res) => {
  const k = taskOrThrow(req.params.id);
  const a = teamOfAssignment(k.assignment_id);
  member(a.team_id, req.user.id);
  const b = req.body;
  const next = {
    title: b.title != null ? String(b.title).trim() || k.title : k.title,
    notes: b.notes !== undefined ? b.notes : k.notes,
    assignee_id: b.assignee_id !== undefined ? (b.assignee_id || null) : k.assignee_id,
    due_at: b.due_at !== undefined ? (b.due_at || null) : k.due_at,
    done: b.done !== undefined ? (b.done ? 1 : 0) : k.done,
    position: b.position ?? k.position,
  };
  if (next.assignee_id && next.assignee_id !== k.assignee_id) member(a.team_id, next.assignee_id);
  run(`UPDATE tasks SET title=?, notes=?, assignee_id=?, due_at=?, done=?, done_at=CASE WHEN ?=1 AND done=0 THEN datetime('now') WHEN ?=0 THEN NULL ELSE done_at END, position=? WHERE id=?`,
    next.title, next.notes, next.assignee_id, next.due_at, next.done, next.done, next.done, next.position, k.id);
  const task = one('SELECT * FROM tasks WHERE id=?', k.id);
  if (task.assignee_id !== k.assignee_id) await announceAssignment(task, req.user);
  res.json({ task: { ...task, done: !!task.done } });
}));

app.delete('/api/tasks/:id', auth, (req, res) => {
  const k = taskOrThrow(req.params.id);
  member(teamOfAssignment(k.assignment_id).team_id, req.user.id);
  run('DELETE FROM tasks WHERE id=?', k.id);
  res.json({ ok: true });
});

// ---------- notifications & push ----------
app.get('/api/notifications', auth, (req, res) => {
  res.json({ items: all('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 60', req.user.id).map(n => ({ ...n, read: !!n.read })) });
});
app.post('/api/notifications/read', auth, (req, res) => {
  run('UPDATE notifications SET read=1 WHERE user_id=?', req.user.id); res.json({ ok: true });
});
app.get('/api/push/key', (req, res) => res.json({ key: vapidPublicKey }));
app.post('/api/push/subscribe', auth, (req, res) => {
  const s = req.body.subscription;
  if (!s?.endpoint || !s?.keys) bad('Invalid subscription');
  run(`INSERT INTO push_subscriptions (endpoint, user_id, keys) VALUES (?,?,?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, keys=excluded.keys`, s.endpoint, req.user.id, JSON.stringify(s.keys));
  res.json({ ok: true });
});
app.post('/api/push/unsubscribe', auth, (req, res) => {
  run('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?', String(req.body.endpoint || ''), req.user.id); res.json({ ok: true });
});
app.post('/api/push/test', auth, wrap(async (req, res) => {
  await notifyUser(req.user.id, { title: 'You\'re all set ✨', body: 'Reminders will show up right here.', url: '/' });
  res.json({ ok: true });
}));

function validTz(tz) {
  try { if (tz) { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } } catch { /* invalid */ }
  return 'America/New_York';
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  if (!(err instanceof HttpError)) console.error(err);
  res.status(err.status || 500).json({ error: err instanceof HttpError ? err.message : (err.message || 'Something went wrong') });
});

// ---------- static web app ----------
const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h', setHeaders: (res, p) => { if (p.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache'); } }));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`Cadence running on http://localhost:${PORT}`));

// ---------- background jobs ----------
const SYNC_HOURS = Number(process.env.SYNC_HOURS || 3);
setInterval(() => syncAll().catch(e => console.warn(e)), SYNC_HOURS * 3600e3);
setTimeout(() => syncAll().catch(e => console.warn(e)), 15e3);
setInterval(() => runReminders().catch(e => console.warn(e)), 10 * 60e3);
setTimeout(() => runReminders().catch(e => console.warn(e)), 20e3);
setInterval(() => run('DELETE FROM sessions WHERE expires_at < ?', Date.now()), 6 * 3600e3);
