import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, useDerived } from '../store.jsx';
import { Avatar, AvatarStack, Button, Check, Icon, MemberPicker, Ring, Sheet } from '../ui.jsx';
import { DocsSection, TaskDocs } from './Docs.jsx';
import { fileKind, fromLocalInput, relDue, toLocalInput, urgency } from '../util.js';

export function AssignmentScreen({ id, taskId }) {
  const { board, navigate, path } = useStore();
  const d = useDerived();
  const a = d.assignmentById.get(id);
  const [briefOpen, setBriefOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  if (!a) {
    return <div className="screen"><BackBar />
      <div className="empty"><h3 className="empty__title">This assignment isn't here anymore</h3>
        <Button variant="ghost" onClick={() => navigate('/assignments')}>See all assignments</Button></div></div>;
  }
  const tasks = d.byAssignment.get(a.id) || [];
  const top = tasks.filter(t => !t.parent_id);
  const p = d.progress(a.id);
  const u = urgency(a.due_at, p.total > 0 && p.done === p.total);
  const openTask = tid => navigate(`/a/${a.id}${tid ? `?task=${tid}` : ''}`, { replace: !!taskId || !tid });

  return (
    <div className="screen detail">
      <BackBar right={a.source === 'manual' && <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Edit"><Icon name="more" /></button>} />
      <header className="detail__head fade-up">
        <div className="detail__labels">
          {a.course_name && <span className="chip">{a.course_name}</span>}
          {a.source === 'manual' ? <span className="chip chip--soft">Team milestone</span> : <span className="chip chip--soft"><Icon name="sync" size={12} /> From Canvas</span>}
          {a.points ? <span className="chip chip--soft">{a.points} pts</span> : null}
        </div>
        <h1 className="display display--md">{a.title}</h1>
        <div className="detail__due">
          <span className={`due-pill due-pill--${u}`}><Icon name="clock" size={15} /> {relDue(a.due_at)}</span>
          {a.due_at && <span className="muted small">{new Date(a.due_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
        </div>
      </header>

      <section className="progress-card fade-up">
        <Ring pct={p.pct} size={52} stroke={3.5}><span className="ring__txt">{Math.round(p.pct * 100)}%</span></Ring>
        <div className="progress-card__text">
          <strong>{p.total === 0 ? 'No tasks yet' : p.done === p.total ? 'Everything is done' : `${p.total - p.done} of ${p.total} tasks left`}</strong>
          <span>{p.total === 0 ? 'Break it down and split the work below.' : 'Tap a task to assign it or set a date.'}</span>
        </div>
        <AvatarStack users={d.assignees(a.id)} size={26} />
      </section>

      <section className="section">
        <div className="section__head"><h2 className="section__title">Tasks</h2></div>
        <ul className="card-list tasks">
          {top.map(t => <TaskRow key={t.id} t={t} subs={tasks.filter(s => s.parent_id === t.id)} d={d} onOpen={() => openTask(t.id)} />)}
          <li className="composer-li"><Composer assignmentId={a.id} members={board.members} /></li>
        </ul>
      </section>

      <DocsSection assignment={a} />

      {(a.description_html || a.attachments?.length > 0 || a.html_url) && (
        <section className="section">
          <div className="section__head"><h2 className="section__title">The brief</h2></div>
          {a.description_html && (
            <div className={`brief ${briefOpen ? 'is-open' : ''}`}>
              <div className="brief__body rich" dangerouslySetInnerHTML={{ __html: a.description_html }} />
              {!briefOpen && <button className="brief__more" onClick={() => setBriefOpen(true)}>Read the full brief <Icon name="down" size={16} /></button>}
            </div>
          )}
          {a.attachments?.length > 0 && (
            <ul className="files">
              {a.attachments.map(f => (
                <li key={f.url}><a className="file" href={f.url} target="_blank" rel="noopener">
                  <span className={`file__kind file__kind--${fileKind(f.name)}`}>{fileKind(f.name)}</span>
                  <span className="file__name">{f.name}</span>
                  <Icon name="link" size={16} className="muted" />
                </a></li>
              ))}
            </ul>
          )}
          {a.html_url && <a className="btn btn--ghost btn--block" href={a.html_url} target="_blank" rel="noopener"><Icon name="link" size={16} /> Open in Canvas</a>}
        </section>
      )}

      <TaskSheet taskId={taskId} assignment={a} onClose={() => openTask(null)} />
      {a.source === 'manual' && <EditMilestone a={a} open={editing} onClose={() => setEditing(false)} />}
    </div>
  );
}

function BackBar({ right }) {
  const { navigate } = useStore();
  return (
    <div className="backbar">
      <button className="icon-btn" onClick={() => (history.length > 1 ? history.back() : navigate('/assignments'))} aria-label="Back"><Icon name="back" size={22} /></button>
      <div>{right}</div>
    </div>
  );
}

function TaskRow({ t, subs, d, onOpen }) {
  const { updateTask } = useStore();
  const [open, setOpen] = useState(false);
  const assignee = d.members.get(t.assignee_id);
  const subDone = subs.filter(s => s.done).length;
  return (
    <li className={`task ${t.done ? 'is-done' : ''}`}>
      <div className="task__main" onClick={onOpen}>
        <Check checked={t.done} onChange={v => updateTask(t.id, { done: v })} />
        <div className="task__body">
          <span className="task__title">{t.title}</span>
          <span className="task__meta">
            {subs.length > 0 && <button className="task__subs" onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>
              <Icon name="sub" size={13} /> {subDone}/{subs.length} <Icon name="down" size={13} className={open ? 'rot' : ''} />
            </button>}
            {t.due_at && <span className={`due due--${urgency(t.due_at, t.done)}`}>{relDue(t.due_at).replace(/^Due /, '')}</span>}
            {t.notes && <Icon name="note" size={13} className="muted" />}
          </span>
        </div>
        <Avatar user={assignee} size={28} />
      </div>
      {open && subs.length > 0 && (
        <ul className="subtasks">
          {subs.map(s => (
            <li key={s.id} className={`subtask ${s.done ? 'is-done' : ''}`} onClick={onOpen}>
              <Check size={20} checked={s.done} onChange={v => updateTask(s.id, { done: v })} />
              <span className="subtask__title">{s.title}</span>
              {s.assignee_id && <Avatar user={d.members.get(s.assignee_id)} size={20} />}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Composer({ assignmentId, parentId, members, placeholder = 'Add a task…', compact }) {
  const { addTask, toast } = useStore();
  const [title, setTitle] = useState('');
  const [who, setWho] = useState(null);
  const [picking, setPicking] = useState(false);
  const input = useRef(null);
  async function submit(e) {
    e.preventDefault();
    const v = title.trim();
    if (!v) return;
    setTitle('');
    try { await addTask(assignmentId, { title: v, parent_id: parentId, assignee_id: who }); }
    catch (err) { toast(err.message, { tone: 'error' }); setTitle(v); }
    input.current?.focus();
  }
  const person = members.find(m => m.id === who);
  return (
    <form className={`composer ${compact ? 'composer--compact' : ''} ${picking ? 'is-picking' : ''}`} onSubmit={submit}>
      <div className="composer__row">
        <span className="composer__plus"><Icon name="plus" size={18} /></span>
        <input ref={input} className="composer__input" value={title} onChange={e => setTitle(e.target.value)} placeholder={placeholder} enterKeyHint="done" />
        {!compact && (
          <button type="button" className="composer__avatar" onClick={() => setPicking(p => !p)} aria-label="Choose who" aria-expanded={picking}>
            <Avatar user={person} size={26} title={person ? `For ${person.name}` : 'Assign to…'} />
          </button>
        )}
        {title.trim() && <button type="submit" className="composer__go" aria-label="Add"><Icon name="check" size={16} stroke={2.4} /></button>}
      </div>
      {picking && (
        <div className="composer__picker">
          <span className="sheet-block__label">Who's on it?</span>
          <MemberPicker members={members} value={who} onChange={v => { setWho(v); setPicking(false); input.current?.focus(); }} />
        </div>
      )}
    </form>
  );
}

function TaskSheet({ taskId, assignment, onClose }) {
  const { board, updateTask, deleteTask } = useStore();
  const d = useDerived();
  const t = taskId ? board.tasks.find(x => x.id === taskId) : null;
  const [last, setLast] = useState(t);
  useEffect(() => { if (t) setLast(t); }, [t]);
  const task = t || last;
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [subPick, setSubPick] = useState(null);
  useEffect(() => { if (task) { setTitle(task.title); setNotes(task.notes || ''); } }, [task?.id]);

  const subs = useMemo(() => task ? board.tasks.filter(s => s.parent_id === task.id) : [], [board.tasks, task?.id]);
  if (!task) return null;
  const parent = task.parent_id ? d.byAssignment.get(assignment.id)?.find(x => x.id === task.parent_id) : null;

  const quick = [];
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1); tomorrow.setHours(17, 0, 0, 0);
  quick.push(['Tomorrow', tomorrow]);
  const in3 = new Date(now); in3.setDate(now.getDate() + 3); in3.setHours(17, 0, 0, 0);
  quick.push(['In 3 days', in3]);
  if (assignment.due_at) {
    const before = new Date(assignment.due_at); before.setDate(before.getDate() - 1);
    if (before > now) quick.push(['Day before deadline', before]);
  }

  return (
    <Sheet open={!!t} onClose={onClose} tall>
      <div className="task-sheet">
        {parent && <p className="eyebrow">Subtask of {parent.title}</p>}
        <div className="task-sheet__title">
          <Check checked={task.done} size={28} onChange={v => updateTask(task.id, { done: v })} />
          <textarea className="title-input" rows={1} value={title} onChange={e => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== task.title && updateTask(task.id, { title })}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }} />
        </div>

        <div className="sheet-block">
          <span className="sheet-block__label">Who's on it</span>
          <MemberPicker members={board.members} value={task.assignee_id} onChange={v => updateTask(task.id, { assignee_id: v })} />
        </div>

        <div className="sheet-block">
          <span className="sheet-block__label">When</span>
          <div className="chips">
            {quick.map(([label, date]) => (
              <button key={label} className="chip chip--btn" onClick={() => updateTask(task.id, { due_at: date.toISOString() })}>{label}</button>
            ))}
            {task.due_at && <button className="chip chip--btn chip--soft" onClick={() => updateTask(task.id, { due_at: null })}>Clear</button>}
          </div>
          <input className="field__input" type="datetime-local" value={toLocalInput(task.due_at)} onChange={e => updateTask(task.id, { due_at: fromLocalInput(e.target.value) })} />
        </div>

        {!task.parent_id && (
          <div className="sheet-block">
            <span className="sheet-block__label">Subtasks</span>
            <ul className="card-list card-list--flat">
              {subs.map(s => (
                <li key={s.id} className={s.done ? 'is-done' : ''}>
                  <div className={`subtask subtask--sheet ${s.done ? 'is-done' : ''}`}>
                    <Check size={22} checked={s.done} onChange={v => updateTask(s.id, { done: v })} />
                    <span className="subtask__title">{s.title}</span>
                    <SubAssign s={s} open={subPick === s.id} onToggle={() => setSubPick(p => p === s.id ? null : s.id)} />
                    <button className="icon-btn icon-btn--sm" aria-label="Delete subtask" onClick={() => deleteTask(s.id)}><Icon name="x" size={16} /></button>
                  </div>
                  {subPick === s.id && <div className="composer__picker">
                    <MemberPicker members={board.members} value={s.assignee_id} onChange={v => { updateTask(s.id, { assignee_id: v }); setSubPick(null); }} />
                  </div>}
                </li>
              ))}
              <li><Composer assignmentId={assignment.id} parentId={task.id} members={board.members} placeholder="Add a subtask…" compact /></li>
            </ul>
          </div>
        )}

        <TaskDocs task={task} />

        <div className="sheet-block">
          <span className="sheet-block__label">Notes</span>
          <textarea className="field__input" rows={3} value={notes} placeholder="Links, details, anything useful…"
            onChange={e => setNotes(e.target.value)} onBlur={() => notes !== (task.notes || '') && updateTask(task.id, { notes })} />
        </div>

        <button className="danger-link" onClick={() => { deleteTask(task.id); onClose(); }}><Icon name="trash" size={16} /> Delete task</button>
      </div>
    </Sheet>
  );
}

function SubAssign({ s, open, onToggle }) {
  const { board } = useStore();
  const who = board.members.find(m => m.id === s.assignee_id);
  return <button type="button" className="composer__avatar" onClick={onToggle} aria-expanded={open} aria-label="Assign subtask"><Avatar user={who} size={22} /></button>;
}

function EditMilestone({ a, open, onClose }) {
  const { updateAssignment, deleteAssignment, navigate, toast } = useStore();
  const [title, setTitle] = useState(a.title);
  const [due, setDue] = useState(toLocalInput(a.due_at));
  useEffect(() => { if (open) { setTitle(a.title); setDue(toLocalInput(a.due_at)); } }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title="Edit milestone">
      <div className="stack">
        <label className="field"><span className="field__label">Name</span><input className="field__input" value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label className="field"><span className="field__label">Due</span><input className="field__input" type="datetime-local" value={due} onChange={e => setDue(e.target.value)} /></label>
        <Button onClick={async () => { await updateAssignment(a.id, { title, due_at: fromLocalInput(due) }); onClose(); }}>Save</Button>
        <button className="danger-link" onClick={async () => {
          if (!confirm('Delete this milestone and its tasks?')) return;
          try { await deleteAssignment(a.id); onClose(); navigate('/assignments', { replace: true }); } catch (e) { toast(e.message, { tone: 'error' }); }
        }}><Icon name="trash" size={16} /> Delete milestone</button>
      </div>
    </Sheet>
  );
}
