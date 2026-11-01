import { useEffect, useState } from 'react';
import { get, post } from '../api.js';
import { useStore } from '../store.jsx';
import { AvatarStack, Button, Spinner } from '../ui.jsx';

function Brand({ small }) {
  return (
    <div className={`brand ${small ? 'brand--small' : ''}`}>
      <img src="/icon.svg" alt="" className="brand__mark" />
      <span className="brand__word">Cadence</span>
    </div>
  );
}

function Field({ label, ...props }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="field__input" {...props} />
    </label>
  );
}

export function AuthScreen({ invite }) {
  const { loadMe, navigate, setTeamId } = useStore();
  const [mode, setMode] = useState(invite ? 'signup' : 'welcome');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [inviteInfo, setInviteInfo] = useState(null);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (!invite) return;
    get(`/invite/${invite}`).then(setInviteInfo).catch(e => setInviteInfo({ error: e.message }));
  }, [invite]);

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await post(mode === 'signup' ? '/auth/signup' : '/auth/login', { ...form, invite });
      if (r.teamId) setTeamId(r.teamId);
      await loadMe();
      navigate('/', { replace: true });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <div className="auth__glow" />
      <div className="auth__inner">
        <Brand />
        {invite && inviteInfo && !inviteInfo.error && (
          <div className="invite-card fade-up">
            <AvatarStack users={inviteInfo.members.map((m, i) => ({ ...m, id: i }))} size={30} />
            <p className="invite-card__text">You're invited to join</p>
            <h2 className="invite-card__team">{inviteInfo.team.name}</h2>
          </div>
        )}
        {invite && inviteInfo?.error && <p className="form-error">{inviteInfo.error}</p>}

        {mode === 'welcome' ? (
          <div className="auth__welcome fade-up">
            <h1 className="display">Your senior design,<br /><em>beautifully</em> in sync.</h1>
            <p className="auth__lede">Every Canvas deadline, every task, every teammate. One calm place.</p>
            <div className="stack">
              <Button onClick={() => setMode('signup')}>Get started</Button>
              <Button variant="ghost" onClick={() => setMode('login')}>I already have an account</Button>
            </div>
          </div>
        ) : (
          <form className="auth__form fade-up" onSubmit={submit}>
            {!invite && <h1 className="display display--sm">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>}
            {mode === 'signup' && <Field label="Your name" autoComplete="name" value={form.name} onChange={set('name')} placeholder="Fernando Quijada" autoFocus />}
            <Field label="Email" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={set('email')} placeholder="you@school.edu" autoFocus={mode === 'login'} />
            <Field label="Password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={form.password} onChange={set('password')} placeholder={mode === 'signup' ? 'At least 6 characters' : ''} />
            {error && <p className="form-error">{error}</p>}
            <Button type="submit" loading={busy}>{mode === 'signup' ? (invite ? 'Join the team' : 'Create account') : 'Sign in'}</Button>
            <button type="button" className="link-btn" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); }}>
              {mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function JoinScreen({ code }) {
  // Signed-in user following an invite link.
  const { navigate, loadMe, setTeamId, toast } = useStore();
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { get(`/invite/${code}`).then(setInfo).catch(e => setInfo({ error: e.message })); }, [code]);
  async function join() {
    setBusy(true);
    try {
      const r = await post(`/invite/${code}/join`);
      setTeamId(r.teamId); await loadMe(); navigate('/', { replace: true });
      toast(`Welcome to ${info.team.name} ✨`);
    } catch (e) { toast(e.message, { tone: 'error' }); setBusy(false); }
  }
  return (
    <div className="auth"><div className="auth__glow" />
      <div className="auth__inner">
        <Brand />
        {!info ? <Spinner /> : info.error ? (
          <><p className="form-error">{info.error}</p><Button variant="ghost" onClick={() => navigate('/')}>Go home</Button></>
        ) : (
          <div className="invite-card fade-up">
            <AvatarStack users={info.members.map((m, i) => ({ ...m, id: i }))} size={34} />
            <p className="invite-card__text">You're invited to join</p>
            <h2 className="invite-card__team">{info.team.name}</h2>
            <Button onClick={join} loading={busy}>Join team</Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function CreateTeamScreen() {
  const { loadMe, setTeamId, user } = useStore();
  const [name, setName] = useState('Senior Design');
  const [busy, setBusy] = useState(false);
  async function create(e) {
    e.preventDefault(); setBusy(true);
    const { team } = await post('/teams', { name, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    setTeamId(team.id); await loadMe();
  }
  return (
    <div className="auth"><div className="auth__glow" />
      <form className="auth__inner fade-up" onSubmit={create}>
        <Brand small />
        <h1 className="display display--sm">Hi {user?.name?.split(' ')[0]}. Let's set up your team.</h1>
        <p className="auth__lede">Give it a name. You'll invite everyone with a link in a moment.</p>
        <Field label="Team name" value={name} onChange={e => setName(e.target.value)} autoFocus />
        <Button type="submit" loading={busy}>Create team</Button>
        <p className="muted small center">Got an invite link from a teammate? Just open it and you'll join their team instead.</p>
      </form>
    </div>
  );
}
