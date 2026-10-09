import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronLeft, ChevronRight,
  Clock3, ExternalLink, FileText, LayoutDashboard, Link as LinkIcon, LockKeyhole, LogOut,
  BarChart3, Bell, MessageCircle, Plus, Repeat, Search, ShieldCheck, Sparkles, Target, UserRound, Users, X,
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './lib/supabase';

type Role = 'manager' | 'managing_director';
type Status = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'archived';
type RepeatUnit = 'none' | 'daily' | 'weekly' | 'monthly';
type Priority = 'low' | 'normal' | 'high' | 'urgent';
type View = 'dashboard' | 'tasks' | 'calendar' | 'completed' | 'performance' | 'profile' | 'policies' | 'privacy';
type Profile = { id: string; full_name: string; role: Role; location?: string | null; experience?: string | null };
type TeamMember = { id: string; full_name: string; job_title: string; location: string; sort_order: number; profile_id?: string | null };
type CompanyNotice = { id: string; title: string; body: string; created_by: string; created_at: string; is_active: boolean; expires_at?: string | null };
type PerformanceRow = { manager_id: string; manager_name: string; location?: string | null; assigned_tasks: number; completed_tasks: number; delayed_tasks: number; penalty_points: number; performance_score: number };
type MonthlyPerformanceRow = { manager_id: string; manager_name: string; location?: string | null; month_start: string; completed_tasks: number; completed_hours: number };
type RepeatMonthlyCount = 1 | 2;
type Task = {
  id: string; title: string; description: string; scheduled_at: string; deadline_at: string;
  priority: Priority; status: Status; resource_url?: string | null; resource_urls?: string[]; assignee_id?: string | null;
  created_by?: string | null; completed_at?: string | null; updated_at?: string;
  repeat_unit?: RepeatUnit; repeat_every?: number; repeat_until?: string | null; recurrence_parent_id?: string | null;
  repeat_monthly_count?: RepeatMonthlyCount; repeat_day_one?: number | null; repeat_day_two?: number | null;
  repeat_weekdays?: number[];
};
type Comment = { id: string; task_id: string; author_id: string; body: string; created_at: string; author_name?: string };
type Draft = { title: string; description: string; scheduled: string; deadline: string; priority: Priority; resource: string; assignee: string; repeatUnit: RepeatUnit; repeatEvery: number; repeatUntil: string; repeatMonthlyCount: RepeatMonthlyCount; repeatDayOne: number; repeatDayTwo: number; repeatDays: number[]; targetHours: string };

