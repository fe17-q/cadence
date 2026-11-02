// Google Drive / Docs integration.
// One teammate connects Google once; Cadence keeps a shared team folder in their Drive,
// shares it with every teammate, and creates Docs/Sheets/Slides inside it on demand.
// Scope is drive.file: Cadence only ever touches files it created or that someone picked for it.
import crypto from 'node:crypto';
import { one, all, run } from './db.js';
import { encrypt, decrypt } from './canvas.js';

const cfg = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  apiKey: process.env.GOOGLE_API_KEY,
  appId: process.env.GOOGLE_APP_ID, // Cloud project number, for the Picker
  authUrl: process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
  api: process.env.GOOGLE_API_BASE || 'https://www.googleapis.com',
});
export const googleEnabled = () => !!(cfg().clientId && cfg().clientSecret);
export const publicGoogleConfig = () => ({
  enabled: googleEnabled(),
  clientId: cfg().clientId || null,
  apiKey: cfg().apiKey || null,
  appId: cfg().appId || null,
});

const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/drive.file'];

// ---------- link parsing (works with or without a Google connection) ----------
const KINDS = {
  document: 'doc', spreadsheets: 'sheet', presentation: 'slides', forms: 'form', drawings: 'drawing',
};
const MIME_KIND = {
  'application/vnd.google-apps.document': 'doc',
  'application/vnd.google-apps.spreadsheet': 'sheet',
  'application/vnd.google-apps.presentation': 'slides',
  'application/vnd.google-apps.form': 'form',
  'application/vnd.google-apps.folder': 'folder',
  'application/pdf': 'pdf',
};
export const kindFromMime = m => MIME_KIND[m] || 'file';
const KIND_LABEL = { doc: 'Google Doc', sheet: 'Google Sheet', slides: 'Google Slides', form: 'Google Form', drawing: 'Google Drawing', folder: 'Drive folder', file: 'Drive file', pdf: 'PDF', link: 'Link' };

export function parseLink(raw) {
  let url;
  try { url = new URL(String(raw).trim()); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.replace(/^www\./, '');
  let kind = 'link', googleId = null;
  if (host === 'docs.google.com') {
    const m = /^\/(document|spreadsheets|presentation|forms|drawings)\/(?:u\/\d+\/)?d\/(?:e\/)?([\w-]+)/.exec(url.pathname);
    if (m) { kind = KINDS[m[1]]; googleId = m[2]; }
  } else if (host === 'drive.google.com') {
    const f = /\/folders\/([\w-]+)/.exec(url.pathname);
    const d = /\/file\/d\/([\w-]+)/.exec(url.pathname) || (url.pathname === '/open' && [0, url.searchParams.get('id')]);
    if (f) { kind = 'folder'; googleId = f[1]; } else if (d && d[1]) { kind = 'file'; googleId = d[1]; }
  } else if (/\.pdf$/i.test(url.pathname)) kind = 'pdf';
  return { url: url.toString(), kind, googleId, defaultTitle: KIND_LABEL[kind] === 'Link' ? host : `Untitled ${KIND_LABEL[kind]}` };
}

// ---------- OAuth ----------
function sign(data) {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url');
  const mac = crypto.createHmac('sha256', process.env.APP_SECRET || one("SELECT value FROM kv WHERE key='app_secret'")?.value || 'dev').update(body).digest('base64url');
  return `${body}.${mac}`;
}
function verify(state) {
  const [body, mac] = String(state || '').split('.');
  if (!body || sign(JSON.parse(Buffer.from(body, 'base64url').toString())) !== state) throw new Error('Invalid sign-in state');
  const data = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (Date.now() - data.t > 15 * 60e3) throw new Error('Google sign-in took too long. Please try again.');
  return data;
}

export function authUrl({ teamId, userId, origin }) {
  const c = cfg();
  const p = new URLSearchParams({
    client_id: c.clientId, redirect_uri: `${origin}/api/google/callback`, response_type: 'code',
    scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
    state: sign({ teamId, userId, origin, t: Date.now() }),
  });
  return `${c.authUrl}?${p}`;
}

async function tokenRequest(params) {
  const c = cfg();
  const res = await fetch(c.tokenUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || `Google token error ${res.status}`);
  return data;
}

const tokenCache = new Map(); // teamId -> { token, exp }
async function accessToken(team) {
  const hit = tokenCache.get(team.id);
  if (hit && hit.exp > Date.now() + 60e3) return hit.token;
  if (!team.google_refresh_token) throw new Error('Google Drive is not connected');
  try {
    const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decrypt(team.google_refresh_token) });
    tokenCache.set(team.id, { token: t.access_token, exp: Date.now() + (t.expires_in || 3600) * 1000 });
    return t.access_token;
  } catch (e) {
    run('UPDATE teams SET google_error=? WHERE id=?', 'Google access was revoked or expired. Reconnect Google Drive.', team.id);
    throw e;
  }
}

