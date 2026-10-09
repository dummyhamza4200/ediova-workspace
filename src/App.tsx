import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronLeft, ChevronRight,
  Clock3, ExternalLink, FileText, LayoutDashboard, Link as LinkIcon, LockKeyhole, LogOut,
  MessageCircle, Plus, Search, ShieldCheck, Sparkles, Target, UserRound, Users, X,
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './lib/supabase';

type Role = 'manager' | 'managing_director';
type Status = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'archived';
type Priority = 'low' | 'normal' | 'high' | 'urgent';
type View = 'dashboard' | 'tasks' | 'calendar' | 'completed' | 'profile' | 'policies' | 'privacy';
type Profile = { id: string; full_name: string; role: Role; location?: string | null; experience?: string | null };
type Task = {
  id: string; title: string; description: string; scheduled_at: string; deadline_at: string;
  priority: Priority; status: Status; resource_url?: string | null; resource_urls?: string[]; assignee_id?: string | null;
  created_by?: string | null; completed_at?: string | null; updated_at?: string;
};
type Comment = { id: string; task_id: string; author_id: string; body: string; created_at: string; author_name?: string };
type Draft = { title: string; description: string; scheduled: string; deadline: string; priority: Priority; resource: string; assignee: string };

const managerDemo: Profile = { id: 'demo-manager', full_name: 'Umna Haroon', role: 'manager', location: 'Islamabad, Pakistan', experience: '2+ years' };
const directorDemo: Profile = { id: 'demo-director', full_name: 'Managing Director', role: 'managing_director' };
const TASK_KEY = 'ediova-workspace-demo-tasks-v1';
const COMMENT_KEY = 'ediova-workspace-demo-comments-v1';
const hour = (n: number) => new Date(Date.now() + n * 3600000).toISOString();
const demoTasks = (): Task[] => [
  { id: 'demo-1', title: 'Polish the brand presentation', description: 'Review the latest brand presentation, refine the opening slides, and make the visual rhythm consistent from start to finish. Check typography, transitions and the final call to action.', scheduled_at: hour(-8), deadline_at: hour(9), priority: 'high', status: 'in_progress', resource_url: 'https://ediova.com' },
  { id: 'demo-2', title: 'Prepare the client cut list', description: 'Compile requested edits, group notes by scene, and flag any feedback that needs clarification before the next editing pass.', scheduled_at: hour(-3), deadline_at: hour(22), priority: 'normal', status: 'pending' },
  { id: 'demo-3', title: 'Share the weekly project recap', description: 'Summarise deliverables, pending decisions and next milestones. Add relevant links so the team can review everything in one place.', scheduled_at: hour(-38), deadline_at: hour(-12), priority: 'urgent', status: 'pending' },
  { id: 'demo-4', title: 'Schedule the campaign edits', description: 'Collect approved exports, confirm destination links, and prepare the publishing schedule for the upcoming campaign.', scheduled_at: hour(25), deadline_at: hour(50), priority: 'normal', status: 'pending', resource_url: 'https://example.com/brief' },
  { id: 'demo-5', title: 'Export final motion versions', description: 'Export approved motion assets in the requested aspect ratios and confirm filenames and delivery folders.', scheduled_at: hour(-95), deadline_at: hour(-75), priority: 'low', status: 'completed', completed_at: hour(-76) },
];
function parseLinks(value?: string | null) {
  return (value || '').split(/[\n,]+/).map(item => item.trim()).filter(Boolean);
}
function fromDatabaseTask(row: Record<string, unknown>): Task {
  const links = Array.isArray(row.links) ? row.links.filter((item): item is string => typeof item === 'string') : [];
  const normalizedLinks = links.length ? links : (typeof row.resource_url === 'string' ? [row.resource_url] : []);
  return {
    ...(row as unknown as Task),
    scheduled_at: String(row.schedule_at ?? row.scheduled_at ?? ''),
    priority: (row.priority === 'medium' ? 'normal' : row.priority) as Priority,
    status: row.status as Status,
    resource_urls: normalizedLinks,
    resource_url: normalizedLinks[0] || null,
  };
}
function toDatabaseTask(changes: { title: string; description: string; scheduled_at: string; deadline_at: string; priority: Priority; resource_url: string | null; assignee_id: string }): Record<string, unknown> {
  const { scheduled_at, priority, resource_url, ...rest } = changes;
  return {
    ...rest,
    schedule_at: scheduled_at,
    priority: priority === 'normal' ? 'medium' : priority,
    links: parseLinks(resource_url),
  };
}
function safeRead<T>(key: string, fallback: () => T): T {
  try { const data = localStorage.getItem(key); return data ? JSON.parse(data) as T : fallback(); } catch { return fallback(); }
}
function karachiParts(date: Date, weekday = false) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit', ...(weekday ? { weekday: 'short' } : {}) }).formatToParts(date);
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}
function keyFor(value: string | Date) {
  const parts = karachiParts(value instanceof Date ? value : new Date(value));
  return parts.year + '-' + parts.month + '-' + parts.day;
}
function todayKey() { return keyFor(new Date()); }
function dateLabel(value?: string | null, time = false) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(value));
}
function longDate() { return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Karachi', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date()); }
function inputInKarachi(value?: string) {
  if (!value) return '';
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const o = Object.fromEntries(p.map(x => [x.type, x.value]));
  return o.year + '-' + o.month + '-' + o.day + 'T' + o.hour + ':' + o.minute;
}
function fromKarachiInput(value: string) { return new Date(value + ':00+05:00').toISOString(); }
function effectiveStatus(task: Task): string {
  if (task.status !== 'completed' && task.status !== 'cancelled' && task.status !== 'archived' && new Date(task.deadline_at).getTime() < Date.now()) return 'overdue';
  return task.status;
}
function roleLabel(role: Role) { return role === 'manager' ? 'Manager' : 'Managing Director'; }
function priorityLabel(priority: Priority) { return priority[0].toUpperCase() + priority.slice(1); }

export default function App() {
  const [screen, setScreen] = useState<'landing' | 'login' | 'workspace'>('landing');
  const [selectedRole, setSelectedRole] = useState<Role>('manager');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [team, setTeam] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<Task[]>(() => safeRead(TASK_KEY, demoTasks));
  const [comments, setComments] = useState<Comment[]>(() => safeRead(COMMENT_KEY, () => []));
  const [view, setView] = useState<View>('dashboard');
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [calendarMonth, setCalendarMonth] = useState(() => { const a = todayKey().split('-').map(Number); return new Date(a[0], a[1] - 1, 1); });
  const [flip, setFlip] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [composer, setComposer] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [draft, setDraft] = useState<Draft>(() => ({ title: '', description: '', scheduled: inputInKarachi(hour(1)), deadline: inputInKarachi(hour(25)), priority: 'normal', resource: '', assignee: '' }));

  const role = profile?.role || selectedRole;
  const director = role === 'managing_director';
  const preview = !isSupabaseConfigured || !session;

  function notify(message: string) { setNotice(message); window.setTimeout(() => setNotice(''), 3600); }
  async function refreshTasks() {
    if (!session || !supabase) return;
    const { data, error } = await supabase.from('tasks').select('*').order('schedule_at', { ascending: true });
    if (!error && data) setTasks((data || []).map(row => fromDatabaseTask(row as unknown as Record<string, unknown>)));
    else if (error) notify('Tasks could not refresh. Please try again.');
  }
  async function openSession(next: Session, expectedRole?: Role) {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('id,full_name,role,location,experience').eq('id', next.user.id).single();
    if (error || !data || (data.role !== 'manager' && data.role !== 'managing_director')) {
      notify('This login does not have an Ediova profile yet. Ask the Director to provision it.');
      await supabase.auth.signOut(); setLoading(false); return;
    }
    if (expectedRole && data.role !== expectedRole) {
      notify('This account has ' + roleLabel(data.role as Role) + ' access. Select the matching role.');
      await supabase.auth.signOut(); setLoading(false); return;
    }
    setSession(next); setProfile(data as Profile); setSelectedRole(data.role as Role);
    const { data: people } = await supabase.from('profiles').select('id,full_name,role,location,experience');
    setTeam((people || []) as Profile[]);
    const { data: rows, error: taskError } = await supabase.from('tasks').select('*').order('schedule_at', { ascending: true });
    if (taskError) notify('Workspace opened, but tasks could not load.');
    else setTasks((rows || []).map(row => fromDatabaseTask(row as unknown as Record<string, unknown>)));
    setComments([]);
    setScreen('workspace'); setLoading(false);
  }
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active && data.session) void openSession(data.session); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (preview) {
      try { localStorage.setItem(TASK_KEY, JSON.stringify(tasks)); localStorage.setItem(COMMENT_KEY, JSON.stringify(comments)); } catch { /* storage is optional */ }
    }
  }, [tasks, comments, preview]);
  useEffect(() => {
    if (!session || !supabase) return;
    const timer = window.setInterval(() => {
      void refreshTasks();
      setActiveTaskId(value => value);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [session]);
  const released = useMemo(() => tasks.filter(t => director || new Date(t.scheduled_at).getTime() <= Date.now()), [tasks, director]);
  const active = released.filter(t => t.status !== 'completed' && t.status !== 'cancelled' && t.status !== 'archived');
  const overdue = active.filter(t => effectiveStatus(t) === 'overdue');
  const completed = released.filter(t => t.status === 'completed').sort((a, b) => new Date(b.completed_at || b.deadline_at).getTime() - new Date(a.completed_at || a.deadline_at).getTime());
  const visible = useMemo(() => {
    let data = view === 'completed' ? completed : view === 'tasks' ? active : view === 'dashboard' ? active : released;
    if (view === 'dashboard' && !director) data = active.filter(t => keyFor(t.scheduled_at) === todayKey() || effectiveStatus(t) === 'overdue' || t.status === 'in_progress');
    const q = search.trim().toLowerCase();
    if (q) data = data.filter(t => (t.title + ' ' + t.description).toLowerCase().includes(q));
    if (filter !== 'all') data = data.filter(t => effectiveStatus(t) === filter || t.priority === filter);
    return [...data].sort((a, b) => new Date(a.deadline_at).getTime() - new Date(b.deadline_at).getTime());
  }, [view, completed, active, released, director, search, filter]);
  const activeTask = released.find(t => t.id === activeTaskId) || null;
  const todayTasks = active.filter(t => keyFor(t.scheduled_at) === todayKey());
  const nav: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'tasks', label: 'All tasks', icon: Target },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'completed', label: 'Completed', icon: Check },
    { id: 'profile', label: 'Profile', icon: UserRound },
  ];

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    if (!isSupabaseConfigured || !supabase) {
      setProfile(selectedRole === 'manager' ? managerDemo : directorDemo);
      setScreen('workspace'); notify('Preview mode — changes stay in this browser only.'); return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail.trim(), password: loginPassword });
    if (error || !data.session) { notify(error?.message || 'Login failed.'); setLoading(false); return; }
    await openSession(data.session, selectedRole);
  }
  async function logout() {
    if (supabase && session) await supabase.auth.signOut();
    setProfile(null); setSession(null); setActiveTaskId(null); setScreen('landing'); setView('dashboard');
  }
  function startCreate() {
    setEditing(null);
    setDraft({ title: '', description: '', scheduled: inputInKarachi(hour(1)), deadline: inputInKarachi(hour(25)), priority: 'normal', resource: '', assignee: team.find(p => p.role === 'manager')?.id || managerDemo.id });
    setComposer(true);
  }
  function startEdit(task: Task) {
    setEditing(task);
    setDraft({ title: task.title, description: task.description, scheduled: inputInKarachi(task.scheduled_at), deadline: inputInKarachi(task.deadline_at), priority: task.priority, resource: (task.resource_urls?.length ? task.resource_urls : task.resource_url ? [task.resource_url] : []).join('\n'), assignee: task.assignee_id || team.find(p => p.role === 'manager')?.id || managerDemo.id });
    setComposer(true);
  }
  async function saveTask(event: FormEvent) {
    event.preventDefault();
    if (!director) return;
    if (new Date(fromKarachiInput(draft.deadline)).getTime() <= new Date(fromKarachiInput(draft.scheduled)).getTime()) { notify('Deadline must be after the release time.'); return; }
    const changes = { title: draft.title.trim(), description: draft.description.trim(), scheduled_at: fromKarachiInput(draft.scheduled), deadline_at: fromKarachiInput(draft.deadline), priority: draft.priority, resource_url: draft.resource.trim() || null, assignee_id: draft.assignee || team.find(p => p.role === 'manager')?.id || managerDemo.id };
    if (session && supabase && profile) {
      const databaseChanges = toDatabaseTask(changes);
      const result = editing
        ? await supabase.from('tasks').update(databaseChanges).eq('id', editing.id).select('*').single()
        : await supabase.from('tasks').insert({ ...databaseChanges, status: 'pending', created_by: profile.id }).select('*').single();
      if (result.error) { notify('Could not save task: ' + result.error.message); return; }
      const savedTask = fromDatabaseTask(result.data as unknown as Record<string, unknown>);
      if (editing) setTasks(prev => prev.map(t => t.id === editing.id ? savedTask : t));
      else setTasks(prev => [...prev, savedTask]);
    } else {
      if (editing) setTasks(prev => prev.map(t => t.id === editing.id ? { ...t, ...changes } : t));
      else setTasks(prev => [...prev, { id: 'local-' + Date.now(), ...changes, status: 'pending' }]);
    }
    setComposer(false); notify(editing ? 'Task updated.' : 'Task scheduled.');
  }
  async function setStatus(task: Task, status: Status) {
    if (!director && task.scheduled_at > new Date().toISOString()) return;
    const patch = { status, completed_at: status === 'completed' ? new Date().toISOString() : null };
    if (session && supabase) {
      const { data, error } = await supabase.from('tasks').update({ status }).eq('id', task.id).select('*').single();
      if (error) { notify('Status not saved: ' + error.message); return; }
      const savedTask = fromDatabaseTask(data as unknown as Record<string, unknown>);
      setTasks(prev => prev.map(t => t.id === task.id ? savedTask : t));
    } else {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...patch } : t));
    }
    notify(status === 'completed' ? 'Marked complete. Nice work.' : 'Task status updated.');
  }
  async function loadComments(taskId: string) {
    if (!session || !supabase) return;
    const { data } = await supabase.from('task_comments').select('id,task_id,author_id,body,created_at,profiles(full_name)').eq('task_id', taskId).order('created_at', { ascending: true });
    if (data) setComments(prev => [...prev.filter(c => c.task_id !== taskId), ...data.map((item: any) => ({ ...item, author_name: item.profiles?.full_name || 'Ediova team' })) as Comment[]]);
  }
  async function addComment(event: FormEvent) {
    event.preventDefault();
    if (!activeTask || !profile || !commentDraft.trim()) return;
    const body = commentDraft.trim();
    if (session && supabase) {
      const { data, error } = await supabase.from('task_comments').insert({ task_id: activeTask.id, author_id: profile.id, body }).select('*').single();
      if (error) { notify('Comment could not be sent: ' + error.message); return; }
      setComments(prev => [...prev, { ...data, author_name: profile.full_name } as Comment]);
    } else {
      setComments(prev => [...prev, { id: 'comment-' + Date.now(), task_id: activeTask.id, author_id: profile.id, author_name: profile.full_name, body, created_at: new Date().toISOString() }]);
    }
    setCommentDraft('');
  }
  function openTask(task: Task) { setActiveTaskId(task.id); void loadComments(task.id); }
  function monthShift(direction: number) { setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + direction, 1)); }
  const monthTitle = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(calendarMonth);
  const firstOffset = (new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() + 6) % 7;
  const monthDays = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const calendarCells = Array.from({ length: firstOffset + monthDays }, (_, i) => i < firstOffset ? 0 : i - firstOffset + 1);
  const managerName = team.find(p => p.role === 'manager')?.full_name || 'Umna Haroon';

  if (screen === 'landing') return (
    <main className="landing">
      <header className="site-nav"><a className="brand" href="#" onClick={e => { e.preventDefault(); setScreen('landing'); }}><img src="./ediova-mark.svg" alt="" /><span>ediova<span className="brand-dot">.</span></span></a><nav><a href="#approach">Our approach</a><a href="mailto:careers@ediova.com">Careers <ArrowUpRight size={14} /></a><button className="button button-dark small" onClick={() => setScreen('login')}>Workspace login <ArrowRight size={15} /></button></nav></header>
      <section className="hero" id="approach">
        <div className="hero-copy"><span className="eyebrow"><span className="eyebrow-dot" /> CREATIVE PARTNERS FOR WHAT'S NEXT</span><h1>Make it<br /><span>meaningful.</span></h1><p>Ideas shaped with intention. Stories designed to move people. Work that stays with you.</p><div className="hero-actions"><button className="button button-dark" onClick={() => setScreen('login')}>Enter the workspace <ArrowRight size={16} /></button><a className="text-link" href="mailto:careers@ediova.com">Explore careers <ArrowUpRight size={15} /></a></div><div className="hero-proof"><div className="avatar-stack"><i>E</i><i>D</i><i>O</i></div><span>Good work happens<br /><strong>when details connect.</strong></span></div></div>
        <div className="hero-art" aria-label="Floating creative project cards">
          <svg className="connector-lines" viewBox="0 0 600 540" aria-hidden="true"><path d="M48 132 C145 132 130 250 248 248 S388 80 500 120"/><path d="M130 420 C200 420 240 340 310 350 S420 450 522 384"/><path d="M270 50 C280 120 340 145 338 216 S460 260 480 302"/></svg>
          <div className="float-card float-peach"><span className="float-index">01 / BRAND</span><div className="mini-sun">✳</div><strong>Make a mark.</strong><small>Brand worlds · 2026</small></div>
          <div className="float-card float-lilac"><span className="float-index">02 / MOTION</span><div className="orb-wrap"><div className="orb" /></div><strong>Motion with meaning.</strong><small>Studio notes · 04:28</small></div>
          <div className="float-card float-sage"><span className="float-index">03 / STORY</span><div className="story-lines"><i /><i /><i /></div><strong>Find the feeling.</strong><small>Fieldwork collection</small></div>
          <div className="floating-pill"><Sparkles size={15} /> made with intent</div>
          <div className="floating-note"><span>✳</span><strong>Creative minds.<br />Connected work.</strong></div>
          <div className="art-caption">A little order.<br />A lot of imagination.</div>
        </div>
      </section>
      <section className="manifesto"><span>THE E D I O V A WAY</span><h2>Good work isn't noise.<br /><em>It's a feeling that fits.</em></h2><p>We bring the moving parts together — thoughtful craft, clear communication and a little room for the unexpected.</p><div className="manifesto-foot"><span>BRAND / VIDEO / MOTION</span><span>INDEPENDENT BY NATURE <ArrowDownRight size={14} /></span></div></section>
      <footer className="landing-footer"><a className="brand" href="#" onClick={e => { e.preventDefault(); setScreen('landing'); }}><img src="./ediova-mark.svg" alt="" /><span>ediova<span className="brand-dot">.</span></span></a><span>© {new Date().getFullYear()} Ediova. Good things take intention.</span><div><a href="mailto:hello@ediova.com">Say hello <ArrowUpRight size={14} /></a><button onClick={() => setScreen('login')}>Team login <ArrowRight size={14} /></button></div></footer>
    </main>
  );

  if (screen === 'login') return (
    <main className="login-screen"><button className="back-link" onClick={() => setScreen('landing')}><ChevronLeft size={16} /> Back to Ediova</button><section className="login-card"><a className="brand login-brand" href="#" onClick={e => { e.preventDefault(); setScreen('landing'); }}><img src="./ediova-mark.svg" alt="" /><span>ediova<span className="brand-dot">.</span></span></a><span className="eyebrow"><LockKeyhole size={13} /> PRIVATE TEAM SPACE</span><h1>Good to have<br />you <em>back.</em></h1><p className="login-intro">Choose your access level to continue to your workspace.</p><div className="role-choices"><button className={selectedRole === 'manager' ? 'role-choice selected' : 'role-choice'} onClick={() => setSelectedRole('manager')}><span className="role-number">01</span><span><strong>Manager</strong><small>Tasks · Schedule · Updates</small></span><span className="role-check">{selectedRole === 'manager' ? <Check size={16} /> : null}</span></button><button className={selectedRole === 'managing_director' ? 'role-choice selected' : 'role-choice'} onClick={() => setSelectedRole('managing_director')}><span className="role-number">02</span><span><strong>Managing Director</strong><small>Planning · Assignments · Overview</small></span><span className="role-check">{selectedRole === 'managing_director' ? <Check size={16} /> : null}</span></button></div>
      {isSupabaseConfigured ? <form className="login-form" onSubmit={submitLogin}><label>Email address<input type="email" autoComplete="username" required value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="you@ediova.com" /></label><label>Password<input type="password" autoComplete="current-password" required value={loginPassword} onChange={e => setLoginPassword(e.target.value)} placeholder="Your password" /></label><button className="button button-dark full" disabled={loading}>{loading ? 'Signing in…' : 'Sign in securely'} <ArrowRight size={16} /></button></form> : <div className="preview-note"><Sparkles size={17} /><span><strong>Interactive preview</strong><small>Supabase is not configured yet. Continue to explore the interface with local sample data.</small></span></div>}
      {!isSupabaseConfigured && <button className="button button-dark full" onClick={() => void submitLogin(new Event('submit') as unknown as FormEvent)} disabled={loading}>Continue to preview <ArrowRight size={16} /></button>}
      <p className="login-legal">Access is provided by Ediova. There is no public account registration.</p></section><footer className="login-footer"><span>© {new Date().getFullYear()} Ediova</span><a href="mailto:support@ediova.com">Need help? Contact the team</a><button onClick={() => setView('privacy')}>Privacy &amp; security</button></footer></main>
  );

  const navViews = nav.concat([{ id: 'policies', label: 'Company policies', icon: FileText }, { id: 'privacy', label: 'Privacy & security', icon: ShieldCheck }]);
  const viewTitle = ({ dashboard: 'Overview', tasks: 'All tasks', calendar: 'Calendar', completed: 'Completed work', profile: 'Your profile', policies: 'Company policies', privacy: 'Privacy & security' } as Record<View, string>)[view];
  const filteredComments = activeTask ? comments.filter(c => c.task_id === activeTask.id) : [];
  const managerId = team.find(p => p.role === 'manager')?.id || managerDemo.id;
  function openComposer() { if (!director) return; startCreate(); }
  return (
    <main className="workspace-shell">
      <aside className="sidebar"><a className="brand side-brand" href="#" onClick={e => { e.preventDefault(); setScreen('landing'); }}><img src="./ediova-mark.svg" alt="" /><span>ediova<span className="brand-dot">.</span></span></a><div className="workspace-tag"><span className="status-led" />TEAM WORKSPACE</div><div className="side-section-label">WORKSPACE</div>{navViews.slice(0, 5).map(item => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? 'nav-item current' : 'nav-item'} onClick={() => setView(item.id)}><Icon size={17} /><span>{item.label}</span>{item.id === 'tasks' && <small>{active.length}</small>}</button>; })}<div className="side-section-label side-spaced">COMPANY</div>{navViews.slice(5).map(item => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? 'nav-item current' : 'nav-item'} onClick={() => setView(item.id)}><Icon size={17} /><span>{item.label}</span></button>; })}<div className="sidebar-bottom"><div className="sidebar-mini-card"><Sparkles size={16} /><strong>Make room<br />for good work.</strong><span>Clarity creates space.</span></div><button className="nav-item" onClick={() => void logout()}><LogOut size={17} /><span>Sign out</span></button><div className="sidebar-user"><div className="user-avatar">{(profile?.full_name || 'E').slice(0, 1)}</div><div><strong>{profile?.full_name || 'Ediova member'}</strong><small>{roleLabel(role)}</small></div><span className="online-dot" /></div></div></aside>
      <section className="workspace-main"><header className="workspace-topbar"><div><span className="workspace-crumb">EDI OVA <span>/</span> {viewTitle.toUpperCase()}</span><h1>{viewTitle}</h1></div><div className="topbar-right"><div className="today-date"><CalendarDays size={15} /><span>{longDate()}</span></div>{director && <button className="button button-dark" onClick={openComposer}><Plus size={17} /> New task</button>}</div></header>
      {preview && <div className="preview-banner"><Sparkles size={16} /><span><strong>Preview mode</strong> — changes are saved in this browser only. Configure Supabase for shared accounts and cross-device persistence.</span></div>}
      {view === 'dashboard' && <div className="welcome-row"><div><span className="eyebrow">YOUR SPACE, AT A GLANCE</span><h2>{director ? 'See the whole picture.' : 'Let’s make today count.'}</h2><p>{director ? 'Keep the moving parts clear, connected and on track.' : 'One good step at a time. Your next move starts here.'}</p></div><div className="date-pill"><span>{todayTasks.length}</span><div><strong>Scheduled today</strong><small>Pakistan Standard Time</small></div></div></div>}
      {view !== 'calendar' && view !== 'profile' && view !== 'policies' && view !== 'privacy' && <><div className="metric-row"><div className="metric-card"><span>ACTIVE TASKS</span><strong>{active.length.toString().padStart(2, '0')}</strong><small><Target size={13} /> Currently in motion</small></div><div className="metric-card metric-warm"><span>OVERDUE</span><strong className={overdue.length ? 'danger-text' : ''}>{overdue.length.toString().padStart(2, '0')}</strong><small><Clock3 size={13} /> Needs attention</small></div><div className="metric-card metric-lilac"><span>COMPLETED</span><strong>{completed.length.toString().padStart(2, '0')}</strong><small><Check size={13} /> Work delivered</small></div><div className="metric-card metric-sage"><span>TEAM</span><strong>{director ? Math.max(team.length, 1).toString().padStart(2, '0') : '01'}</strong><small><Users size={13} /> Working together</small></div></div><div className="task-toolbar"><div className="section-title"><h2>{view === 'completed' ? 'Recently completed' : view === 'tasks' ? 'Your task list' : director ? 'All assigned work' : 'Your focus'}</h2><span>{visible.length} items</span></div><div className="toolbar-controls"><label className="search-box"><Search size={15} /><input placeholder="Search tasks" value={search} onChange={e => setSearch(e.target.value)} /></label><select aria-label="Filter tasks" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All status</option><option value="pending">To do</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="overdue">Overdue</option><option value="archived">Archived</option><option value="high">High priority</option><option value="urgent">Urgent</option></select></div></div><div className="task-layout"><div className="task-list">{visible.map(task => <TaskCard key={task.id} task={task} selected={activeTaskId === task.id} director={director} onOpen={() => openTask(task)} onStatus={status => void setStatus(task, status)} onEdit={() => startEdit(task)} />)}{visible.length === 0 && <div className="empty-state"><div className="empty-icon"><Check size={22} /></div><h3>{view === 'completed' ? 'Your wins live here.' : 'You’re all caught up.'}</h3><p>{view === 'completed' ? 'Completed tasks will appear here.' : 'No tasks match this view right now. Enjoy the breathing room.'}</p></div>}</div><aside className="task-inspector">{activeTask ? <><div className="inspector-top"><span className="eyebrow">TASK DETAILS</span><button className="icon-button" aria-label="Close details" onClick={() => setActiveTaskId(null)}><X size={17} /></button></div><h3>{activeTask.title}</h3><StatusPill value={effectiveStatus(activeTask)} /><p className="inspector-description">{activeTask.description || 'No description has been added.'}</p><div className="inspector-meta"><span><CalendarDays size={15} /> Release</span><strong>{dateLabel(activeTask.scheduled_at, true)}</strong><span><Clock3 size={15} /> Deadline</span><strong className={effectiveStatus(activeTask) === 'overdue' ? 'danger-text' : ''}>{dateLabel(activeTask.deadline_at, true)}</strong><span><Target size={15} /> Priority</span><strong>{priorityLabel(activeTask.priority)}</strong></div>{(activeTask.resource_urls?.length ? activeTask.resource_urls : activeTask.resource_url ? [activeTask.resource_url] : []).map((url, index) => <a className="resource-link" key={url + index} href={url} target="_blank" rel="noreferrer"><LinkIcon size={15} /> {activeTask.resource_urls && activeTask.resource_urls.length > 1 ? 'Task resource ' + (index + 1) : 'Open task resource'} <ExternalLink size={13} /></a>)}{activeTask.status !== 'completed' && activeTask.status !== 'cancelled' && <div className="inspector-actions">{activeTask.status !== 'in_progress' && <button className="button button-light" onClick={() => void setStatus(activeTask, 'in_progress')}>Start task</button>}<button className="button button-dark" onClick={() => void setStatus(activeTask, 'completed')}><Check size={15} /> Mark complete</button></div>}{director && <button className="edit-task-link" onClick={() => startEdit(activeTask)}>Edit task <ArrowRight size={14} /></button>}<div className="comments-heading"><MessageCircle size={16} /><strong>Team conversation</strong><span>{filteredComments.length}</span></div><div className="comment-list">{filteredComments.map(c => <div className="comment" key={c.id}><div className="comment-avatar">{(c.author_name || 'E').slice(0, 1)}</div><div><strong>{c.author_name || 'Ediova team'}</strong><small>{dateLabel(c.created_at, true)}</small><p>{c.body}</p></div></div>)}{filteredComments.length === 0 && <p className="muted-copy">No comments yet. Leave the first helpful note.</p>}</div><form className="comment-form" onSubmit={addComment}><input value={commentDraft} onChange={e => setCommentDraft(e.target.value)} placeholder="Add a comment…" maxLength={4000} required /><button aria-label="Send comment"><ArrowRight size={16} /></button></form></> : <div className="inspector-empty"><div className="empty-icon"><MessageCircle size={22} /></div><h3>Select a task</h3><p>Open any task to view its brief, dates, resource links and team conversation.</p></div>}</aside></div></>}
      {view === 'calendar' && <section className="calendar-panel"><div className="calendar-heading"><div><span className="eyebrow">MAKE TIME FOR THE WORK</span><h2>{monthTitle}</h2></div><div className="calendar-paging"><button className="icon-button" onClick={() => monthShift(-1)} aria-label="Previous month"><ChevronLeft /></button><button className="icon-button" onClick={() => setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button><button className="icon-button" onClick={() => monthShift(1)} aria-label="Next month"><ChevronRight /></button></div></div><div className="calendar-week">{['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(d => <span key={d}>{d}</span>)}</div><div className="calendar-grid">{calendarCells.map((day, i) => { const key = day ? calendarMonth.getFullYear() + '-' + String(calendarMonth.getMonth() + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0') : 'blank-' + i; const items = day ? released.filter(t => keyFor(t.scheduled_at) === key) : []; return <div className={'calendar-day' + (!day ? ' blank' : '') + (day && key === todayKey() ? ' is-today' : '')} key={key}><span className="calendar-day-num">{day || ''}</span>{items.slice(0, 3).map(t => <button key={t.id} className={'calendar-event ' + (effectiveStatus(t) === 'overdue' ? 'event-late' : 'event-' + t.status)} onClick={() => { setView('dashboard'); openTask(t); }} title={t.title}>{t.title}</button>)}{items.length > 3 && <small>+{items.length - 3} more</small>}</div>; })}</div></section>}
      {view === 'profile' && <section className="profile-page"><div className="profile-copy"><span className="eyebrow">THE PERSON BEHIND THE WORK</span><h2>Your profile,<br /><em>your place here.</em></h2><p>Clear ownership and thoughtful communication help good work move forward.</p><div className="profile-details"><span>NAME</span><strong>{profile?.full_name || 'Preview member'}</strong><span>ROLE</span><strong>{roleLabel(role)}</strong><span>LOCATION</span><strong>{profile?.location || (role === 'manager' ? 'Islamabad, Pakistan' : 'Ediova')}</strong><span>EXPERIENCE</span><strong>{profile?.experience || (role === 'manager' ? '2+ years' : 'Leadership')}</strong></div></div><button className={'profile-flip' + (flip ? ' flipped' : '')} onClick={() => setFlip(!flip)} aria-label="Flip profile card"><div className="flip-inner"><div className="flip-front"><span className="float-index">EDI OVA / TEAM CARD</span><div className="profile-symbol">{(profile?.full_name || 'E').slice(0, 1)}</div><h3>{profile?.full_name || 'Ediova member'}</h3><p>{roleLabel(role)}</p><div className="flip-hint">CLICK TO FLIP <ArrowRight size={13} /></div></div><div className="flip-back"><ShieldCheck size={33} /><span className="eyebrow">ACCESS VERIFIED</span><h3>{director ? 'DIRECTOR-LEVEL ACCESS' : 'MANAGER-LEVEL ACCESS'}</h3><p>Role permissions are enforced by your signed-in account and database policies.</p><span className="flip-hint">CLICK TO RETURN</span></div></div></button></section>}
      {view === 'policies' && <InfoPage icon={<FileText size={22} />} eyebrow="HOW WE WORK" title="Company policies." body="We work with care, own our commitments and keep communication useful. Each task should have a clear brief, a realistic deadline and one obvious place for updates. Respect agreed schedules, protect client material, use approved links, and flag blockers early rather than silently missing a deadline." list={['Treat client and company information as confidential.','Keep task comments professional, clear and constructive.','Only share deliverables through approved resources and channels.','Raise timeline risks as soon as you see them.']} />}
      {view === 'privacy' && <InfoPage icon={<ShieldCheck size={22} />} eyebrow="PRIVACY & SECURITY" title="Work stays in the right hands." body="This workspace is intended for authorised Ediova team members. In production, authentication and database access are provided by Supabase with row-level security. Preview mode stores sample task data only in the current browser and does not synchronise it to other people." list={['Do not place passwords, payment details or unnecessary personal data in task comments.','Use individual accounts and never share login credentials.','Managers see assigned tasks only after their scheduled release time.','This draft notice must be reviewed against the final hosting, data retention and business practices before launch.']} />}
      <footer className="workspace-footer"><span>EDI OVA <span className="brand-dot">.</span> / Thoughtful work, connected.</span><span>Times shown in Asia/Karachi (UTC+05:00).</span><a href="mailto:support@ediova.com">Need help? <ArrowUpRight size={13} /></a></footer>
      </section>
      {composer && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setComposer(false); }}><form className="task-modal" onSubmit={saveTask}><div className="modal-heading"><div><span className="eyebrow">{editing ? 'UPDATE THE BRIEF' : 'MAKE IT HAPPEN'}</span><h2>{editing ? 'Edit task.' : 'Create a task.'}</h2></div><button type="button" className="icon-button" onClick={() => setComposer(false)} aria-label="Close"><X /></button></div><label>Task title<input required maxLength={180} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Give the work a clear name" /></label><label>Description<textarea required rows={4} maxLength={10000} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="What needs to happen? Add the useful details." /></label><div className="form-two"><label>Release date &amp; time<input type="datetime-local" required value={draft.scheduled} onChange={e => setDraft({ ...draft, scheduled: e.target.value })} /></label><label>Deadline<input type="datetime-local" required value={draft.deadline} onChange={e => setDraft({ ...draft, deadline: e.target.value })} /></label></div><div className="form-two"><label>Priority<select value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value as Priority })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label>Assign to<select value={draft.assignee || managerId} onChange={e => setDraft({ ...draft, assignee: e.target.value })}>{(team.filter(p => p.role === 'manager').length ? team.filter(p => p.role === 'manager') : [managerDemo]).map(p => <option value={p.id} key={p.id}>{p.full_name}</option>)}</select></label></div><label>Task resource links <span className="optional-label">OPTIONAL · ONE URL PER LINE</span><textarea rows={2} value={draft.resource} onChange={e => setDraft({ ...draft, resource: e.target.value })} placeholder="One URL per line" /></label><div className="modal-actions"><button type="button" className="button button-light" onClick={() => setComposer(false)}>Cancel</button><button className="button button-dark"><Check size={16} /> {editing ? 'Save changes' : 'Schedule task'}</button></div><p className="form-time-note">All times are interpreted as Pakistan Standard Time (UTC+05:00).</p></form></div>}
      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}