const managerDemo: Profile = { id: 'demo-manager', full_name: 'Umna Haroon', role: 'manager', location: 'Islamabad, Pakistan', experience: '2+ years' };
const directorDemo: Profile = { id: 'demo-director', full_name: 'Hamza Mubarak', role: 'managing_director', location: 'Yogyakarta, Indonesia' };
const TEAM_FALLBACK: TeamMember[] = [
  { id: 'hamza-mubarak', full_name: 'Hamza Mubarak', job_title: 'Managing Director', location: 'Yogyakarta, Indonesia', sort_order: 1, profile_id: 'f47dccdf-0da3-45c6-85bd-9f6401872692' },
  { id: 'humna-haroon', full_name: 'Humna Haroon', job_title: 'Manager', location: 'Islamabad, Pakistan', sort_order: 2, profile_id: 'b46129c6-cbf4-4d47-8d84-f592e36645f8' },
  { id: 'syed-shaheer', full_name: 'Syed Shaheer', job_title: 'Senior Video Editor', location: 'Faisalabad, Pakistan', sort_order: 3 },
  { id: 'muhammad-hammad', full_name: 'Muhammad Hammad', job_title: 'Anime Expert', location: 'Aceh, Indonesia', sort_order: 4 },
  { id: 'ahmer-munir', full_name: 'Ahmer Munir', job_title: 'Truvision Studio', location: 'Hafizabad, Pakistan', sort_order: 5 },
  { id: 'ahmer-khan', full_name: 'Ahmer Khan', job_title: 'Junior Video Editor', location: 'Karachi, Pakistan', sort_order: 6 },
  { id: 'salman-asghar', full_name: 'Salman Asghar', job_title: 'Journal Writing', location: 'Sialkot, Pakistan', sort_order: 7 },
];
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
    repeat_unit: (row.repeat_unit ?? 'none') as RepeatUnit,
    repeat_every: Number(row.repeat_every ?? 1),
    repeat_weekdays: Array.isArray(row.repeat_weekdays) ? row.repeat_weekdays.map(Number).filter((day: number) => Number.isInteger(day) && day >= 1 && day <= 7) : [],
    repeat_until: typeof row.repeat_until === 'string' ? row.repeat_until : null,
    recurrence_parent_id: typeof row.recurrence_parent_id === 'string' ? row.recurrence_parent_id : null,
    repeat_monthly_count: Number(row.repeat_monthly_count ?? 1) === 2 ? 2 : 1,
    repeat_day_one: row.repeat_day_one == null ? null : Number(row.repeat_day_one),
    repeat_day_two: row.repeat_day_two == null ? null : Number(row.repeat_day_two),
  };
}
function toDatabaseTask(changes: { title: string; description: string; scheduled_at: string; deadline_at: string; priority: Priority; resource_url: string | null; assignee_id: string; repeat_unit: RepeatUnit; repeat_every: number; repeat_until: string | null; repeat_monthly_count: RepeatMonthlyCount; repeat_day_one: number | null; repeat_day_two: number | null; repeat_weekdays: number[] }): Record<string, unknown> {
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
function dayOffset(value: string) {
  const [todayYear, todayMonth, todayDay] = todayKey().split('-').map(Number);
  const [year, month, day] = keyFor(value).split('-').map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(todayYear, todayMonth - 1, todayDay)) / 86400000);
}
function dayHeading(offset: number) {
  if (offset < 0) return 'Past due';
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  return 'In ' + offset + ' days';
}
function daySubheading(offset: number) {
  if (offset < 0) return 'Needs attention';
  if (offset === 0) return 'Your focus for today';
  if (offset === 1) return 'Prepare for tomorrow';
  return 'Coming up next';
}
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
function weekdayFor(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}
function nextKarachiMidnightInput() {
  const parts = karachiParts(new Date());
  const nextDay = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1));
  const date = nextDay.getUTCFullYear() + '-' + String(nextDay.getUTCMonth() + 1).padStart(2, '0') + '-' + String(nextDay.getUTCDate()).padStart(2, '0');
  return date + 'T00:00';
}
function firstSelectedWeekdayInput(value: string, days: number[]) {
  if (!days.length) return value;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const time = value.slice(11, 16) || '00:00';
  const date = new Date(Date.UTC(year, month - 1, day));
  for (let offset = 0; offset < 7; offset += 1) {
    const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    if (days.includes(weekday)) {
      const formatted = date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0') + '-' + String(date.getUTCDate()).padStart(2, '0');
      return formatted + 'T' + time;
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return value;
}
function defaultTaskDraft(): Draft {
  const scheduled = nextKarachiMidnightInput();
  return {
    title: '', description: '', scheduled, deadline: scheduled.slice(0, 10) + 'T23:59',
    priority: 'normal', resource: '', assignee: '', repeatUnit: 'none', repeatEvery: 1, repeatUntil: '',
    repeatMonthlyCount: 1, repeatDayOne: 15, repeatDayTwo: 28, repeatDays: [weekdayFor(scheduled)], targetHours: '',
  };
}
function effectiveStatus(task: Task): string {
  if (task.status !== 'completed' && task.status !== 'cancelled' && task.status !== 'archived' && new Date(task.deadline_at).getTime() < Date.now()) return 'overdue';
  return task.status;
}
function roleLabel(role: Role) { return role === 'manager' ? 'Manager' : 'Managing Director'; }
function priorityLabel(priority: Priority) { return priority[0].toUpperCase() + priority.slice(1); }

export default function App() {
  const [screen, setScreen] = useState<'landing' | 'login' | 'workspace'>('landing');
  const [selectedTaskDay, setSelectedTaskDay] = useState(0);
  const [logoTransition, setLogoTransition] = useState(false);
  const [teamDirectory, setTeamDirectory] = useState<TeamMember[]>(TEAM_FALLBACK);
  const [teamModal, setTeamModal] = useState(false);
  const [dashboardNotice, setDashboardNotice] = useState<CompanyNotice | null>(null);
  const [noticeComposer, setNoticeComposer] = useState(false);
  const [noticeTitleDraft, setNoticeTitleDraft] = useState('');
  const [noticeBodyDraft, setNoticeBodyDraft] = useState('');
  const [performanceRows, setPerformanceRows] = useState<PerformanceRow[]>([]);
  const [monthlyPerformanceRows, setMonthlyPerformanceRows] = useState<MonthlyPerformanceRow[]>([]);
  const [performanceMonth, setPerformanceMonth] = useState(() => todayKey().slice(0, 7));
  const [directorTaskHours, setDirectorTaskHours] = useState<Record<string, number>>({});
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
  const [draft, setDraft] = useState<Draft>(() => defaultTaskDraft());

  const role = profile?.role || 'manager';
  const director = role === 'managing_director';
  const preview = !isSupabaseConfigured || !session;

  function notify(message: string) { setNotice(message); window.setTimeout(() => setNotice(''), 3600); }
  function beginLoginTransition() {
    if (logoTransition) return;
    setLoginEmail(''); setLoginPassword('');
    setLogoTransition(true);
    window.setTimeout(() => {
      setScreen('login');
      setLogoTransition(false);
    }, 2000);
  }
  async function refreshTasks() {
    if (!session || !supabase) return;
    const { data, error } = await supabase.from('tasks').select('*').order('schedule_at', { ascending: true });
    if (!error && data) setTasks((data || []).map(row => fromDatabaseTask(row as unknown as Record<string, unknown>)));
    else if (error) notify('Tasks could not refresh. Please try again.');
  }
  async function openSession(next: Session) {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('id,full_name,role,location,experience').eq('id', next.user.id).single();
    if (error || !data || (data.role !== 'manager' && data.role !== 'managing_director')) {
      notify('This login does not have an Ediova profile yet. Ask the Director to provision it.');
      await supabase.auth.signOut(); setLoading(false); return;
    }
    setSession(next); setProfile(data as Profile);
    const { data: people } = await supabase.from('profiles').select('id,full_name,role,location,experience');
    setTeam((people || []) as Profile[]);
    const { data: directoryRows } = await supabase.from('team_directory').select('id,full_name,job_title,location,sort_order,profile_id').order('sort_order');
    if (directoryRows?.length) setTeamDirectory(directoryRows as TeamMember[]);
    const { data: noticeRows } = await supabase.from('company_notices').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1);
    setDashboardNotice((noticeRows?.[0] as CompanyNotice | undefined) || null);
    const { data: rows, error: taskError } = await supabase.from('tasks').select('*').order('schedule_at', { ascending: true });
    if (taskError) notify('Workspace opened, but tasks could not load.');
    else setTasks((rows || []).map(row => fromDatabaseTask(row as unknown as Record<string, unknown>)));
    if (data.role === 'managing_director') {
      const { data: hourRows, error: hourError } = await supabase.from('task_hour_targets').select('task_id,target_hours');
      if (hourError) notify('Private task-hour targets could not be loaded.');
      else setDirectorTaskHours(Object.fromEntries((hourRows || []).map((row: { task_id: string; target_hours: number | string }) => [row.task_id, Number(row.target_hours)])));
    } else {
      setDirectorTaskHours({});
    }
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
      if (supabase) {
        void supabase.from('company_notices').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1)
          .then(({ data }) => setDashboardNotice((data?.[0] as CompanyNotice | undefined) || null));
      }
      setActiveTaskId(value => value);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [session]);
  useEffect(() => {
    if (!session || !supabase || view !== 'performance') return;
    let active = true;
    const refreshPerformance = async () => {
      const [scores, monthly] = await Promise.all([
        supabase!.rpc('get_manager_performance'),
        supabase!.rpc('get_manager_monthly_performance', { p_month: performanceMonth + '-01' }),
      ]);
      if (active && !scores.error && scores.data) {
        setPerformanceRows([...(scores.data as PerformanceRow[])].sort((a, b) => a.performance_score - b.performance_score));
      }
      if (active && !monthly.error && monthly.data) setMonthlyPerformanceRows(monthly.data as MonthlyPerformanceRow[]);
    };
    void refreshPerformance();
    const timer = window.setInterval(() => void refreshPerformance(), 60000);
    return () => { active = false; window.clearInterval(timer); };
  }, [session, view, performanceMonth]);
  const released = useMemo(() => tasks.filter(t => director || new Date(t.scheduled_at).getTime() <= Date.now()), [tasks, director]);
  const active = released.filter(t => t.status !== 'completed' && t.status !== 'cancelled' && t.status !== 'archived');
  const overdue = active.filter(t => effectiveStatus(t) === 'overdue');
  const completed = released.filter(t => t.status === 'completed').sort((a, b) => new Date(b.completed_at || b.deadline_at).getTime() - new Date(a.completed_at || a.deadline_at).getTime());
  const visible = useMemo(() => {
    let data = view === 'completed' ? completed : view === 'tasks' ? active.filter(t => dayOffset(t.deadline_at) === selectedTaskDay) : [];

    const q = search.trim().toLowerCase();
    if (q) data = data.filter(t => (t.title + ' ' + t.description).toLowerCase().includes(q));
    if (filter !== 'all') data = data.filter(t => effectiveStatus(t) === filter || t.priority === filter);
    return [...data].sort((a, b) => new Date(a.deadline_at).getTime() - new Date(b.deadline_at).getTime());
  }, [view, completed, active, selectedTaskDay, search, filter]);
  const activeTask = released.find(t => t.id === activeTaskId) || null;
  const todayTasks = active.filter(t => dayOffset(t.scheduled_at) === 0).sort((a, b) => new Date(a.deadline_at).getTime() - new Date(b.deadline_at).getTime());
  const nav: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'tasks', label: 'All tasks', icon: Target },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'completed', label: 'Completed', icon: Check },
    { id: 'performance', label: 'Performance', icon: BarChart3 },
    { id: 'profile', label: 'Profile', icon: UserRound },
  ];

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    if (!isSupabaseConfigured || !supabase) {
      setLoginEmail(''); setLoginPassword('');
      setProfile(managerDemo);
      setScreen('workspace'); notify('Preview mode — changes stay in this browser only.'); return;
    }
    const email = loginEmail.trim();
    const password = loginPassword;
    setLoginEmail(''); setLoginPassword('');
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email, password,
    });
    if (error || !data.session) { notify(error?.message || 'Login failed.'); setLoading(false); return; }
    await openSession(data.session);
  }
  async function logout() {
    if (supabase && session) await supabase.auth.signOut();
    setProfile(null); setSession(null); setActiveTaskId(null); setLoginEmail(''); setLoginPassword(''); setScreen('landing'); setView('dashboard');
  }
  function startCreate() {
    setEditing(null);
    setDraft({ ...defaultTaskDraft(), assignee: team.find(p => p.role === 'manager')?.id || managerDemo.id });
    setComposer(true);
  }
  function startEdit(task: Task) {
    setEditing(task);
    setDraft({
      title: task.title, description: task.description, scheduled: inputInKarachi(task.scheduled_at),
      deadline: inputInKarachi(task.deadline_at), priority: task.priority,
      resource: (task.resource_urls?.length ? task.resource_urls : task.resource_url ? [task.resource_url] : []).join('\n'),
      assignee: task.assignee_id || team.find(p => p.role === 'manager')?.id || managerDemo.id,
      repeatUnit: task.repeat_unit || 'none', repeatEvery: task.repeat_every || 1,
      repeatUntil: task.repeat_until ? inputInKarachi(task.repeat_until) : '',
      repeatMonthlyCount: task.repeat_monthly_count === 2 ? 2 : 1,
      repeatDayOne: task.repeat_day_one || Number(keyFor(task.scheduled_at).split('-')[2]),
      repeatDayTwo: task.repeat_day_two || 28,
      repeatDays: task.repeat_weekdays?.length ? [...task.repeat_weekdays] : [weekdayFor(task.scheduled_at)],
      targetHours: directorTaskHours[task.id] == null ? '' : String(directorTaskHours[task.id]),
    });
    setComposer(true);
  }
  async function saveTask(event: FormEvent) {
    event.preventDefault();
    if (!director || !profile) return;
    if (draft.repeatUnit === 'weekly' && draft.repeatDays.length === 0) {
      notify('Choose at least one weekday for the weekly repeat.'); return;
    }
    const scheduledInput = draft.repeatUnit === 'weekly' ? firstSelectedWeekdayInput(draft.scheduled, draft.repeatDays) : draft.scheduled;
    const scheduleShift = fromKarachiInput(scheduledInput).getTime() - fromKarachiInput(draft.scheduled).getTime();
    const scheduledAt = fromKarachiInput(scheduledInput);
    const deadlineAt = new Date(fromKarachiInput(draft.deadline).getTime() + scheduleShift).toISOString();
    if (new Date(deadlineAt).getTime() <= new Date(scheduledAt).getTime()) {
      notify('Deadline must be after the release time.'); return;
    }
    if (draft.repeatUnit !== 'none' && draft.repeatUntil && new Date(fromKarachiInput(draft.repeatUntil)).getTime() <= new Date(scheduledAt).getTime()) {
      notify('Repeat-until must be after the first scheduled occurrence.'); return;
    }
    if (draft.repeatUnit === 'monthly' && draft.repeatMonthlyCount === 2 && draft.repeatDayOne === draft.repeatDayTwo) {
      notify('Choose two different dates for the monthly repeats.'); return;
    }
    const targetHours = draft.targetHours.trim() === '' ? null : Number(draft.targetHours);
    if (targetHours !== null && (!Number.isFinite(targetHours) || targetHours < 0.25 || targetHours > 1000)) {
      notify('Private task hours must be between 0.25 and 1,000.'); return;
    }
    const changes = {
      title: draft.title.trim(), description: draft.description.trim(), scheduled_at: scheduledAt,
      deadline_at: deadlineAt, priority: draft.priority, resource_url: draft.resource.trim() || null,
      assignee_id: draft.assignee || team.find(p => p.role === 'manager')?.id || managerDemo.id,
      repeat_unit: draft.repeatUnit, repeat_every: draft.repeatUnit === 'monthly' ? 1 : draft.repeatEvery,
      repeat_until: draft.repeatUnit !== 'none' && draft.repeatUntil ? fromKarachiInput(draft.repeatUntil) : null,
      repeat_monthly_count: draft.repeatUnit === 'monthly' ? draft.repeatMonthlyCount : 1,
      repeat_day_one: draft.repeatUnit === 'monthly' ? draft.repeatDayOne : null,
      repeat_day_two: draft.repeatUnit === 'monthly' && draft.repeatMonthlyCount === 2 ? draft.repeatDayTwo : null,
      repeat_weekdays: draft.repeatUnit === 'weekly' ? [...draft.repeatDays].sort((a, b) => a - b) : [],
    };
    let savedTask: Task;
    let warning = '';
    if (session && supabase) {
      const databaseChanges = toDatabaseTask(changes);
      const result = editing
        ? await supabase.from('tasks').update(databaseChanges).eq('id', editing.id).select('*').single()
        : await supabase.from('tasks').insert({ ...databaseChanges, status: 'pending', created_by: profile.id }).select('*').single();
      if (result.error || !result.data) { notify('Could not save task: ' + (result.error?.message || 'please try again')); return; }
      savedTask = fromDatabaseTask(result.data as unknown as Record<string, unknown>);
      if (targetHours !== null) {
        const { error: targetError } = await supabase.from('task_hour_targets').upsert({
          task_id: savedTask.id, target_hours: targetHours, set_by: profile.id, updated_at: new Date().toISOString(),
        }, { onConflict: 'task_id' });
        if (targetError) warning = 'Task saved, but private hours could not be saved: ' + targetError.message;
        else setDirectorTaskHours(prev => ({ ...prev, [savedTask.id]: targetHours }));
      } else if (editing) {
        const { error: targetError } = await supabase.from('task_hour_targets').delete().eq('task_id', savedTask.id);
        if (targetError) warning = 'Task saved, but its previous private hour target could not be cleared: ' + targetError.message;
        else setDirectorTaskHours(prev => { const next = { ...prev }; delete next[savedTask.id]; return next; });
      }
      setTasks(prev => editing ? prev.map(t => t.id === savedTask.id ? savedTask : t) : [...prev, savedTask]);
    } else {
      savedTask = editing
        ? { ...editing, ...changes }
        : { id: 'local-' + Date.now(), ...changes, status: 'pending' };
      setTasks(prev => editing ? prev.map(t => t.id === savedTask.id ? savedTask : t) : [...prev, savedTask]);
      setDirectorTaskHours(prev => {
        const next = { ...prev };
        if (targetHours === null) delete next[savedTask.id]; else next[savedTask.id] = targetHours;
        return next;
      });
    }
    setComposer(false);
    notify(warning || (editing ? 'Task updated.' : 'Task scheduled.'));
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
      <header className="site-nav"><a className="brand" href="#" onClick={e => { e.preventDefault(); setScreen('landing'); }}><img src="./ediova-mark.svg" alt="" /><span>ediova<span className="brand-dot">.</span></span></a><nav><a href="#approach">Our approach</a><a href="mailto:careers@ediova.com">Careers <ArrowUpRight size={14} /></a><button className="button button-dark small" onClick={() => beginLoginTransition()}>Workspace login <ArrowRight size={15} /></button></nav></header>
      <section className="hero" id="approach">
        <div className="hero-copy"><span className="eyebrow"><span className="eyebrow-dot" /> CREATIVE PARTNERS FOR WHAT'S NEXT</span><h1>Make it<br /><span>meaningful.</span></h1><p>Ideas shaped with intention. Stories designed to move people. Work that stays with you.</p><div className="hero-actions"><button className="button button-dark" onClick={() => beginLoginTransition()}>Enter the workspace <ArrowRight size={16} /></button><a className="text-link" href="mailto:careers@ediova.com">Explore careers <ArrowUpRight size={15} /></a></div><div className="hero-proof"><div className="avatar-stack"><i>E</i><i>D</i><i>O</i></div><span>Good work happens<br /><strong>when details connect.</strong></span></div></div>
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
      <section className="expertise-section"><div className="expertise-heading"><span className="eyebrow">WHAT WE BRING TOGETHER</span><h2>Creative thinking.<br /><em>Considered execution.</em></h2><p>From the first rough idea to the final export, we keep the craft deliberate and the details connected.</p></div><div className="expertise-grid"><article className="expertise-card expertise-brand"><span>01 / IDENTITY</span><div className="expertise-icon">✳</div><h3>Brand &amp; design</h3><p>Distinctive visual systems with a clear point of view.</p></article><article className="expertise-card expertise-motion"><span>02 / MOVEMENT</span><div className="expertise-icon">↗</div><h3>Video &amp; motion</h3><p>Stories shaped with rhythm, feeling and precision.</p></article><article className="expertise-card expertise-systems"><span>03 / DELIVERY</span><div className="expertise-icon">◎</div><h3>Creative operations</h3><p>Calm collaboration, clear ownership and dependable delivery.</p></article></div></section>
      <section className="manifesto"><span>THE E D I O V A WAY</span><h2>Good work isn't noise.<br /><em>It's a feeling that fits.</em></h2><p>We bring the moving parts together — thoughtful craft, clear communication and a little room for the unexpected.</p><div className="manifesto-foot"><span>BRAND / VIDEO / MOTION</span><span>INDEPENDENT BY NATURE <ArrowDownRight size={14} /></span></div></section>
      <footer className="landing-footer"><a className="brand" href="#" onClick={e => { e.preventDefault(); setScreen('landing'); }}><img src="./ediova-mark.svg" alt="" /><span>ediova<span className="brand-dot">.</span></span></a><div className="company-footer-details"><strong>Ediova Inc.</strong><span>Jl. Kaluirang 14,5 · Yogyakarta, Indonesia 55584</span><a href="tel:+6281377012611">+62 (813) 77012611</a></div><div className="footer-contact"><a href="mailto:careers@ediova.com">Careers <ArrowUpRight size={14} /></a><a href="mailto:hello@ediova.com">Say hello <ArrowUpRight size={14} /></a><button onClick={() => beginLoginTransition()}>Team login <ArrowRight size={14} /></button></div><span className="copyright">© {new Date().getFullYear()} Ediova Inc. All rights reserved.</span></footer>
      {logoTransition && <div className="brand-loading" role="status" aria-live="polite"><div className="loading-logo-wrap"><img src="./ediova-mark.svg" alt="Ediova" /></div><strong>Preparing your workspace</strong><span>Everything in its place.</span><div className="loading-track"><i /></div></div>}
    </main>
  );

  if (screen === 'login') return (
    <main className="login-screen"><button className="back-link" onClick={() => setScreen('landing')}><ChevronLeft size={16} /> Back to Ediova</button><section className="login-card"><a className="brand login-brand" href="#" onClick={e => { e.preventDefault(); setScreen('landing'); }}><img src="./ediova-mark.svg" alt="" /><span>ediova<span className="brand-dot">.</span></span></a><span className="eyebrow"><LockKeyhole size={13} /> PRIVATE TEAM SPACE</span><h1>Good to have<br />you <em>back.</em></h1><p className="login-intro">Sign in with your authorised Ediova account. Your access level is assigned automatically to your account.</p>
            {isSupabaseConfigured ? <form className="login-form" onSubmit={submitLogin} autoComplete="off"><label>Email address<input type="email" name="ediova-account-entry" autoComplete="off" required value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="you@ediova.com" /></label><label>Password<input type="password" name="ediova-password-entry" autoComplete="new-password" required value={loginPassword} onChange={e => setLoginPassword(e.target.value)} placeholder="Enter your password each time" /></label><button className="button button-dark full" disabled={loading}>{loading ? 'Signing in…' : 'Sign in securely'} <ArrowRight size={16} /></button></form> : <div className="preview-note"><Sparkles size={17} /><span><strong>Interactive preview</strong><small>Supabase is not configured yet. Continue to explore the interface with local sample data.</small></span></div>}
      {!isSupabaseConfigured && <button className="button button-dark full" onClick={() => void submitLogin(new Event('submit') as unknown as FormEvent)} disabled={loading}>Continue to preview <ArrowRight size={16} /></button>}
      <p className="login-legal">Access is provided by Ediova. This page does not store your email or password; enter them each time.</p></section><footer className="login-footer"><span>© {new Date().getFullYear()} Ediova</span><a href="mailto:support@ediova.com">Need help? Contact the team</a><button onClick={() => setView('privacy')}>Privacy &amp; security</button></footer></main>
  );

  const navViews = nav.concat([{ id: 'policies', label: 'Company policies', icon: FileText }, { id: 'privacy', label: 'Privacy & security', icon: ShieldCheck }]);
  const viewTitle = ({ dashboard: 'Overview', tasks: 'All tasks', calendar: 'Calendar', completed: 'Completed work', performance: 'Manager performance', profile: 'Your profile', policies: 'Company policies', privacy: 'Privacy & security' } as Record<View, string>)[view];
  const filteredComments = activeTask ? comments.filter(c => c.task_id === activeTask.id) : [];
  const managerId = team.find(p => p.role === 'manager')?.id || managerDemo.id;
  function openComposer() { if (!director) return; startCreate(); }
  async function publishDashboardNotice(event: FormEvent) {
    event.preventDefault();
    if (!director || !profile || !noticeTitleDraft.trim() || !noticeBodyDraft.trim()) return;
    if (session && supabase) {
      await supabase.from('company_notices').update({ is_active: false }).eq('is_active', true);
      const { data, error } = await supabase.from('company_notices').insert({
        title: noticeTitleDraft.trim(), body: noticeBodyDraft.trim(), created_by: profile.id, is_active: true,
      }).select('*').single();
      if (error || !data) { notify('Notice could not be published: ' + (error?.message || 'try again')); return; }
      setDashboardNotice(data as CompanyNotice);
    } else {
      setDashboardNotice({ id: 'preview-notice-' + Date.now(), title: noticeTitleDraft.trim(), body: noticeBodyDraft.trim(), created_by: profile.id, created_at: new Date().toISOString(), is_active: true });
    }
    setNoticeTitleDraft(''); setNoticeBodyDraft(''); setNoticeComposer(false); setView('dashboard'); notify('Dashboard notice published.');
  }
  async function dismissDashboardNotice() {
    if (!director || !dashboardNotice) return;
    if (session && supabase && !dashboardNotice.id.startsWith('preview-')) {
      const { error } = await supabase.from('company_notices').update({ is_active: false }).eq('id', dashboardNotice.id);
      if (error) { notify('Could not archive notice: ' + error.message); return; }
    }
    setDashboardNotice(null); notify('Notice archived.');
  }
  return (
    <main className="workspace-shell">
      <aside className="sidebar"><a className="brand side-brand" href="#" onClick={e => { e.preventDefault(); setScreen('landing'); }}><img src="./ediova-mark.svg" alt="" /><span>ediova<span className="brand-dot">.</span></span></a><div className="workspace-tag"><span className="status-led" />TEAM WORKSPACE</div><div className="side-section-label">WORKSPACE</div>{navViews.filter(item => ['dashboard', 'tasks', 'calendar', 'completed', 'performance', 'profile'].includes(item.id)).map(item => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? 'nav-item current' : 'nav-item'} onClick={() => setView(item.id)}><Icon size={17} /><span>{item.label}</span>{item.id === 'tasks' && <small>{active.length}</small>}</button>; })}<div className="side-section-label side-spaced">COMPANY</div>{navViews.filter(item => item.id === 'policies' || item.id === 'privacy').map(item => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? 'nav-item current' : 'nav-item'} onClick={() => setView(item.id)}><Icon size={17} /><span>{item.label}</span></button>; })}<div className="sidebar-bottom"><div className="sidebar-mini-card"><Sparkles size={16} /><strong>Make room<br />for good work.</strong><span>Clarity creates space.</span></div><button className="nav-item" onClick={() => void logout()}><LogOut size={17} /><span>Sign out</span></button><div className="sidebar-user"><div className="user-avatar">{(profile?.full_name || 'E').slice(0, 1)}</div><div><strong>{profile?.full_name || 'Ediova member'}</strong><small>{roleLabel(role)}</small></div><span className="online-dot" /></div></div></aside>
      <section className="workspace-main"><header className="workspace-topbar"><div><span className="workspace-crumb">EDI OVA <span>/</span> {viewTitle.toUpperCase()}</span><h1>{viewTitle}</h1></div><div className="topbar-right"><div className="today-date"><CalendarDays size={15} /><span>{longDate()}</span></div><button className="team-trigger" onClick={() => setTeamModal(true)}><Users size={15} /> Team <span>{teamDirectory.length}</span></button>{director && <><button className="button button-light notice-trigger" onClick={() => setNoticeComposer(true)}><Bell size={15} /> Post notice</button><button className="button button-dark" onClick={openComposer}><Plus size={17} /> New task</button></>}</div></header>
      {preview && <div className="preview-banner"><Sparkles size={16} /><span><strong>Preview mode</strong> — changes are saved in this browser only. Configure Supabase for shared accounts and cross-device persistence.</span></div>}
      {view === 'dashboard' && <div className="welcome-row"><div><span className="eyebrow">YOUR SPACE, AT A GLANCE</span><h2>{director ? 'See the whole picture.' : 'Let’s make today count.'}</h2><p>{director ? 'Keep the moving parts clear, connected and on track.' : 'One good step at a time. Your next move starts here.'}</p></div><div className="date-pill"><span>{todayTasks.length}</span><div><strong>Due today</strong><small>Pakistan Standard Time</small></div></div></div>}
      {view === 'dashboard' && dashboardNotice && <div className="company-notice"><div className="notice-symbol"><Bell size={16} /></div><div className="notice-copy"><span>COMPANY NOTICE</span><strong>{dashboardNotice.title}</strong><p>{dashboardNotice.body}</p></div>{director && <button className="notice-dismiss" onClick={() => void dismissDashboardNotice()} aria-label="Archive notice">Archive</button>}</div>}
      {view === 'dashboard' && <section className="today-board">
        <header className="today-board-header"><div><span className="eyebrow">TODAY'S FOCUS</span><h2>Today's tasks</h2><p>{todayTasks.length ? 'A clear, focused view of the work scheduled for today.' : 'Nothing scheduled for today. Enjoy the breathing room.'}</p></div><span className="today-count">{String(todayTasks.length).padStart(2, '0')} tasks</span></header>
        <div className="today-task-grid" style={{ gridTemplateColumns: `repeat(${Math.max(2, Math.ceil(todayTasks.length / 3))}, minmax(0, 1fr))` }}>
          {todayTasks.length ? todayTasks.map((task, index) => <TaskCard key={task.id} colorIndex={index} task={task} selected={activeTaskId === task.id} director={director} onOpen={() => openTask(task)} onStatus={status => void setStatus(task, status)} onEdit={() => startEdit(task)} />) : <div className="today-empty"><div className="empty-icon"><Check size={22} /></div><h3>Room to breathe.</h3><p>Tasks for another day stay off this dashboard. Open All tasks or Calendar when you need the wider schedule.</p></div>}
        </div>
      </section>}
      {view === 'tasks' && <>
        <div className="day-picker-header"><div><span className="eyebrow">A CLEAR PLAN, ONE DAY AT A TIME</span><h2>Tasks by day</h2><p>Open a task to see its full brief, links and conversation.</p></div></div>
        <div className="day-switcher">
          {[-1, 0, 1, 2].map(offset => <button type="button" key={offset} className={selectedTaskDay === offset ? 'day-switch current' : 'day-switch'} onClick={() => setSelectedTaskDay(offset)}><span>{dayHeading(offset)}</span><small>{offset < 0 ? active.filter(t => dayOffset(t.deadline_at) < 0).length : active.filter(t => dayOffset(t.deadline_at) === offset).length} tasks</small></button>)}
        </div>
        <div className="day-task-list task-list-simple">
          {visible.map((task, index) => <TaskCard key={task.id} colorIndex={index} task={task} selected={activeTaskId === task.id} director={director} onOpen={() => openTask(task)} onStatus={status => void setStatus(task, status)} onEdit={() => startEdit(task)} />)}
          {visible.length === 0 && <div className="empty-state"><div className="empty-icon"><Check size={22} /></div><h3>Nothing due {selectedTaskDay === 0 ? 'today' : selectedTaskDay < 0 ? 'in the past' : selectedTaskDay === 1 ? 'tomorrow' : 'in 2 days'}.</h3><p>Future and other-day tasks are available in Calendar.</p></div>}
        </div>
        <div className="calendar-nudge compact-nudge"><div><CalendarDays size={17} /><div><strong>Explore other dates</strong><span>The calendar holds the complete task schedule.</span></div></div><button className="button button-light" onClick={() => setView('calendar')}>Open calendar <ArrowRight size={15} /></button></div>
      </>}
      {view === 'completed' && <>
        <div className="day-picker-header"><div><span className="eyebrow">PROGRESS, PRESERVED</span><h2>Completed work</h2><p>Your delivered tasks, without the clutter.</p></div></div>
        <div className="day-task-list task-list-simple">
          {visible.map((task, index) => <TaskCard key={task.id} colorIndex={index} task={task} selected={activeTaskId === task.id} director={director} onOpen={() => openTask(task)} onStatus={status => void setStatus(task, status)} onEdit={() => startEdit(task)} />)}
          {visible.length === 0 && <div className="empty-state"><div className="empty-icon"><Check size={22} /></div><h3>Nothing completed yet.</h3><p>Completed work will appear here.</p></div>}
        </div>
      </>}
      {activeTask && <div className="task-popover-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setActiveTaskId(null); }}>
        <aside className="task-inspector task-dialog" role="dialog" aria-modal="true">{activeTask ? <><div className="inspector-top"><span className="eyebrow">TASK DETAILS</span><button className="icon-button" aria-label="Close details" onClick={() => setActiveTaskId(null)}><X size={17} /></button></div><h3 className="task-dialog-title">{activeTask.title}</h3><StatusPill value={effectiveStatus(activeTask)} /><p className="inspector-description">{activeTask.description || 'No description has been added.'}</p>{(activeTask.resource_urls?.length ? activeTask.resource_urls : activeTask.resource_url ? [activeTask.resource_url] : []).map((url, index) => <a className="resource-link" key={url + index} href={url} target="_blank" rel="noreferrer"><LinkIcon size={15} /> {activeTask.resource_urls && activeTask.resource_urls.length > 1 ? 'Task resource ' + (index + 1) : 'Open task resource'} <ExternalLink size={13} /></a>)}<div className="inspector-meta"><span><CalendarDays size={15} /> Release</span><strong>{dateLabel(activeTask.scheduled_at, true)}</strong><span><Clock3 size={15} /> Deadline</span><strong className={effectiveStatus(activeTask) === 'overdue' ? 'danger-text' : ''}>{dateLabel(activeTask.deadline_at, true)}</strong><span><Target size={15} /> Priority</span><strong>{priorityLabel(activeTask.priority)}</strong>{director && directorTaskHours[activeTask.id] != null && <><span><Clock3 size={15} /> Planned time</span><strong>{directorTaskHours[activeTask.id]} credited hours</strong></>}{activeTask.repeat_unit && activeTask.repeat_unit !== 'none' && <><span><Repeat size={15} /> Repeats</span><strong>{activeTask.repeat_unit === 'monthly' ? 'Monthly · day ' + (activeTask.repeat_day_one || keyFor(activeTask.scheduled_at).split('-')[2]) + ((activeTask.repeat_monthly_count || 1) === 2 ? ' & ' + activeTask.repeat_day_two : '') : 'Every ' + (activeTask.repeat_every || 1) + ' ' + (activeTask.repeat_unit === 'daily' ? 'day' : 'week') + ((activeTask.repeat_every || 1) > 1 ? 's' : '')}{activeTask.repeat_until ? ' · until ' + dateLabel(activeTask.repeat_until) : ' · ongoing'}</strong></>}</div>{activeTask.status !== 'completed' && activeTask.status !== 'cancelled' && <div className="inspector-actions">{activeTask.status !== 'in_progress' && <button className="button button-light" onClick={() => void setStatus(activeTask, 'in_progress')}>Start task</button>}<button className="button button-dark" onClick={() => void setStatus(activeTask, 'completed')}><Check size={15} /> Mark complete</button></div>}{director && activeTask.status === 'completed' && <div className="inspector-actions"><button className="button button-light" onClick={() => void setStatus(activeTask, 'in_progress')}><Repeat size={15} /> Reopen task</button></div>}{director && <button className="edit-task-link" onClick={() => startEdit(activeTask)}>Edit task <ArrowRight size={14} /></button>}<div className="comments-heading"><MessageCircle size={16} /><strong>Team conversation</strong><span>{filteredComments.length}</span></div><div className="comment-list">{filteredComments.map(c => <div className="comment" key={c.id}><div className="comment-avatar">{(c.author_name || 'E').slice(0, 1)}</div><div><strong>{c.author_name || 'Ediova team'}</strong><small>{dateLabel(c.created_at, true)}</small><p>{c.body}</p></div></div>)}{filteredComments.length === 0 && <p className="muted-copy">No comments yet. Leave the first helpful note.</p>}</div><form className="comment-form" onSubmit={addComment}><input value={commentDraft} onChange={e => setCommentDraft(e.target.value)} placeholder="Add a comment…" maxLength={4000} required /><button aria-label="Send comment"><ArrowRight size={16} /></button></form></> : <div className="inspector-empty"><div className="empty-icon"><MessageCircle size={22} /></div><h3>Select a task</h3><p>Open any task to view its brief, dates, resource links and team conversation.</p></div>}</aside>
      </div>}
      {view === 'performance' && <section className="performance-page">
        <div className="performance-heading"><span className="eyebrow">PROGRESS, MADE VISIBLE</span><h2>{director ? 'Manager performance.' : 'Your performance.'}</h2><p>Monthly task completions and credited hours update automatically when completed work is recorded. The Manager sees monthly totals only; task-level hour targets remain private to the Managing Director.</p></div>
        <div className="performance-month-filter"><label>Reporting month<input type="month" value={performanceMonth} onChange={e => setPerformanceMonth(e.target.value)} /></label><span>{new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(performanceMonth + '-01T12:00:00Z'))}</span></div>
        <div className="monthly-output-grid">
          <article className="monthly-output-card monthly-output-green"><span>COMPLETED THIS MONTH</span><strong>{monthlyPerformanceRows.filter(row => director || row.manager_id === profile?.id).reduce((total, row) => total + Number(row.completed_tasks || 0), 0)}</strong><small>tasks delivered</small></article>
          <article className="monthly-output-card monthly-output-blue"><span>HOURS CREDITED</span><strong>{monthlyPerformanceRows.filter(row => director || row.manager_id === profile?.id).reduce((total, row) => total + Number(row.completed_hours || 0), 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</strong><small>director-assigned hours on completed tasks</small></article>
        </div>
        <div className="performance-grid">{performanceRows.filter(row => director || row.manager_id === profile?.id).map(row => {
          const month = monthlyPerformanceRows.find(item => item.manager_id === row.manager_id);
          return <article className="performance-card" key={row.manager_id}>
            <div className="performance-card-top"><div className="performance-avatar">{row.manager_name.slice(0,1)}</div><div><h3>{row.manager_name}</h3><span>{row.location || 'Ediova Manager'}</span></div><strong className={row.performance_score < 70 ? 'score-low' : row.performance_score < 90 ? 'score-mid' : 'score-high'}>{row.performance_score}<small>/100</small></strong></div>
            <div className="score-track"><i style={{width: row.performance_score + '%'}} /></div>
            <div className="performance-stats"><span><strong>{row.assigned_tasks}</strong> Assigned</span><span><strong>{row.completed_tasks}</strong> Completed overall</span><span><strong>{row.delayed_tasks}</strong> Delayed</span></div>
            <div className="monthly-manager-stats"><div><span>Tasks this month</span><strong>{month ? Number(month.completed_tasks) : 0}</strong></div><div><span>Hours credited this month</span><strong>{month ? Number(month.completed_hours).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0'} <small>hrs</small></strong></div></div>
            <p className="performance-note">{row.delayed_tasks ? row.delayed_tasks + ' task(s) are overdue or were completed late.' : 'No late tasks recorded.'} Scores still deduct 10 points per full day late.</p>
          </article>;
        })}{performanceRows.filter(row => director || row.manager_id === profile?.id).length === 0 && <div className="empty-state"><h3>Performance data is loading.</h3><p>Assign tasks and record completions to build the score.</p></div>}</div>
      </section>}
      {view === 'calendar' && <section className="calendar-panel"><div className="calendar-heading"><div><span className="eyebrow">MAKE TIME FOR THE WORK</span><h2>{monthTitle}</h2></div><div className="calendar-paging"><button className="icon-button" onClick={() => monthShift(-1)} aria-label="Previous month"><ChevronLeft /></button><button className="icon-button" onClick={() => setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button><button className="icon-button" onClick={() => monthShift(1)} aria-label="Next month"><ChevronRight /></button></div></div><div className="calendar-week">{['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(d => <span key={d}>{d}</span>)}</div><div className="calendar-grid">{calendarCells.map((day, i) => { const key = day ? calendarMonth.getFullYear() + '-' + String(calendarMonth.getMonth() + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0') : 'blank-' + i; const items = day ? released.filter(t => keyFor(t.scheduled_at) === key && t.status !== 'cancelled' && t.status !== 'archived') : []; return <div className={'calendar-day' + (!day ? ' blank' : '') + (day && key === todayKey() ? ' is-today' : '')} key={key}><span className="calendar-day-num">{day || ''}</span>{items.slice(0, 3).map(t => <button key={t.id} className={'calendar-event ' + (effectiveStatus(t) === 'overdue' ? 'event-late' : 'event-' + t.status)} onClick={() => { setView('dashboard'); openTask(t); }} title={t.title}>{t.title}</button>)}{items.length > 3 && <small>+{items.length - 3} more</small>}</div>; })}</div></section>}
      {view === 'profile' && <section className="profile-page"><div className="profile-copy"><span className="eyebrow">THE PERSON BEHIND THE WORK</span><h2>Your profile,<br /><em>your place here.</em></h2><p>Clear ownership and thoughtful communication help good work move forward.</p><div className="profile-details"><span>NAME</span><strong>{profile?.full_name || 'Preview member'}</strong><span>ROLE</span><strong>{roleLabel(role)}</strong><span>LOCATION</span><strong>{profile?.location || (role === 'manager' ? 'Islamabad, Pakistan' : 'Ediova')}</strong><span>EXPERIENCE</span><strong>{profile?.experience || (role === 'manager' ? '2+ years' : 'Leadership')}</strong></div></div><button className={'profile-flip' + (flip ? ' flipped' : '')} onClick={() => setFlip(!flip)} aria-label="Flip profile card"><div className="flip-inner"><div className="flip-front"><span className="float-index">EDI OVA / TEAM CARD</span><div className="profile-symbol">{(profile?.full_name || 'E').slice(0, 1)}</div><h3>{profile?.full_name || 'Ediova member'}</h3><p>{roleLabel(role)}</p><div className="flip-hint">CLICK TO FLIP <ArrowRight size={13} /></div></div><div className="flip-back"><ShieldCheck size={33} /><span className="eyebrow">ACCESS VERIFIED</span><h3>{director ? 'DIRECTOR-LEVEL ACCESS' : 'MANAGER-LEVEL ACCESS'}</h3><p>Role permissions are enforced by your signed-in account and database policies.</p><span className="flip-hint">CLICK TO RETURN</span></div></div></button></section>}
      {view === 'policies' && <InfoPage icon={<FileText size={22} />} eyebrow="HOW WE WORK" title="Company policies." body="We work with care, own our commitments and keep communication useful. Each task should have a clear brief, a realistic deadline and one obvious place for updates. Respect agreed schedules, protect client material, use approved links, and flag blockers early rather than silently missing a deadline." list={['Treat client and company information as confidential.','Keep task comments professional, clear and constructive.','Only share deliverables through approved resources and channels.','Raise timeline risks as soon as you see them.']} />}
      {view === 'privacy' && <InfoPage icon={<ShieldCheck size={22} />} eyebrow="PRIVACY & SECURITY" title="Work stays in the right hands." body="This workspace is intended for authorised Ediova team members. In production, authentication and database access are provided by Supabase with row-level security. Preview mode stores sample task data only in the current browser and does not synchronise it to other people." list={['Do not place passwords, payment details or unnecessary personal data in task comments.','Use individual accounts and never share login credentials.','Managers see assigned tasks only after their scheduled release time.','This draft notice must be reviewed against the final hosting, data retention and business practices before launch.']} />}
      <footer className="workspace-footer"><span><strong>Ediova Inc.</strong> · Jl. Kaluirang 14,5, Yogyakarta 55584, Indonesia</span><span>Workspace times use Asia/Karachi (UTC+05:00).</span><a href="tel:+6281377012611">+62 (813) 77012611 <ArrowUpRight size={13} /></a></footer>
      </section>
      {teamModal && <div className="modal-backdrop team-modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setTeamModal(false); }}><section className="team-modal" role="dialog" aria-modal="true" aria-labelledby="team-modal-title"><div className="modal-heading"><div><span className="eyebrow">THE PEOPLE BEHIND THE WORK</span><h2 id="team-modal-title">Ediova team.</h2></div><button type="button" className="icon-button" onClick={() => setTeamModal(false)} aria-label="Close team"><X /></button></div><div className="team-directory-grid">{teamDirectory.slice().sort((a,b)=>a.sort_order-b.sort_order).map((member,index)=><article className="team-person-card" key={member.id}><div className={'team-person-avatar team-avatar-'+(index%4)}>{member.full_name.split(/\s+/).map(part=>part[0]).slice(0,2).join('')}</div><div><h3>{member.full_name}</h3><span>{member.job_title}</span><p>{member.location}</p></div><span className="team-person-number">0{index+1}</span></article>)}</div><p className="team-modal-foot">Ediova Inc. · Yogyakarta, Indonesia</p></section></div>}
      {noticeComposer && director && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setNoticeComposer(false); }}><form className="task-modal notice-modal" onSubmit={publishDashboardNotice}><div className="modal-heading"><div><span className="eyebrow">TEAM COMMUNICATION</span><h2>Post a notice.</h2></div><button type="button" className="icon-button" onClick={() => setNoticeComposer(false)} aria-label="Close"><X /></button></div><label>Notice heading<input required maxLength={120} value={noticeTitleDraft} onChange={e => setNoticeTitleDraft(e.target.value)} placeholder="A quick update for everyone" /></label><label>Message<textarea required rows={4} maxLength={2000} value={noticeBodyDraft} onChange={e => setNoticeBodyDraft(e.target.value)} placeholder="Write the announcement that should appear at the top of every dashboard." /></label><div className="modal-actions"><button type="button" className="button button-light" onClick={() => setNoticeComposer(false)}>Cancel</button><button className="button button-dark"><Bell size={15} /> Publish notice</button></div></form></div>}
      {composer && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setComposer(false); }}><form className="task-modal" onSubmit={saveTask}><div className="modal-heading"><div><span className="eyebrow">{editing ? 'UPDATE THE BRIEF' : 'MAKE IT HAPPEN'}</span><h2>{editing ? 'Edit task.' : 'Create a task.'}</h2></div><button type="button" className="icon-button" onClick={() => setComposer(false)} aria-label="Close"><X /></button></div><label>Task title<input required maxLength={180} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Give the work a clear name" /></label><label>Description<textarea required rows={4} maxLength={10000} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="What needs to happen? Add the useful details." /></label><div className="form-two"><label>Release date &amp; time<input type="datetime-local" required value={draft.scheduled} onChange={e => setDraft({ ...draft, scheduled: e.target.value })} /></label><label>Deadline<input type="datetime-local" required value={draft.deadline} onChange={e => setDraft({ ...draft, deadline: e.target.value })} /></label></div><div className="form-two"><label>Priority<select value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value as Priority })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label>Assign to<select value={draft.assignee || managerId} onChange={e => setDraft({ ...draft, assignee: e.target.value })}>{(team.filter(p => p.role === 'manager').length ? team.filter(p => p.role === 'manager') : [managerDemo]).map(p => <option value={p.id} key={p.id}>{p.full_name}</option>)}</select></label></div>{director && <label>Hours credited when completed <span className="optional-label">PRIVATE TO MANAGING DIRECTOR</span><input type="number" min="0.25" max="1000" step="0.25" value={draft.targetHours} onChange={e => setDraft({ ...draft, targetHours: e.target.value })} placeholder="For example, 3.5" /><span className="field-hint">Added to monthly performance only when this task is completed. Managers cannot see task-level hour targets.</span></label>}<label>Task resource links <span className="optional-label">OPTIONAL · ONE URL PER LINE</span><textarea rows={2} value={draft.resource} onChange={e => setDraft({ ...draft, resource: e.target.value })} placeholder="One URL per line" /></label>
          {editing?.recurrence_parent_id ? <p className="recurrence-note">This occurrence belongs to a repeating series. Edit the original task to change its schedule.</p> : <div className="repeat-controls">
            <label>Repeat<select value={draft.repeatUnit} onChange={e => setDraft({ ...draft, repeatUnit: e.target.value as RepeatUnit })}><option value="none">Never</option><option value="daily">Every day</option><option value="weekly">Weekly on selected days</option><option value="monthly">Each month</option></select></label>
            {draft.repeatUnit === 'monthly' ? <>
              <label>Occurrences each month<select value={String(draft.repeatMonthlyCount)} onChange={e => setDraft({ ...draft, repeatMonthlyCount: Number(e.target.value) as RepeatMonthlyCount })}><option value="1">Once a month</option><option value="2">Twice a month</option></select></label>
              <label>Day of month<select value={String(draft.repeatDayOne)} onChange={e => setDraft({ ...draft, repeatDayOne: Number(e.target.value) })}>{Array.from({length:31},(_,i)=>i+1).map(day => <option value={day} key={day}>{day}</option>)}</select></label>
              {draft.repeatMonthlyCount === 2 && <label>Second day<select value={String(draft.repeatDayTwo)} onChange={e => setDraft({ ...draft, repeatDayTwo: Number(e.target.value) })}>{Array.from({length:31},(_,i)=>i+1).filter(day => day !== draft.repeatDayOne).map(day => <option value={day} key={day}>{day}</option>)}</select></label>}
            </> : draft.repeatUnit === 'weekly' ? <>
              <label>Repeat interval<select value={String(draft.repeatEvery)} onChange={e => setDraft({ ...draft, repeatEvery: Number(e.target.value) })}><option value="1">Every week</option><option value="2">Every 2 weeks</option></select></label>
              <div className="repeat-weekdays"><span className="optional-label">SHOW THIS TASK ON</span><div className="weekday-options">{[{day:1,label:'Mon'},{day:2,label:'Tue'},{day:3,label:'Wed'},{day:4,label:'Thu'},{day:5,label:'Fri'},{day:6,label:'Sat'},{day:7,label:'Sun'}].map(item => <label className="weekday-option" key={item.day}><input type="checkbox" checked={draft.repeatDays.includes(item.day)} onChange={e => setDraft({ ...draft, repeatDays: e.target.checked ? [...draft.repeatDays, item.day].sort((a,b) => a-b) : draft.repeatDays.filter(day => day !== item.day) })} /><span>{item.label}</span></label>)}</div></div>
            </> : draft.repeatUnit === 'daily' && <label>Repeat every <span className="optional-label">INTERVAL · DAYS</span><input type="number" min={1} max={365} step={1} required value={draft.repeatEvery} onChange={e => setDraft({ ...draft, repeatEvery: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })} /></label>}
            {draft.repeatUnit !== 'none' && <label className="repeat-until-field">Repeat until <span className="optional-label">OPTIONAL</span><input type="date" value={draft.repeatUntil.slice(0,10)} onChange={e => setDraft({ ...draft, repeatUntil: e.target.value ? e.target.value + 'T23:59' : '' })} min={draft.scheduled.slice(0,10)} /></label>}
            {draft.repeatUnit !== 'none' && <p className="recurrence-note">{draft.repeatUnit === 'weekly' ? 'Select one or more weekdays. The first task is aligned to the next selected day; repeats default to 12:00 AM Pakistan time.' : 'Repeat occurrences preserve the task time and deadline window. Managers see each occurrence after its release time.'}</p>}
          </div>}
          <div className="modal-actions"><button type="button" className="button button-light" onClick={() => setComposer(false)}>Cancel</button><button className="button button-dark"><Check size={16} /> {editing ? 'Save changes' : 'Schedule task'}</button></div><p className="form-time-note">All times are interpreted as Pakistan Standard Time (UTC+05:00).</p></form></div>}
      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}

