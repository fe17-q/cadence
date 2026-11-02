import { useMemo, useState } from 'react';
import { post, del } from '../api.js';
import { useStore, useDerived } from '../store.jsx';
import { Avatar, Button, Empty, Icon, Sheet } from '../ui.jsx';
import { fileKind } from '../util.js';

// ---------- kinds ----------
export const KIND = {
  doc: { label: 'Doc', long: 'Google Doc', color: '#7ea6f2', glyph: 'M7 8h10M7 12h10M7 16h6' },
  sheet: { label: 'Sheet', long: 'Google Sheet', color: '#6fc28f', glyph: 'M5 9h14M5 14h14M10 5v14' },
  slides: { label: 'Slides', long: 'Google Slides', color: '#f0bd5a', glyph: 'M6 8h12v8H6z' },
  form: { label: 'Form', long: 'Google Form', color: '#b08ef0', glyph: 'M8 8h.01M11 8h6M8 12h.01M11 12h6M8 16h.01M11 16h6' },
  drawing: { label: 'Drawing', long: 'Google Drawing', color: '#e88a7a', glyph: 'M6 16l5-8 3 5 2-3 2 6z' },
  folder: { label: 'Folder', long: 'Drive folder', color: '#b9b1a3', glyph: 'M4 8h6l2 2h8v8H4z' },
  pdf: { label: 'PDF', long: 'PDF', color: '#e59a8c', glyph: 'M8 7h8M8 11h8M8 15h5' },
  file: { label: 'File', long: 'Drive file', color: '#b9b1a3', glyph: 'M8 7h8M8 11h8M8 15h5' },
  link: { label: 'Link', long: 'Link', color: '#c9a96e', glyph: 'M10 14l4-4M9 11l-2 2a2.8 2.8 0 0 0 4 4l2-2M15 13l2-2a2.8 2.8 0 0 0-4-4l-2 2' },
};
const MIME_KIND = {
  'application/vnd.google-apps.document': 'doc', 'application/vnd.google-apps.spreadsheet': 'sheet',
  'application/vnd.google-apps.presentation': 'slides', 'application/vnd.google-apps.form': 'form',
  'application/vnd.google-apps.folder': 'folder', 'application/pdf': 'pdf',
};