function TaskCard({ task, selected, director, onOpen, onStatus, onEdit }: { task: Task; selected: boolean; director: boolean; onOpen: () => void; onStatus: (s: Status) => void; onEdit: () => void }) {
  const state = effectiveStatus(task);
  return <article className={'task-card' + (selected ? ' chosen' : '')}><button className="task-open" onClick={onOpen}><div className="task-card-top"><span className={'priority-dot p-' + task.priority} /> <span className="task-priority">{priorityLabel(task.priority)} priority</span><StatusPill value={state} /></div><h3>{task.title}</h3><p>{task.description}</p><div className="task-card-foot"><span><CalendarDays size={14} /> Due {dateLabel(task.deadline_at)}</span><span><Clock3 size={14} /> Released {dateLabel(task.scheduled_at)}</span><ArrowRight size={15} /></div></button><div className="task-card-actions">{director && <button className="subtle-action" onClick={onEdit}>Edit</button>}{!director && task.status !== 'completed' && task.status !== 'cancelled' && <button className="subtle-action" onClick={() => onStatus(task.status === 'in_progress' ? 'completed' : 'in_progress')}>{task.status === 'in_progress' ? 'Mark complete' : 'Start task'}</button>}</div></article>;
}
function StatusPill({ value }: { value: string }) {
  const label = ({ pending: 'To do', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled', archived: 'Archived', overdue: 'Overdue' } as Record<string, string>)[value] || value;
  return <span className={'status-pill s-' + value}>{label}</span>;
}
function InfoPage({ icon, eyebrow, title, body, list }: { icon: React.ReactNode; eyebrow: string; title: string; body: string; list: string[] }) {
  return <section className="info-page"><div className="info-icon">{icon}</div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{body}</p><div className="info-list">{list.map((item, i) => <div key={item}><span>0{i + 1}</span><p>{item}</p></div>)}</div><p className="info-disclaimer">Draft copy — review and adapt before using this workspace for real company operations.</p></section>;
}
