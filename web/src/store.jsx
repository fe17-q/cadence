import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { get, post, patch, del } from './api.js';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

// ---------- tiny router ----------
function usePath() {
  const [path, setPath] = useState(location.pathname + location.search);
  useEffect(() => {
    const on = () => setPath(location.pathname + location.search);
    addEventListener('popstate', on);
    return () => removeEventListener('popstate', on);
  }, []);
  const navigate = useCallback((to, { replace = false } = {}) => {
    if (to === location.pathname + location.search) return;
    history[replace ? 'replaceState' : 'pushState'](null, '', to);
    setPath(to);
    window.scrollTo({ top: 0 });
  }, []);
  return [path, navigate];
}

// ---------- toasts ----------
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((text, opts = {}) => {
    const t = { id: Math.random(), text, ...opts };
    setToasts(x => [...x.slice(-2), t]);
    setTimeout(() => setToasts(x => x.filter(y => y.id !== t.id)), opts.duration || 3200);
  }, []);
  return [toasts, toast];
}

export function StoreProvider({ children }) {
  const [path, navigate] = usePath();
  const [toasts, toast] = useToasts();
  const [me, setMe] = useState(undefined); // undefined = loading, null = signed out
  const [teamId, setTeamIdRaw] = useState(() => { try { return localStorage.getItem('teamId'); } catch { return null; } });
  const [board, setBoard] = useState(null);
  const boardTeam = useRef(null);

  const setTeamId = useCallback(id => {
    setTeamIdRaw(id);
    try { id ? localStorage.setItem('teamId', id) : localStorage.removeItem('teamId'); } catch { /* ignore */ }
  }, []);

  const loadMe = useCallback(async () => {
    try { const m = await get('/me'); setMe(m); return m; }
    catch (e) { if (e.status === 401) setMe(null); else setMe(m => m ?? null); return null; }
  }, []);

  useEffect(() => { loadMe(); }, [loadMe]);
  const [config, setConfig] = useState({ google: { enabled: false } });
  useEffect(() => { get('/config').then(setConfig).catch(() => {}); }, []);

  // pick a valid team
  const team = useMemo(() => {
    if (!me?.teams?.length) return null;
    return me.teams.find(t => t.id === teamId) || me.teams[0];
  }, [me, teamId]);

  const refresh = useCallback(async () => {
    if (!team) return;
    try {
      const b = await get(`/teams/${team.id}/board`);
      boardTeam.current = team.id;
      setBoard(b);
    } catch (e) { if (e.status === 401) setMe(null); }
  }, [team?.id]);

  useEffect(() => {
    if (!team) { setBoard(null); return; }
    if (boardTeam.current !== team.id) setBoard(null);
    refresh();
    const iv = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 45e3);
    const onVis = () => { if (document.visibilityState === 'visible') { refresh(); loadMe(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [team?.id, refresh, loadMe]);

  // ---------- mutations (optimistic where it matters) ----------
  const actions = useMemo(() => ({
    async addTask(assignmentId, fields) {
      const { task } = await post(`/assignments/${assignmentId}/tasks`, fields);
      setBoard(b => b && ({ ...b, tasks: [...b.tasks, task] }));
      return task;
    },
    async updateTask(id, fields) {
      let prev;
      setBoard(b => {
        if (!b) return b;
        prev = b.tasks.find(t => t.id === id);
        return { ...b, tasks: b.tasks.map(t => t.id === id ? { ...t, ...fields } : t) };
      });
      try {
        const { task } = await patch(`/tasks/${id}`, fields);
        setBoard(b => b && ({ ...b, tasks: b.tasks.map(t => t.id === id ? task : t) }));
        return task;
      } catch (e) {
        if (prev) setBoard(b => b && ({ ...b, tasks: b.tasks.map(t => t.id === id ? prev : t) }));
        toast(e.message, { tone: 'error' });
        throw e;
      }
    },
    async deleteTask(id) {
      const snapshot = board;
      setBoard(b => b && ({ ...b, tasks: b.tasks.filter(t => t.id !== id && t.parent_id !== id) }));
      try { await del(`/tasks/${id}`); }
      catch (e) { setBoard(snapshot); toast(e.message, { tone: 'error' }); }
    },
    async addAssignment(fields) {
      const { assignment } = await post(`/teams/${team.id}/assignments`, fields);
      setBoard(b => b && ({ ...b, assignments: [...b.assignments, assignment] }));
      return assignment;
    },
    async updateAssignment(id, fields) {
      const { assignment } = await patch(`/assignments/${id}`, fields);
      setBoard(b => b && ({ ...b, assignments: b.assignments.map(a => a.id === id ? { ...a, ...assignment, attachments: a.attachments } : a) }));
    },
    async deleteAssignment(id) {
      await del(`/assignments/${id}`);
      setBoard(b => b && ({ ...b, assignments: b.assignments.filter(a => a.id !== id), tasks: b.tasks.filter(t => t.assignment_id !== id) }));
    },
    async addDoc(fields) {
      const { doc } = await post(`/teams/${team.id}/docs`, fields);
      setBoard(b => b && ({ ...b, docs: [doc, ...(b.docs || [])] }));
      return doc;
    },
    async createDoc(fields) {
      const { doc } = await post(`/teams/${team.id}/docs/create`, fields);
      setBoard(b => b && ({ ...b, docs: [doc, ...(b.docs || [])] }));
      return doc;
    },
    async updateDoc(id, fields) {
      const { doc } = await patch(`/docs/${id}`, fields);
      setBoard(b => b && ({ ...b, docs: b.docs.map(d => d.id === id ? doc : d) }));
    },
    async removeDoc(id) {
      setBoard(b => b && ({ ...b, docs: b.docs.filter(d => d.id !== id) }));
      try { await del(`/docs/${id}`); } catch (e) { toast(e.message, { tone: 'error' }); refresh(); }
    },
    async sync() {
      const r = await post(`/teams/${team.id}/sync`);
      await Promise.all([refresh(), loadMe()]);
      return r.result;
    },
  }), [team?.id, board, refresh, loadMe, toast]);

  const value = {
    path, navigate, toasts, toast, config,
    me, loadMe, setMe, user: me?.user, teams: me?.teams || [], team, setTeamId,
    board, refresh, ...actions,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Derived helpers
export function useDerived() {
  const { board, user } = useStore();
  return useMemo(() => {
    if (!board) return null;
    const members = new Map(board.members.map(m => [m.id, m]));
    const byAssignment = new Map();
    for (const t of board.tasks) {
      if (!byAssignment.has(t.assignment_id)) byAssignment.set(t.assignment_id, []);
      byAssignment.get(t.assignment_id).push(t);
    }
    const progress = aid => {
      const list = byAssignment.get(aid) || [];
      const done = list.filter(t => t.done).length;
      return { total: list.length, done, pct: list.length ? done / list.length : 0 };
    };
    const assignees = aid => {
      const ids = [...new Set((byAssignment.get(aid) || []).map(t => t.assignee_id).filter(Boolean))];
      return ids.map(id => members.get(id)).filter(Boolean);
    };
    const assignmentById = new Map(board.assignments.map(a => [a.id, a]));
    const myTasks = board.tasks.filter(t => t.assignee_id === user?.id);
    return { members, byAssignment, progress, assignees, assignmentById, myTasks };
  }, [board, user?.id]);
}