async function gapi(team, path, { method = 'GET', body, query } = {}) {
  const tk = await accessToken(team);
  const qs = query ? '?' + new URLSearchParams(query) : '';
  const res = await fetch(`${cfg().api}${path}${qs}`, {
    method, headers: { Authorization: `Bearer ${tk}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error?.message || `Google API error ${res.status}`); err.status = res.status; throw err; }
  return data;
}

const FIELDS = 'id,name,mimeType,webViewLink,iconLink,modifiedTime';

async function createFolder(team, name, parent) {
  return gapi(team, '/drive/v3/files', {
    method: 'POST', query: { fields: FIELDS, supportsAllDrives: 'true' },
    body: { name, mimeType: 'application/vnd.google-apps.folder', ...(parent ? { parents: [parent] } : {}) },
  });
}

export async function shareFolderWith(team, email) {
  if (!team.google_folder_id || !email || email.toLowerCase() === (team.google_email || '').toLowerCase()) return;
  try {
    await gapi(team, `/drive/v3/files/${team.google_folder_id}/permissions`, {
      method: 'POST', query: { sendNotificationEmail: 'false', supportsAllDrives: 'true' },
      body: { role: 'writer', type: 'user', emailAddress: email },
    });
  } catch (e) { console.warn('share failed', email, e.message); }
}

export async function shareWithTeam(teamId) {
  const team = one('SELECT * FROM teams WHERE id=?', teamId);
  if (!team?.google_folder_id) return;
  const members = all('SELECT COALESCE(u.google_email, u.email) AS email FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.team_id=?', teamId);
  for (const m of members) await shareFolderWith(team, m.email);
}

export async function handleCallback({ code, state }) {
  const s = verify(state);
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: `${s.origin}/api/google/callback` });
  if (!t.refresh_token) throw new Error('Google did not return offline access. Please try connecting again.');
  const info = await fetch(`${cfg().api}/oauth2/v3/userinfo`, { headers: { Authorization: `Bearer ${t.access_token}` } }).then(r => r.json()).catch(() => ({}));
  run('UPDATE teams SET google_refresh_token=?, google_email=?, google_connected_by=?, google_error=NULL WHERE id=?',
    encrypt(t.refresh_token), info.email || null, s.userId, s.teamId);
  tokenCache.set(s.teamId, { token: t.access_token, exp: Date.now() + (t.expires_in || 3600) * 1000 });
  let team = one('SELECT * FROM teams WHERE id=?', s.teamId);
  if (!team.google_folder_id) {
    const f = await createFolder(team, `${team.name} · Cadence`);
    run('UPDATE teams SET google_folder_id=?, google_folder_url=?, google_folder_name=? WHERE id=?', f.id, f.webViewLink || `https://drive.google.com/drive/folders/${f.id}`, f.name || null, team.id);
  }
  await shareWithTeam(team.id);
  return s;
}

// Switch the team folder to one the team already uses. With the drive.file scope the server can only
// reach it once the connected account has picked it in the Picker, so a 404 means someone else picked it.
export async function useFolder(team, folderId) {
  if (!/^[\w-]{5,}$/.test(folderId)) throw Object.assign(new Error('Pick a folder'), { status: 400 });
  let f;
  try { f = await gapi(team, `/drive/v3/files/${folderId}`, { query: { fields: FIELDS, supportsAllDrives: 'true' } }); }
  catch (e) {
    if (e.status === 404 || e.status === 403) throw Object.assign(new Error(`Pick the folder while signed in to Google as ${team.google_email || 'the account that connected Drive'}.`), { status: 400 });
    throw e;
  }
  if (f.mimeType !== 'application/vnd.google-apps.folder') throw Object.assign(new Error('That isn\'t a folder'), { status: 400 });
  run('UPDATE teams SET google_folder_id=?, google_folder_url=?, google_folder_name=? WHERE id=?',
    f.id, f.webViewLink || `https://drive.google.com/drive/folders/${f.id}`, f.name, team.id);
  // new docs go into fresh per-assignment subfolders inside the chosen folder; existing docs stay where they are
  run('UPDATE assignments SET google_folder_id=NULL WHERE team_id=?', team.id);
  await shareWithTeam(team.id);
}

// Each assignment gets its own subfolder, created lazily.
async function assignmentFolder(team, assignment) {
  if (!assignment) return team.google_folder_id;
  if (assignment.google_folder_id) return assignment.google_folder_id;
  const f = await createFolder(team, assignment.title.slice(0, 120), team.google_folder_id);
  run('UPDATE assignments SET google_folder_id=? WHERE id=?', f.id, assignment.id);
  return f.id;
}

const MIME = { doc: 'application/vnd.google-apps.document', sheet: 'application/vnd.google-apps.spreadsheet', slides: 'application/vnd.google-apps.presentation' };

export async function createFile(team, { kind, title, assignment }) {
  if (!MIME[kind]) throw new Error('Unsupported file type');
  const parent = await assignmentFolder(team, assignment);
  return gapi(team, '/drive/v3/files', { method: 'POST', query: { fields: FIELDS, supportsAllDrives: 'true' }, body: { name: title, mimeType: MIME[kind], parents: [parent] } });
}

// Best-effort metadata lookup (works for files Cadence created or that were picked for it).
export async function lookup(team, googleId) {
  if (!team.google_refresh_token || !googleId) return null;
  try { return await gapi(team, `/drive/v3/files/${googleId}`, { query: { fields: FIELDS } }); }
  catch { return null; }
}
