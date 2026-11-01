import { useState } from 'react';
import { del, patch, post } from '../api.js';
import { useStore } from '../store.jsx';
import { Avatar, Button, Icon, Sheet } from '../ui.jsx';
import { usePush } from './Notifications.jsx';

export function inviteUrl(team) { return `${location.origin}/join/${team.invite_code}`; }

export function InviteSheet({ open, onClose }) {
  const { team, toast } = useStore();
  const url = inviteUrl(team);
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); } };
  const share = () => navigator.share?.({ title: `Join ${team.name} on Cadence`, text: `Join our ${team.name} team on Cadence so we can split up the work:`, url }).catch(() => {});
  return (
    <Sheet open={open} onClose={onClose} title="Invite your team">
      <div className="stack">
        <p className="muted">Send this link in your group chat. Anyone who opens it can join {team.name} in a few seconds.</p>
        <div className="invite-link"><span className="mono">{url.replace(/^https?:\/\//, '')}</span></div>
        <div className="row">
          {navigator.share && <Button onClick={share}><Icon name="share" size={17} /> Share</Button>}
          <Button variant={navigator.share ? 'ghost' : 'primary'} onClick={copy}><Icon name="copy" size={17} /> Copy link</Button>
        </div>
      </div>
    </Sheet>
  );
}

export function TeamScreen({ openCanvas, openInvite }) {
  const { team, board, user, sync, toast, loadMe, setMe, navigate, refresh, teams, setTeamId } = useStore();
  const push = usePush();
  const [syncing, setSyncing] = useState(false);
  const [profile, setProfile] = useState(false);
  const isOwner = team.role === 'owner';
  const counts = id => board.tasks.filter(t => t.assignee_id === id && !t.done).length;

  async function doSync() {
    setSyncing(true);
    try {
      const r = await sync();
      toast(r?.new ? `${r.new} new assignment${r.new > 1 ? 's' : ''} found` : 'Everything is up to date');
    } catch (e) { toast(e.message, { tone: 'error' }); }
    finally { setSyncing(false); }
  }

  return (
    <div className="screen">
      <header className="page-head fade-up">
        <div>
          <p className="eyebrow">Team</p>
          <h1 className="display display--md">{team.name}</h1>
        </div>
      </header>

      <section className="section">
        <div className="section__head"><h2 className="section__title">Members</h2><span className="section__meta">{board.members.length}</span></div>
        <ul className="card-list">
          {board.members.map(m => (
            <li key={m.id} className="member">
              <Avatar user={m} size={40} />
              <div className="member__text">
                <strong>{m.name}{m.id === user.id && <span className="muted"> (you)</span>}</strong>
                <span>{counts(m.id) ? `${counts(m.id)} open task${counts(m.id) > 1 ? 's' : ''}` : 'Nothing assigned'}{m.role === 'owner' ? ' · Owner' : ''}</span>
              </div>
              {isOwner && m.id !== user.id && (
                <button className="icon-btn icon-btn--sm" aria-label={`Remove ${m.name}`} onClick={async () => {
                  if (!confirm(`Remove ${m.name} from ${team.name}?`)) return;
                  await del(`/teams/${team.id}/members/${m.id}`); refresh();
                }}><Icon name="x" size={16} /></button>
              )}
            </li>
          ))}
          <li className="member member--add" onClick={openInvite}>
            <span className="avatar avatar--empty" style={{ width: 40, height: 40 }}><Icon name="plus" size={18} /></span>
            <div className="member__text"><strong>Invite teammates</strong><span>Share a link, that's it</span></div>
          </li>
        </ul>
      </section>

      <section className="section">
        <div className="section__head"><h2 className="section__title">Canvas</h2></div>
        <div className="panel">
          {team.canvas.mode ? <>
            <div className="panel__row">
              <span className={`status-dot ${team.canvas.error ? 'status-dot--bad' : ''}`} />
              <div className="panel__text">
                <strong>{team.canvas.error ? 'Sync needs attention' : 'Connected'}</strong>
                <span>{team.canvas.error || (team.canvas.mode === 'token' ? `Via access token · ${team.canvas.base_url?.replace(/^https?:\/\//, '')}` : 'Via calendar feed')}</span>
                {team.canvas.last_synced_at && <span>Last checked {new Date(team.canvas.last_synced_at + 'Z').toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · checks every few hours</span>}
              </div>
            </div>
            <div className="row">
              <Button variant="ghost" loading={syncing} onClick={doSync}><Icon name="sync" size={16} /> Sync now</Button>
              <Button variant="ghost" onClick={openCanvas}>Change</Button>
            </div>
          </> : <>
            <div className="panel__text"><strong>Not connected</strong><span>Connect once and every assignment shows up automatically.</span></div>
            <Button onClick={openCanvas}>Connect Canvas</Button>
          </>}
        </div>
      </section>

      <section className="section">
        <div className="section__head"><h2 className="section__title">Reminders</h2></div>
        <div className="panel">
          <div className="panel__row">
            <span className="setup__icon"><Icon name="bell" /></span>
            <div className="panel__text">
              <strong>Push notifications on this device</strong>
              <span>{{
                checking: 'Checking…',
                on: 'On. You\'ll hear about new assignments, deadlines 3 days, 1 day and a few hours out, and tasks handed to you.',
                off: 'Off. Turn on to get deadline reminders.',
                denied: 'Blocked in your browser settings. Allow notifications for this site to turn them on.',
                'needs-install': 'On iPhone, add Cadence to your Home Screen first (Share → Add to Home Screen), then open it from there.',
                unsupported: 'This browser can\'t do push notifications. You\'ll still see updates under the bell.',
              }[push.state]}</span>
            </div>
            {(push.state === 'on' || push.state === 'off') && (
              <button role="switch" aria-checked={push.state === 'on'} className={`switch ${push.state === 'on' ? 'is-on' : ''}`}
                onClick={async () => {
                  try { push.state === 'on' ? await push.disable() : (await push.enable()) && toast('Reminders are on ✨'); }
                  catch (e) { toast(e.message || 'Couldn\'t turn on notifications', { tone: 'error' }); }
                }}><span /></button>
            )}
          </div>
          {push.state === 'on' && <button className="link-btn left" onClick={() => post('/push/test').then(() => toast('Sent a test notification'))}>Send me a test</button>}
        </div>
      </section>

      <section className="section">
        <div className="section__head"><h2 className="section__title">You</h2></div>
        <div className="panel">
          <div className="panel__row" onClick={() => setProfile(true)} role="button">
            <Avatar user={user} size={40} />
            <div className="panel__text"><strong>{user.name}</strong><span>{user.email}</span></div>
            <Icon name="chev" className="muted" />
          </div>
          {teams.length > 1 && (
            <div className="chips">
              {teams.map(t => <button key={t.id} className={`chip chip--btn ${t.id === team.id ? 'chip--gold' : ''}`} onClick={() => { setTeamId(t.id); navigate('/'); }}>{t.name}</button>)}
            </div>
          )}
          <button className="link-btn left" onClick={async () => { await post('/auth/logout'); setMe(null); navigate('/', { replace: true }); }}><Icon name="logout" size={15} /> Sign out</button>
        </div>
      </section>

      <p className="colophon">Cadence · made for {team.name}</p>
      <ProfileSheet open={profile} onClose={() => setProfile(false)} onSaved={loadMe} />
    </div>
  );
}

const COLORS = ['#C9A96E', '#8FA6C9', '#B98AA6', '#7FB0A0', '#C98F7A', '#A49BD1', '#D1B07F', '#8CB7C9'];
function ProfileSheet({ open, onClose, onSaved }) {
  const { user, refresh } = useStore();
  const [name, setName] = useState(user.name);
  const [color, setColor] = useState(user.color);
  return (
    <Sheet open={open} onClose={onClose} title="Your profile">
      <div className="stack">
        <div className="center"><Avatar user={{ ...user, name, color }} size={72} /></div>
        <label className="field"><span className="field__label">Name</span><input className="field__input" value={name} onChange={e => setName(e.target.value)} /></label>
        <div className="swatches">{COLORS.map(c => <button key={c} className={`swatch ${c === color ? 'is-on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Color ${c}`} />)}</div>
        <Button onClick={async () => { await patch('/me', { name, color }); await Promise.all([onSaved(), refresh()]); onClose(); }}>Save</Button>
      </div>
    </Sheet>
  );
}
