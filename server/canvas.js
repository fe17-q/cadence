// Canvas sync: REST API with a personal access token, or the calendar iCal feed as a fallback.
import crypto from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import ical from 'node-ical';
import { one, all, run, id, tx, kvGet, kvSet } from './db.js';
import { notifyTeam } from './notify.js';

// ---------- token encryption at rest ----------
function secretKey() {
  let s = process.env.APP_SECRET || kvGet('app_secret');
  if (!s) { s = crypto.randomBytes(32).toString('base64'); kvSet('app_secret', s); }
  return crypto.createHash('sha256').update(s).digest();
}
export function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map(b => b.toString('base64')).join('.');
}
export function decrypt(blob) {
  if (!blob) return null;
  const [iv, tag, enc] = blob.split('.').map(s => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', secretKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

// ---------- helpers ----------
export function normalizeBaseUrl(input) {
  let u = String(input || '').trim();
  if (!u) throw new Error('Enter your Canvas address, like school.instructure.com');
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  const url = new URL(u);
  return `${url.protocol}//${url.host}`;
}

async function canvasFetch(base, token, path) {
  const out = [];
  let next = path.startsWith('http') ? path : `${base}${path}`;
  let pages = 0;
  while (next && pages < 20) {
    const res = await fetch(next, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    if (res.status === 401) throw new Error('Canvas rejected the access token. It may have expired; generate a new one in Canvas settings.');
    if (!res.ok) throw new Error(`Canvas returned ${res.status} for ${path}`);
    const data = await res.json();
    if (Array.isArray(data)) out.push(...data); else return data;
    const link = res.headers.get('link') || '';
    next = /<([^>]+)>;\s*rel="next"/.exec(link)?.[1] || null;
    pages++;
  }
  return out;
}

export async function listCourses(base, token) {
  const courses = await canvasFetch(base, token, '/api/v1/courses?enrollment_state=active&per_page=100&include[]=term');
  return courses
    .filter(c => c && c.name && !c.access_restricted_by_date)
    .map(c => ({ id: String(c.id), name: c.name, code: c.course_code, term: c.term?.name || null }));
}

const SANITIZE = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'span', 'u', 's', 'sup', 'sub']),
  allowedAttributes: { a: ['href', 'title'], img: ['src', 'alt', 'width', 'height'], '*': [] },
  transformTags: { a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener' }) },
  allowedSchemes: ['http', 'https', 'mailto'],
};

function absolutize(html, base) {
  return (html || '').replace(/(href|src)="\/(?!\/)/g, `$1="${base}/`);
}

// Files linked inside a description become first-class attachments.
function extractAttachments(html, base) {
  const found = new Map();
  const re = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html || ''))) {
    let href = m[1].replace(/&amp;/g, '&');
    if (href.startsWith('/')) href = base + href;
    const isFile = /\/files\/\d+/.test(href) || /^https:\/\/(docs|drive)\.google\.com\//.test(href) || /\.(pdf|docx?|pptx?|xlsx?|zip|png|jpe?g|csv|txt|mp4)(\?|$)/i.test(href);
    if (!isFile) continue;
    const name = decodeEntities(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim() || decodeURIComponent(href.split('/').pop().split('?')[0]);
    const clean = href.replace(/\/(download|preview)(\?.*)?$/, '').replace(/\?.*$/, '');
    if (!found.has(clean)) found.set(clean, { name, url: clean });
  }
  return [...found.values()];
}

function decodeEntities(s) {
  return s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' }[e]));
}

// Upsert one imported assignment. Returns 'new' | 'updated' | 'same'.
function upsert(teamId, a) {
  let existing = one('SELECT * FROM assignments WHERE team_id=? AND source=? AND external_id=?', teamId, a.source, a.external_id);
  // Switching from the calendar feed to a token: adopt the feed's row (uid "event-assignment-<id>") so tasks and docs carry over.
  if (!existing && a.source === 'canvas') {
    const fromFeed = one("SELECT * FROM assignments WHERE team_id=? AND source='ical' AND external_id=?", teamId, `event-assignment-${a.external_id}`);
    if (fromFeed) {
      run("UPDATE assignments SET source='canvas', external_id=? WHERE id=?", a.external_id, fromFeed.id);
      existing = { ...fromFeed, source: 'canvas', external_id: a.external_id };
    }
  }
  const attachments = JSON.stringify(a.attachments || []);
  if (!existing) {
    run(`INSERT INTO assignments (id, team_id, source, external_id, title, description_html, due_at, points, html_url, course_name, attachments)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      id(), teamId, a.source, a.external_id, a.title, a.description_html, a.due_at, a.points ?? null, a.html_url, a.course_name, attachments);
    return 'new';
  }
  const changed = existing.title !== a.title || existing.description_html !== a.description_html ||
    existing.due_at !== a.due_at || existing.attachments !== attachments || existing.html_url !== a.html_url;
  if (!changed) return 'same';
  run(`UPDATE assignments SET title=?, description_html=?, due_at=?, points=?, html_url=?, course_name=?, attachments=?, updated_at=datetime('now') WHERE id=?`,
    a.title, a.description_html, a.due_at, a.points ?? null, a.html_url, a.course_name, attachments, existing.id);
  return existing.due_at !== a.due_at ? 'rescheduled' : 'updated';
}

