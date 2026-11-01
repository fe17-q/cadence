import { useMemo, useState } from 'react';
import { useStore, useDerived } from '../store.jsx';
import { AvatarStack, Button, Check, Icon, Ring } from '../ui.jsx';
import { countdown, greeting, firstName, relDue, urgency } from '../util.js';
import { AssignmentRow } from './Assignments.jsx';
import { InstallHint } from './Notifications.jsx';

export function TodayScreen({ openCanvas, openInvite }) {
  const { user, board, navigate, updateTask, team } = useStore();
  const d = useDerived();
  const now = new Date();

  const upcoming = useMemo(() => board.assignments
    .filter(a => a.due_at && new Date(a.due_at) > now)
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at)), [board.assignments]);
  const next = upcoming[0];
  const thisWeek = upcoming.slice(1).filter(a => new Date(a.due_at) - now < 8 * 864e5);

  const [justDone, setJustDone] = useState(new Set());
  const mine = d.myTasks
    .filter(t => !t.done || justDone.has(t.id))
    .map(t => ({ ...t, a: d.assignmentById.get(t.assignment_id), eff: t.due_at || d.assignmentById.get(t.assignment_id)?.due_at }))
    .sort((x, y) => (x.eff ? new Date(x.eff) : Infinity) - (y.eff ? new Date(y.eff) : Infinity));

  const needsCanvas = !team.canvas.mode;
  const solo = board.members.length < 2;
  const dateLine = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="screen today">
      <header className="hello fade-up">
        <p className="eyebrow">{dateLine}</p>
        <h1 className="display">{greeting(now)},<br /><em>{firstName(user.name)}</em>.</h1>
        <p className="hello__sub">{summaryLine(mine.filter(t => !t.done), upcoming)}</p>
      </header>

      <InstallHint />

      {(needsCanvas || solo) && (
        <section className="setup fade-up">
          {needsCanvas && (
            <button className="setup__item" onClick={openCanvas}>
              <span className="setup__icon"><Icon name="sync" /></span>
              <span className="setup__text"><strong>Connect Canvas</strong><span>Pull in every assignment, due date and file automatically.</span></span>
              <Icon name="chev" className="muted" />
            </button>
          )}
          {solo && (
            <button className="setup__item" onClick={openInvite}>
              <span className="setup__icon"><Icon name="users" /></span>
              <span className="setup__text"><strong>Invite your team</strong><span>Send one link. They're in with a tap.</span></span>
              <Icon name="chev" className="muted" />
            </button>
          )}
        </section>
      )}

      {next && <NextUp a={next} d={d} onOpen={() => navigate(`/a/${next.id}`)} />}

      <section className="section">
        <div className="section__head">
          <h2 className="section__title">On your plate</h2>
          {mine.length > 0 && <span className="section__meta">{mine.filter(t => !t.done).length} open</span>}
        </div>
        {mine.length === 0 ? (
          <div className="quiet-card">
            <Icon name="sparkle" className="gold" />
            <p>Nothing assigned to you right now. Enjoy it, or grab something from an assignment.</p>
          </div>
        ) : (
          <ul className="card-list">
            {mine.map(t => (
              <li key={t.id} className={`task-line ${t.done ? 'is-done' : ''}`} onClick={() => navigate(`/a/${t.assignment_id}?task=${t.id}`)}>
                <Check checked={t.done} onChange={v => {
                  setJustDone(s => new Set(s).add(t.id));
                  updateTask(t.id, { done: v });
                  if (v) setTimeout(() => setJustDone(s => { const n = new Set(s); n.delete(t.id); return n; }), 1600);
                }} />
                <div className="task-line__body">
                  <span className="task-line__title">{t.title}</span>
                  <span className="task-line__meta">
                    {t.a?.title}
                    {t.eff && <> · <span className={`due due--${urgency(t.eff, t.done)}`}>{relDue(t.eff).replace(/^Due /, '')}</span></>}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {thisWeek.length > 0 && (
        <section className="section">
          <div className="section__head">
            <h2 className="section__title">Coming up</h2>
            <button className="section__link" onClick={() => navigate('/assignments')}>See all</button>
          </div>
          <ul className="card-list">
            {thisWeek.map(a => <AssignmentRow key={a.id} a={a} d={d} />)}
          </ul>
        </section>
      )}

      {!next && !needsCanvas && (
        <div className="quiet-card">
          <Icon name="sparkle" className="gold" />
          <p>No upcoming deadlines. New assignments from Canvas will appear here automatically.</p>
        </div>
      )}
    </div>
  );
}

function summaryLine(open, upcoming) {
  const soon = upcoming.filter(a => new Date(a.due_at) - Date.now() < 7 * 864e5).length;
  const parts = [];
  if (open.length) parts.push(`${open.length} task${open.length > 1 ? 's' : ''} on your plate`);
  if (soon) parts.push(`${soon} deadline${soon > 1 ? 's' : ''} this week`);
  if (!parts.length) return 'All clear. Nothing urgent on the horizon.';
  return parts.join(' and ') + '.';
}

function NextUp({ a, d, onOpen }) {
  const p = d.progress(a.id);
  const c = countdown(a.due_at);
  const who = d.assignees(a.id);
  const u = urgency(a.due_at);
  return (
    <button className={`hero fade-up hero--${u}`} onClick={onOpen}>
      <div className="hero__shine" />
      <div className="hero__top">
        <span className="eyebrow eyebrow--gold">Next deadline</span>
        {a.course_name && <span className="chip">{a.course_name}</span>}
      </div>
      <h2 className="hero__title">{a.title}</h2>
      <p className="hero__due"><Icon name="clock" size={15} /> {relDue(a.due_at)}</p>
      <div className="hero__bottom">
        <div className="hero__count">
          <span className="hero__num">{c.value}</span>
          <span className="hero__unit">{c.unit}</span>
        </div>
        <div className="hero__progress">
          {p.total > 0 ? <>
            <AvatarStack users={who} size={26} />
            <Ring pct={p.pct} size={44} stroke={3}><span className="ring__txt">{p.done}/{p.total}</span></Ring>
          </> : <span className="hero__cta">Split it into tasks <Icon name="chev" size={16} /></span>}
        </div>
      </div>
    </button>
  );
}