function TaskCard({ task, selected, director, colorIndex, onOpen, onStatus, onEdit }: { task: Task; selected: boolean; director: boolean; colorIndex: number; onOpen: () => void; onStatus: (s: Status) => void; onEdit: () => void }) {
  return <article className={'task-card compact-task task-tone-' + (colorIndex % 8) + (selected ? ' chosen' : '')}>
    <button className="task-open" onClick={onOpen} aria-label={'Open task: ' + task.title}>
      <div className="compact-task-main"><span className="task-card-number">{String(colorIndex + 1).padStart(2, '0')}</span><div className="task-card-copy"><h3>{task.title}</h3><div className="task-card-tags"><StatusPill value={effectiveStatus(task)} /><span className={'priority-chip priority-' + task.priority}>{priorityLabel(task.priority)}</span></div></div></div>
      <div className="compact-task-due"><span className="task-due-caption">DUE</span><strong>{dateLabel(task.deadline_at, true)}</strong><ArrowRight size={16} /></div>
    </button>
  </article>;
}
function StatusPill({ value }: { value: string }) {
  const label = ({ pending: 'To do', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled', archived: 'Archived', overdue: 'Overdue' } as Record<string, string>)[value] || value;
  return <span className={'status-pill s-' + value}>{label}</span>;
}
function InfoPage({ icon, eyebrow, title, body, list }: { icon: React.ReactNode; eyebrow: string; title: string; body: string; list: string[] }) {
  return <section className="info-page"><div className="info-icon">{icon}</div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{body}</p><div className="info-list">{list.map((item, i) => <div key={item}><span>0{i + 1}</span><p>{item}</p></div>)}</div><p className="info-disclaimer">Draft copy — review and adapt before using this workspace for real company operations.</p></section>;
}