async function fetchFromApi(team) {
  const base = team.canvas_base_url;
  const tokenValue = decrypt(team.canvas_token);
  const courseIds = JSON.parse(team.canvas_course_ids || '[]');
  const items = [];
  for (const cid of courseIds) {
    const course = await canvasFetch(base, tokenValue, `/api/v1/courses/${cid}`);
    const list = await canvasFetch(base, tokenValue, `/api/v1/courses/${cid}/assignments?per_page=100&order_by=due_at`);
    for (const x of list) {
      if (x.published === false) continue;
      const raw = absolutize(x.description || '', base);
      items.push({
        source: 'canvas',
        external_id: String(x.id),
        title: x.name,
        description_html: sanitizeHtml(raw, SANITIZE),
        due_at: x.due_at ? new Date(x.due_at).toISOString() : null,
        points: x.points_possible,
        html_url: x.html_url,
        course_name: course?.course_code || course?.name || null,
        attachments: extractAttachments(raw, base),
      });
    }
  }
  return items;
}

async function fetchFromIcal(team) {
  const url = team.ical_url.replace(/^webcal:/i, 'https:');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Calendar link returned ${res.status}`);
  const data = ical.sync.parseICS(await res.text());
  const filter = (team.ical_filter || '').trim().toLowerCase();
  const items = [];
  for (const ev of Object.values(data)) {
    if (ev.type !== 'VEVENT') continue;
    const summary = String(ev.summary?.val ?? ev.summary ?? '');
    const course = /\[([^\]]+)\]\s*$/.exec(summary)?.[1] || null;
    if (filter && !summary.toLowerCase().includes(filter)) continue;
    const url = typeof ev.url === 'string' ? ev.url : ev.url?.val;
    const isAssignment = /assignment/i.test(String(ev.uid)) || /assignment/i.test(url || '');
    if (!isAssignment) continue;
    const desc = String(ev.description?.val ?? ev.description ?? '');
    items.push({
      source: 'ical',
      external_id: String(ev.uid),
      title: summary.replace(/\s*\[[^\]]+\]\s*$/, ''),
      description_html: desc ? sanitizeHtml(desc.replace(/\n/g, '<br>'), SANITIZE) : '',
      due_at: ev.start ? new Date(ev.start).toISOString() : null,
      html_url: url || null,
      course_name: course,
      attachments: [],
    });
  }
  return items;
}

const running = new Set();
export async function syncTeam(teamId, { quiet = false } = {}) {
  if (running.has(teamId)) return { skipped: true };
  running.add(teamId);
  try {
    const team = one('SELECT * FROM teams WHERE id=?', teamId);
    if (!team) return { skipped: true };
    let items;
    if (team.canvas_token && team.canvas_course_ids) items = await fetchFromApi(team);
    else if (team.ical_url) items = await fetchFromIcal(team);
    else return { skipped: true };

    const firstSync = !team.last_synced_at;
    const counts = { new: 0, updated: 0, same: 0, rescheduled: 0 };
    const fresh = [];
    tx(() => {
      for (const it of items) {
        const r = upsert(teamId, it);
        counts[r]++;
        if (r === 'new' || r === 'rescheduled') fresh.push({ ...it, kind: r });
      }
      run(`UPDATE teams SET last_synced_at=datetime('now'), sync_error=NULL WHERE id=?`, teamId);
    });

    // On the very first import we stay quiet; afterwards, tell everyone what's new.
    if (!firstSync && !quiet) {
      for (const it of fresh.slice(0, 5)) {
        const a = one('SELECT id FROM assignments WHERE team_id=? AND source=? AND external_id=?', teamId, it.source, it.external_id);
        const when = it.due_at ? new Date(it.due_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: team.tz || 'America/New_York' }) : 'no due date';
        await notifyTeam(teamId, {
          title: it.kind === 'new' ? 'New assignment posted' : 'Due date changed',
          body: `${it.title} · due ${when}`,
          url: `/a/${a.id}`,
        });
      }
    }
    return { ...counts, total: items.length };
  } catch (e) {
    run('UPDATE teams SET sync_error=? WHERE id=?', String(e.message || e), teamId);
    throw e;
  } finally {
    running.delete(teamId);
  }
}

export async function syncAll() {
  for (const t of all('SELECT id FROM teams WHERE canvas_token IS NOT NULL OR ical_url IS NOT NULL')) {
    try { await syncTeam(t.id); } catch (e) { console.warn('sync failed', t.id, e.message); }
  }
}