export function DocIcon({ kind, size = 40 }) {
  const k = KIND[kind] || KIND.file;
  return (
    <span className="doc-icon" style={{ width: size, height: size, '--k': k.color }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={k.glyph} /></svg>
    </span>
  );
}

function previewUrl(d) {
  if (!d.google_id) return null;
  const t = { doc: 'document', sheet: 'spreadsheets', slides: 'presentation', drawing: 'drawings' }[d.kind];
  if (t) return `https://docs.google.com/${t}/d/${d.google_id}/preview`;
  if (d.kind === 'file' || d.kind === 'pdf') return `https://drive.google.com/file/d/${d.google_id}/preview`;
  return null;
}
const wide = () => matchMedia('(min-width: 820px) and (hover: hover)').matches;

// Opening a doc: big screens get an in-app preview; phones jump straight into the Google app.
export function useOpenDoc() {
  const [viewing, setViewing] = useState(null);
  const open = d => { if (previewUrl(d) && wide()) setViewing(d); else window.open(d.url, '_blank', 'noopener'); };
  const viewer = <DocViewer doc={viewing} onClose={() => setViewing(null)} />;
  return [open, viewer];
}

function DocViewer({ doc, onClose }) {
  const [last, setLast] = useState(doc);
  if (doc && doc !== last) setLast(doc);
  const d = doc || last;
  return (
    <Sheet open={!!doc} onClose={onClose} title={d?.title} wide>
      {d && <div className="viewer">
        <iframe className="viewer__frame" src={previewUrl(d)} title={d.title} allow="autoplay" />
        <div className="row">
          <a className="btn btn--primary" href={d.url} target="_blank" rel="noopener"><Icon name="link" size={16} /> Open to edit in {KIND[d.kind]?.long || 'Google'}</a>
        </div>
      </div>}
    </Sheet>
  );
}

// Created docs are named "<assignment or task> · Notes" so they read well in Drive; inside that context, drop the prefix.
function shortTitle(d, der) {
  const a = der?.assignmentById.get(d.assignment_id);
  const t = d.task_id ? der?.byAssignment.get(d.assignment_id)?.find(x => x.id === d.task_id) : null;
  for (const pre of [t?.title, a?.title]) if (pre && d.title.startsWith(pre + ' · ')) return d.title.slice(pre.length + 3);
  return d.title;
}

export function DocRow({ d, onOpen, showWhere }) {
  const { removeDoc } = useStore();
  const der = useDerived();
  const who = der?.members.get(d.created_by);
  const where = showWhere && (d.task_id ? der.byAssignment.get(d.assignment_id)?.find(t => t.id === d.task_id)?.title : null);
  return (
    <li className="doc-row" onClick={() => onOpen(d)}>
      <DocIcon kind={d.kind} />
      <div className="doc-row__body">
        <span className="doc-row__title">{shortTitle(d, der)}</span>
        <span className="doc-row__meta">
          {KIND[d.kind]?.long || 'Link'}{where ? ` · ${where}` : ''}{d.source === 'created' ? ' · in team folder' : ''}
        </span>
      </div>
      {who && <Avatar user={who} size={22} title={`Added by ${who.name}`} />}
      <button className="icon-btn icon-btn--sm doc-row__x" aria-label="Unlink" onClick={e => { e.stopPropagation(); if (confirm(`Remove “${d.title}” from Cadence? The file itself stays in Google Drive.`)) removeDoc(d.id); }}>
        <Icon name="x" size={15} />
      </button>
    </li>
  );
}

// ---------- add docs ----------
export function AddDocButtons({ assignmentId, taskId, compact, onAdded }) {
  const { team, config, createDoc, toast } = useStore();
  const [busy, setBusy] = useState(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const pick = usePicker({ assignmentId, taskId });
  const g = team.google.connected;

  async function make(kind) {
    setBusy(kind);
    try {
      const d = await createDoc({ kind, assignment_id: assignmentId, task_id: taskId });
      toast(`${KIND[kind].long} created ✨`);
      onAdded?.(d);
      window.open(d.url, '_blank', 'noopener');
    } catch (e) { toast(e.message, { tone: 'error' }); }
    finally { setBusy(null); }
  }

  return (
    <>
      <div className={`doc-actions ${compact ? 'doc-actions--compact' : ''}`}>
        {g && ['doc', 'sheet', 'slides'].map(k => (
          <button key={k} className="doc-action" onClick={() => make(k)} disabled={!!busy}>
            <DocIcon kind={k} size={compact ? 26 : 30} />
            <span>{busy === k ? 'Creating…' : `New ${KIND[k].label}`}</span>
          </button>
        ))}
        {g && config.google.apiKey && (
          <button className="doc-action" onClick={pick}>
            <span className="doc-icon doc-icon--plain" style={{ width: compact ? 26 : 30, height: compact ? 26 : 30 }}><Icon name="file" size={15} /></span>
            <span>From Drive</span>
          </button>
        )}
        <button className="doc-action" onClick={() => setLinkOpen(true)}>
          <span className="doc-icon doc-icon--plain" style={{ width: compact ? 26 : 30, height: compact ? 26 : 30 }}><Icon name="link" size={15} /></span>
          <span>Paste link</span>
        </button>
      </div>
      <LinkSheet open={linkOpen} onClose={() => setLinkOpen(false)} assignmentId={assignmentId} taskId={taskId} />
    </>
  );
}

function LinkSheet({ open, onClose, assignmentId, taskId }) {
  const { addDoc, toast } = useStore();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const kind = guessKind(url);
  async function save(e) {
    e.preventDefault(); setBusy(true);
    try {
      await addDoc({ url, title, assignment_id: assignmentId, task_id: taskId });
      setUrl(''); setTitle(''); onClose(); toast('Linked');
    } catch (err) { toast(err.message, { tone: 'error' }); }
    finally { setBusy(false); }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Link a file">
      <form className="stack" onSubmit={save}>
        <p className="muted small">Any Google Doc, Sheet, Slides, Drive file or folder. Other links work too.</p>
        <label className="field"><span className="field__label">Link</span>
          <div className="field__with-icon">
            {url && <DocIcon kind={kind} size={30} />}
            <input className="field__input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://docs.google.com/…" inputMode="url" autoCapitalize="off" autoCorrect="off" autoFocus
              onFocus={async () => { if (!url && navigator.clipboard?.readText) { try { const t = await navigator.clipboard.readText(); if (/^https?:\/\//.test(t)) setUrl(t.trim()); } catch { /* no permission */ } } }} />
          </div>
        </label>
        <label className="field"><span className="field__label">Name (optional)</span>
          <input className="field__input" value={title} onChange={e => setTitle(e.target.value)} placeholder={KIND[kind]?.long ? `e.g. Proposal draft` : ''} /></label>
        <Button type="submit" loading={busy} disabled={!/^https?:\/\/\S+\.\S+/.test(url)}>Add</Button>
      </form>
    </Sheet>
  );
}

function guessKind(url) {
  if (/docs\.google\.com\/document/.test(url)) return 'doc';
  if (/docs\.google\.com\/spreadsheets/.test(url)) return 'sheet';
  if (/docs\.google\.com\/presentation/.test(url)) return 'slides';
  if (/docs\.google\.com\/forms/.test(url)) return 'form';
  if (/drive\.google\.com\/drive\/(u\/\d+\/)?folders/.test(url)) return 'folder';
  if (/drive\.google\.com/.test(url)) return 'file';
  if (/\.pdf(\?|$)/i.test(url)) return 'pdf';
  return 'link';
}

// ---------- Google Picker (each person browses their own Drive) ----------
const loadScript = src => new Promise((res, rej) => {
  if (document.querySelector(`script[src="${src}"]`)) return res();
  const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = rej; document.head.appendChild(s);
});

// Opens the Google Picker with a short-lived token for whoever is using the app.
async function openPicker({ config, hint, title, build, onPicked }) {
  await Promise.all([loadScript('https://apis.google.com/js/api.js'), loadScript('https://accounts.google.com/gsi/client')]);
  await new Promise(r => window.gapi.load('picker', r));
  const token = await new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: config.google.clientId, scope: 'https://www.googleapis.com/auth/drive.file',
      ...(hint ? { login_hint: hint, hint } : {}),
      callback: r => (r.error ? reject(new Error(r.error)) : resolve(r.access_token)),
    });
    client.requestAccessToken({ prompt: '' });
  });
  const gp = window.google.picker;
  const b = new gp.PickerBuilder()
    .setOAuthToken(token).setDeveloperKey(config.google.apiKey).setAppId(config.google.appId || '')
    .setTitle(title)
    .setCallback(data => { if (data.action === gp.Action.PICKED) onPicked(data.docs, token); });
  build(b, gp);
  b.build().setVisible(true);
}

function usePicker({ assignmentId, taskId }) {
  const { config, board, user, addDoc, toast } = useStore();
  return async function pick() {
    try {
      await openPicker({
        config, title: 'Add files to Cadence',
        build: (b, gp) => b.addView(new gp.DocsView().setIncludeFolders(true).setOwnedByMe(false))
          .addView(new gp.DocsView().setIncludeFolders(true).setOwnedByMe(true))
          .enableFeature(gp.Feature.MULTISELECT_ENABLED),
        onPicked: async (docs, token) => {
          for (const f of docs) {
            await addDoc({ url: f.url, title: f.name, kind: MIME_KIND[f.mimeType] || 'file', source: 'picked', assignment_id: assignmentId, task_id: taskId });
            // share with teammates so nobody hits "Request access"
            for (const m of board.members) {
              if (m.id === user.id) continue;
              fetch(`https://www.googleapis.com/drive/v3/files/${f.id}/permissions?sendNotificationEmail=false&supportsAllDrives=true`, {
                method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: 'writer', type: 'user', emailAddress: m.google_email || m.email }),
              }).catch(() => {});
            }
          }
          toast(`${docs.length} file${docs.length > 1 ? 's' : ''} added and shared with the team`);
        },
      });
    } catch (e) { toast(e.message || 'Couldn\'t open Google Drive', { tone: 'error' }); }
  };
}

// ---------- section used on assignment pages ----------
export function DocsSection({ assignment }) {
  const { board } = useStore();
  const [open, viewer] = useOpenDoc();
  const docs = (board.docs || []).filter(d => d.assignment_id === assignment.id);
  return (
    <section className="section">
      <div className="section__head"><h2 className="section__title">Docs</h2>{docs.length > 0 && <span className="section__meta">{docs.length}</span>}</div>
      {docs.length > 0 && <ul className="card-list">{docs.map(d => <DocRow key={d.id} d={d} onOpen={open} showWhere />)}</ul>}
      <AddDocButtons assignmentId={assignment.id} />
      {viewer}
    </section>
  );
}

export function TaskDocs({ task }) {
  const { board } = useStore();
  const [open, viewer] = useOpenDoc();
  const docs = (board.docs || []).filter(d => d.task_id === task.id);
  return (
    <div className="sheet-block">
      <span className="sheet-block__label">Docs</span>
      {docs.length > 0 && <ul className="card-list card-list--flat">{docs.map(d => <DocRow key={d.id} d={d} onOpen={open} />)}</ul>}
      <AddDocButtons assignmentId={task.assignment_id} taskId={task.id} compact />
      {viewer}
    </div>
  );
}

// ---------- the Docs tab ----------
export function DocsScreen({ openGoogle }) {
  const { board, team, navigate } = useStore();
  const der = useDerived();
  const [q, setQ] = useState('');
  const [open, viewer] = useOpenDoc();

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = s => !needle || (s || '').toLowerCase().includes(needle);
    const out = [];
    const general = (board.docs || []).filter(d => !d.assignment_id && match(d.title));
    if (general.length) out.push({ key: 'general', title: 'Team', docs: general, files: [] });
    const sorted = [...board.assignments].sort((a, b) => {
      const now = Date.now(), ta = a.due_at ? new Date(a.due_at) : Infinity, tb = b.due_at ? new Date(b.due_at) : Infinity;
      const pa = ta < now, pb = tb < now;
      return pa !== pb ? (pa ? 1 : -1) : pa ? tb - ta : ta - tb;
    });
    for (const a of sorted) {
      const docs = (board.docs || []).filter(d => d.assignment_id === a.id && (match(d.title) || match(a.title)));
      const files = (a.attachments || []).filter(f => match(f.name) || match(a.title));
      if (docs.length || files.length) out.push({ key: a.id, a, title: a.title, docs, files });
    }
    return out;
  }, [board, q]);

  const total = (board.docs || []).length + board.assignments.reduce((n, a) => n + (a.attachments?.length || 0), 0);

  return (
    <div className="screen">
      <header className="page-head fade-up">
        <div><p className="eyebrow">Everything in one place</p><h1 className="display display--md">Docs</h1></div>
        {team.google.folder_url && <a className="btn btn--ghost btn--sm" href={team.google.folder_url} target="_blank" rel="noopener"><Icon name="file" size={15} /> Team folder</a>}
      </header>

      {!team.google.connected && (
        <button className="setup__item fade-up" onClick={openGoogle}>
          <span className="setup__icon"><DocIcon kind="doc" size={26} /></span>
          <span className="setup__text"><strong>Connect Google Drive</strong><span>Create Docs, Sheets and Slides right from an assignment. They land in a shared team folder everyone can edit.</span></span>
          <Icon name="chev" className="muted" />
        </button>
      )}

      {total > 0 && (
        <div className="search">
          <Icon name="list" size={17} className="muted" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search docs and Canvas files" />
          {q && <button className="icon-btn icon-btn--sm" onClick={() => setQ('')} aria-label="Clear"><Icon name="x" size={15} /></button>}
        </div>
      )}

      <section className="section">
        <div className="section__head"><h2 className="section__title">General team docs</h2></div>
        <AddDocButtons />
      </section>

      {groups.length === 0 ? (
        <Empty icon="file" title={q ? 'No matches' : 'No docs yet'}>
          {q ? 'Try a different word.' : 'Docs you add to assignments and files attached in Canvas all collect here.'}
        </Empty>
      ) : groups.map(g => (
        <section className="section" key={g.key}>
          <div className="section__head">
            {g.a ? <button className="section__title section__title--link" onClick={() => navigate(`/a/${g.a.id}`)}>{g.title} <Icon name="chev" size={13} /></button>
              : <h2 className="section__title">{g.title}</h2>}
            <span className="section__meta">{g.docs.length + g.files.length}</span>
          </div>
          <ul className="card-list">
            {g.docs.map(d => <DocRow key={d.id} d={d} onOpen={open} showWhere />)}
            {g.files.map(f => (
              <li key={f.url} className="doc-row" onClick={() => window.open(f.url, '_blank', 'noopener')}>
                <span className={`file__kind file__kind--${fileKind(f.name)}`}>{/google\.com/.test(f.url) ? 'G' : fileKind(f.name)}</span>
                <div className="doc-row__body"><span className="doc-row__title">{f.name}</span><span className="doc-row__meta">From Canvas</span></div>
                <Icon name="link" size={15} className="muted" />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {viewer}
    </div>
  );
}

// ---------- Google connection panel (Team screen) ----------
export function GooglePanel() {
  const { team, config, toast, loadMe } = useStore();
  const [busy, setBusy] = useState(false);
  const g = team.google;
  if (!config.google.enabled) {
    return (
      <div className="panel">
        <div className="panel__row"><DocIcon kind="doc" />
          <div className="panel__text"><strong>Google Drive</strong><span>Not set up on this server yet. You can still paste links to any Google Doc, Sheet or Slides.</span></div></div>
      </div>
    );
  }
  const chooseFolder = async () => {
    try {
      await openPicker({
        config, hint: g.email, title: 'Choose your team folder',
        build: (b, gp) => b
          .addView(new gp.DocsView(gp.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setOwnedByMe(true))
          .addView(new gp.DocsView(gp.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setOwnedByMe(false))
          .addView(new gp.DocsView(gp.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setEnableDrives(true)),
        onPicked: async docs => {
          setBusy(true);
          try { await post(`/teams/${team.id}/google/folder`, { folder_id: docs[0].id }); await loadMe(); toast(`New docs will go in “${docs[0].name}” ✨`); }
          catch (e) { toast(e.message, { tone: 'error', duration: 7000 }); }
          finally { setBusy(false); }
        },
      });
    } catch (e) { toast(e.message || 'Couldn\'t open Google Drive', { tone: 'error' }); }
  };
  const connect = async () => {
    setBusy(true);
    try { const { url } = await post(`/teams/${team.id}/google/connect`); location.href = url; }
    catch (e) { toast(e.message, { tone: 'error' }); setBusy(false); }
  };
  return (
    <div className="panel">
      <div className="panel__row">
        <DocIcon kind="doc" />
        <div className="panel__text">
          <strong>{g.connected ? (g.error ? 'Google needs reconnecting' : 'Google Drive connected') : 'Google Drive'}</strong>
          <span>{g.connected
            ? (g.error || <>New docs go in <b>{g.folder_name || 'your team folder'}</b>, one subfolder per assignment, shared with everyone on the team.</>)
            : 'Connect once to create Docs, Sheets and Slides from any assignment, in a folder the whole team can edit.'}</span>
        </div>
      </div>
      <div className="row">
        {g.connected && g.folder_url && <a className="btn btn--ghost" href={g.folder_url} target="_blank" rel="noopener">Open folder</a>}
        {g.connected && !g.error && <Button variant="ghost" loading={busy} onClick={chooseFolder}>Use a different folder</Button>}
        {(!g.connected || g.error) && <Button loading={busy} onClick={connect}>{g.connected ? 'Reconnect' : 'Connect Google Drive'}</Button>}
      </div>
      {g.connected && !g.error && <button className="link-btn left" onClick={async () => { if (!confirm('Disconnect Google Drive? Linked docs stay, but you won\'t be able to create new ones.')) return; await del(`/teams/${team.id}/google`); loadMe(); }}>Disconnect</button>}
    </div>
  );
}
