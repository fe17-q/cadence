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
  const { loadMe, navigate, setTeamId, config } = useStore();
  const [sent, setSent] = useState(false);
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
      if (mode === 'forgot') { await post('/auth/forgot', { email: form.email }); setSent(true); return; }
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
        ) : mode === 'forgot' ? (
          <form className="auth__form fade-up" onSubmit={submit}>
            <h1 className="display display--sm">{sent ? 'Check your email' : 'Reset your password'}</h1>
            {sent ? (
              <p className="auth__lede">If <b>{form.email}</b> has a Cadence account, a reset link is on its way. It expires in 1 hour, and it might land in spam.</p>
            ) : (<>
              <p className="auth__lede">Enter the email you signed up with and we'll send you a link to choose a new password.</p>
              <Field label="Email" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={set('email')} placeholder="you@school.edu" autoFocus />
              {error && <p className="form-error">{error}</p>}
              <Button type="submit" loading={busy}>Send reset link</Button>
            </>)}
            <button type="button" className="link-btn" onClick={() => { setMode('login'); setSent(false); setError(''); }}>Back to sign in</button>
          </form>
        ) : (
          <form className="auth__form fade-up" onSubmit={submit}>
            {!invite && <h1 className="display display--sm">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>}
            {mode === 'signup' && <Field label="Your name" autoComplete="name" value={form.name} onChange={set('name')} placeholder="Fernando Quijada" autoFocus />}
            <Field label="Email" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={set('email')} placeholder="you@school.edu" autoFocus={mode === 'login'} />
            <Field label="Password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={form.password} onChange={set('password')} placeholder={mode === 'signup' ? 'At least 6 characters' : ''} />
            {mode === 'login' && config.mail && <button type="button" className="link-btn link-btn--right" onClick={() => { setMode('forgot'); setError(''); }}>Forgot password?</button>}
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

export function ResetScreen({ token }) {
  const { loadMe, navigate } = useStore();
  const [info, setInfo] = useState(null);
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { get(`/auth/reset/${token}`).then(setInfo).catch(e => setInfo({ error: e.message })); }, [token]);
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try { await post('/auth/reset', { token, password: pw }); await loadMe(); navigate('/', { replace: true }); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="auth">
      <div className="auth__glow" />
      <div className="auth__inner">
        <Brand />
        {!info ? <Spinner /> : info.error ? (
          <div className="auth__form fade-up">
            <h1 className="display display--sm">Link expired</h1>
            <p className="auth__lede">{info.error}</p>
            <Button onClick={() => navigate('/', { replace: true })}>Back to sign in</Button>
          </div>
        ) : (
          <form className="auth__form fade-up" onSubmit={submit}>
            <h1 className="display display--sm">Choose a new password</h1>
            <p className="auth__lede">For <b>{info.email}</b></p>
            <input type="email" autoComplete="username" value={info.email} readOnly hidden />
            <Field label="New password" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} placeholder="At least 6 characters" autoFocus />
            {error && <p className="form-error">{error}</p>}
            <Button type="submit" loading={busy}>Save and sign in</Button>
          </form>
        )}
      </div>
    </div>
  );
}
