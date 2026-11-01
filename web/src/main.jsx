import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { StoreProvider, useStore } from './store.jsx';
import { Icon, Spinner, Toasts } from './ui.jsx';
import { AuthScreen, CreateTeamScreen, JoinScreen } from './screens/Auth.jsx';
import { TodayScreen } from './screens/Today.jsx';
import { AssignmentsScreen } from './screens/Assignments.jsx';
import { AssignmentScreen } from './screens/Assignment.jsx';
import { TeamScreen, InviteSheet } from './screens/Team.jsx';
import { CanvasConnect } from './screens/CanvasConnect.jsx';
import { Inbox, PushNudge } from './screens/Notifications.jsx';
import { DocsScreen } from './screens/Docs.jsx';
import { useEffect } from 'react';

function Splash() {
  return <div className="splash"><img src="/icon.svg" alt="" className="splash__mark" /><Spinner /></div>;
}

const TABS = [
  { path: '/', label: 'Today', icon: 'home' },
  { path: '/assignments', label: 'Assignments', icon: 'list' },
  { path: '/docs', label: 'Docs', icon: 'file' },
  { path: '/team', label: 'Team', icon: 'users' },
];

function Shell() {
  const { me, team, board, path, navigate, toasts, toast, loadMe } = useStore();
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [pathname, query] = path.split('?');
  const params = new URLSearchParams(query || '');
  const join = /^\/join\/([\w-]+)/.exec(pathname)?.[1];

  // returning from Google sign-in
  useEffect(() => {
    if (params.get('google') === 'connected') { toast('Google Drive connected ✨'); loadMe(); navigate(pathname, { replace: true }); }
    else if (params.get('google_error')) { toast(params.get('google_error'), { tone: 'error', duration: 6000 }); navigate(pathname, { replace: true }); }
  }, [query]);

  if (me === undefined) return <Splash />;
  if (me === null) return <><AuthScreen invite={join} /><Toasts toasts={toasts} /></>;
  if (join) return <><JoinScreen code={join} /><Toasts toasts={toasts} /></>;
  if (!team) return <><CreateTeamScreen /><Toasts toasts={toasts} /></>;
  if (!board) return <Splash />;

  const detail = /^\/a\/([\w-]+)/.exec(pathname)?.[1];
  const tab = detail ? '/assignments' : (TABS.find(t => t.path === pathname)?.path || '/');
  const open = { openCanvas: () => setCanvasOpen(true), openInvite: () => setInviteOpen(true) };

  let screen;
  if (detail) screen = <AssignmentScreen key={detail} id={detail} taskId={params.get('task')} />;
  else if (tab === '/assignments') screen = <AssignmentsScreen />;
  else if (tab === '/team') screen = <TeamScreen {...open} />;
  else if (tab === '/docs') screen = <DocsScreen openGoogle={() => navigate('/team')} />;
  else screen = <TodayScreen {...open} />;

  return (
    <div className="app">
      <div className="backdrop" />
      <header className="topbar">
        <button className="topbar__brand" onClick={() => navigate('/')}>
          <img src="/icon.svg" alt="" /><span>{team.name}</span>
        </button>
        <nav className="topnav">
          {TABS.map(t => <button key={t.path} className={tab === t.path ? 'is-on' : ''} onClick={() => navigate(t.path)}>{t.label}</button>)}
        </nav>
        <button className="icon-btn bell" onClick={() => setInboxOpen(true)} aria-label="Updates">
          <Icon name="bell" />{me.unread > 0 && <span className="bell__dot">{me.unread > 9 ? '9+' : me.unread}</span>}
        </button>
      </header>

      <main className="main" key={detail ? 'detail' : tab}>
        {!detail && tab === '/' && <PushNudge />}
        {screen}
      </main>

      <nav className="tabbar" aria-label="Main">
        {TABS.map(t => (
          <button key={t.path} className={`tabbar__btn ${tab === t.path ? 'is-on' : ''}`} onClick={() => navigate(t.path)}>
            <Icon name={t.icon} size={22} stroke={tab === t.path ? 1.9 : 1.5} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <CanvasConnect open={canvasOpen} onClose={() => setCanvasOpen(false)} />
      <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <Inbox open={inboxOpen} onClose={() => setInboxOpen(false)} />
      <Toasts toasts={toasts} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<StoreProvider><Shell /></StoreProvider>);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
