import { useEffect, useState } from 'react';
import { post } from '../api.js';
import { useStore } from '../store.jsx';
import { Button, Icon, Sheet } from '../ui.jsx';

export function CanvasConnect({ open, onClose }) {
  const { team, loadMe, refresh, toast } = useStore();
  const [step, setStep] = useState('choose'); // choose | token | courses | ical | done
  const [base, setBase] = useState(team.canvas.base_url || '');
  const [tk, setTk] = useState('');
  const [courses, setCourses] = useState([]);
  const [picked, setPicked] = useState(new Set(team.canvas.course_ids));
  const [ical, setIcal] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => { if (open) { setStep('choose'); setError(''); setTk(''); } }, [open]);

  async function loadCourses(e) {
    e?.preventDefault(); setBusy(true); setError('');
    try {
      const r = await post(`/teams/${team.id}/canvas/courses`, { base_url: base, token: tk });
      setBase(r.base_url); setCourses(r.courses);
      const guess = r.courses.filter(c => /senior|capstone|design/i.test(c.name)).map(c => c.id);
      setPicked(new Set(team.canvas.course_ids.length ? team.canvas.course_ids : guess));
      setStep('courses');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function saveToken() {
    setBusy(true); setError('');
    try {
      const r = await post(`/teams/${team.id}/canvas`, { base_url: base, token: tk, course_ids: [...picked] });
      setResult(r.result); await Promise.all([loadMe(), refresh()]); setStep('done');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function saveIcal(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = await post(`/teams/${team.id}/ical`, { url: ical, filter });
      setResult(r.result); await Promise.all([loadMe(), refresh()]); setStep('done');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  const host = (() => { try { return new URL(/^https?:/.test(base) ? base : 'https://' + base).host; } catch { return 'your-school.instructure.com'; } })();

  return (
    <Sheet open={open} onClose={onClose} title={step === 'done' ? null : 'Connect Canvas'} tall>
      {step === 'choose' && (
        <div className="stack">
          <p className="muted">Do this once. After that, Cadence checks Canvas every few hours and adds new assignments for the whole team on its own.</p>
          <button className="option" onClick={() => setStep('token')}>
            <span className="setup__icon"><Icon name="key" /></span>
            <span className="setup__text"><strong>Canvas access token <span className="chip chip--gold">Best</span></strong>
              <span>Full descriptions, attached files, points. Takes about a minute.</span></span>
            <Icon name="chev" className="muted" />
          </button>
          <button className="option" onClick={() => setStep('ical')}>
            <span className="setup__icon"><Icon name="calendar" /></span>
            <span className="setup__text"><strong>Calendar feed link</strong>
              <span>If your school turned off tokens. Due dates and titles only.</span></span>
            <Icon name="chev" className="muted" />
          </button>
        </div>
      )}

      {step === 'token' && (
        <form className="stack" onSubmit={loadCourses}>
          <label className="field"><span className="field__label">Your Canvas address</span>
            <input className="field__input" value={base} onChange={e => setBase(e.target.value)} placeholder="school.instructure.com" inputMode="url" autoCapitalize="off" autoCorrect="off" autoFocus /></label>
          <ol className="howto">
            <li>Open <a href={`https://${host}/profile/settings`} target="_blank" rel="noopener">Canvas → Account → Settings</a></li>
            <li>Scroll to <strong>Approved Integrations</strong> and tap <strong>+ New Access Token</strong></li>
            <li>Purpose: <em>Cadence</em>. Leave the expiry blank, or set it to the end of the semester</li>
            <li>Copy the token and paste it below</li>
          </ol>
          <label className="field"><span className="field__label">Access token</span>
            <input className="field__input mono" value={tk} onChange={e => setTk(e.target.value)} placeholder="Paste token" autoCapitalize="off" autoCorrect="off" spellCheck={false} /></label>
          <p className="muted small"><Icon name="key" size={13} /> Stored encrypted and only used to read your course. Teammates never see it.</p>
          {error && <p className="form-error">{error}</p>}
          <Button type="submit" loading={busy} disabled={!base || (!tk && !team.canvas.base_url)}>Find my courses</Button>
          <button type="button" className="link-btn" onClick={() => setStep('choose')}>Back</button>
        </form>
      )}

      {step === 'courses' && (
        <div className="stack">
          <p className="muted">Which course should feed your team? Pick your senior design class.</p>
          <ul className="course-list">
            {courses.map(c => (
              <li key={c.id}>
                <label className={`course ${picked.has(c.id) ? 'is-on' : ''}`}>
                  <input type="checkbox" checked={picked.has(c.id)} onChange={() => setPicked(s => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} />
                  <span className="course__check"><Icon name="check" size={14} stroke={2.6} /></span>
                  <span className="course__text"><strong>{c.name}</strong><span>{[c.code, c.term].filter(Boolean).join(' · ')}</span></span>
                </label>
              </li>
            ))}
            {courses.length === 0 && <p className="muted">No active courses found on this account.</p>}
          </ul>
          {error && <p className="form-error">{error}</p>}
          <Button onClick={saveToken} loading={busy} disabled={!picked.size}>Import assignments</Button>
        </div>
      )}

      {step === 'ical' && (
        <form className="stack" onSubmit={saveIcal}>
          <ol className="howto">
            <li>Open <strong>Calendar</strong> in Canvas</li>
            <li>At the bottom right, tap <strong>Calendar Feed</strong></li>
            <li>Copy the link and paste it below</li>
          </ol>
          <label className="field"><span className="field__label">Calendar feed link</span>
            <input className="field__input mono" value={ical} onChange={e => setIcal(e.target.value)} placeholder="https://…/feeds/calendars/user_….ics" autoCapitalize="off" autoCorrect="off" /></label>
          <label className="field"><span className="field__label">Only include courses containing (optional)</span>
            <input className="field__input" value={filter} onChange={e => setFilter(e.target.value)} placeholder="e.g. EEL 4914" /></label>
          {error && <p className="form-error">{error}</p>}
          <Button type="submit" loading={busy} disabled={!ical}>Import assignments</Button>
          <button type="button" className="link-btn" onClick={() => setStep('choose')}>Back</button>
        </form>
      )}

      {step === 'done' && (
        <div className="done-state">
          <div className="done-state__badge"><Icon name="check" size={30} stroke={2.2} /></div>
          <h2 className="display display--sm">You're connected.</h2>
          <p className="muted">Imported {result?.total ?? 0} assignment{result?.total === 1 ? '' : 's'}. New ones will appear automatically, and the team gets a heads-up when they do.</p>
          <Button onClick={() => { onClose(); toast('Canvas connected ✨'); }}>Beautiful</Button>
        </div>
      )}
    </Sheet>
  );
}
