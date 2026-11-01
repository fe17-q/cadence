import { useMemo, useState } from 'react';
import { useStore, useDerived } from '../store.jsx';
import { AvatarStack, Button, Empty, Icon, Ring, Sheet } from '../ui.jsx';
import { bucket, fromLocalInput, relDue, urgency } from '../util.js';

export function AssignmentRow({ a, d }) {
  const { navigate } = useStore();
  const p = d.progress(a.id);
  const date = a.due_at ? new Date(a.due_at) : null;
  const done = p.total > 0 && p.done === p.total;
  return (
    <li className={`a-row ${done ? 'is-done' : ''}`} onClick={() => navigate(`/a/${a.id}`)}>
      <div className={`date-tile date-tile--${urgency(a.due_at, done)}`}>
        {date ? <>
          <span className="date-tile__mon">{date.toLocaleDateString([], { month: 'short' })}</span>
          <span className="date-tile__day">{date.getDate()}</span>
        </> : <Icon name="calendar" size={18} />}
      </div>
      <div className="a-row__body">
        <span className="a-row__title">{a.title}</span>
        <span className="a-row__meta">
          <span className={`due due--${urgency(a.due_at, done)}`}>{relDue(a.due_at)}</span>
        </span>
      </div>
      <div className="a-row__side">
        <AvatarStack users={d.assignees(a.id)} size={22} max={3} />
        {p.total > 0 && <Ring pct={p.pct} size={30} stroke={2.5}><span className="ring__txt ring__txt--sm">{p.done}</span></Ring>}
      </div>
    </li>
  );
}

const ORDER = ['Today', 'Tomorrow', 'This week', 'Next week', 'Later', 'Someday'];

export function AssignmentsScreen() {
  const { board } = useStore();
  const d = useDerived();
  const [tab, setTab] = useState('upcoming');
  const [adding, setAdding] = useState(false);

  const groups = useMemo(() => {
    const now = new Date();
    const list = board.assignments.filter(a => {
      const past = a.due_at && new Date(a.due_at) < now;
      return tab === 'upcoming' ? !past : past;
    });
    if (tab === 'past') return [['', list.sort((a, b) => new Date(b.due_at) - new Date(a.due_at))]];
    const m = new Map();
    for (const a of list) {
      const k = bucket(a.due_at, now);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(a);
    }
    return ORDER.filter(k => m.has(k)).map(k => [k, m.get(k)]);
  }, [board.assignments, tab]);

  const count = groups.reduce((n, [, l]) => n + l.length, 0);

  return (
    <div className="screen">
      <header className="page-head fade-up">
        <h1 className="display display--md">Assignments</h1>
        <button className="fab-inline" onClick={() => setAdding(true)} aria-label="Add assignment"><Icon name="plus" /></button>
      </header>
      <div className="segmented">
        <button className={tab === 'upcoming' ? 'is-on' : ''} onClick={() => setTab('upcoming')}>Upcoming</button>
        <button className={tab === 'past' ? 'is-on' : ''} onClick={() => setTab('past')}>Past</button>
      </div>

      {count === 0 ? (
        <Empty title={tab === 'upcoming' ? 'Nothing upcoming' : 'Nothing here yet'}>
          {tab === 'upcoming' ? 'When your professor posts something on Canvas, it lands here on its own.' : 'Finished assignments will collect here.'}
        </Empty>
      ) : groups.map(([label, list]) => (
        <section className="section" key={label || 'all'}>
          {label && <div className="section__head"><h2 className="section__title">{label}</h2><span className="section__meta">{list.length}</span></div>}
          <ul className="card-list">{list.map(a => <AssignmentRow key={a.id} a={a} d={d} />)}</ul>
        </section>
      ))}

      <AddAssignmentSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function AddAssignmentSheet({ open, onClose }) {
  const { addAssignment, navigate, toast } = useStore();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const a = await addAssignment({ title, due_at: fromLocalInput(due), description: desc });
      setTitle(''); setDue(''); setDesc(''); onClose();
      navigate(`/a/${a.id}`);
    } catch (err) { toast(err.message, { tone: 'error' }); }
    finally { setBusy(false); }
  }
  return (
    <Sheet open={open} onClose={onClose} title="New milestone">
      <form className="stack" onSubmit={save}>
        <p className="muted small">For things that aren't on Canvas, like a team meeting, prototype demo, or internal deadline.</p>
        <label className="field"><span className="field__label">Name</span>
          <input className="field__input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Prototype demo with advisor" autoFocus /></label>
        <label className="field"><span className="field__label">Due</span>
          <input className="field__input" type="datetime-local" value={due} onChange={e => setDue(e.target.value)} /></label>
        <label className="field"><span className="field__label">Notes</span>
          <textarea className="field__input" rows={3} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional" /></label>
        <Button type="submit" loading={busy} disabled={!title.trim()}>Add</Button>
      </form>
    </Sheet>
  );
}
