import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Code2, 
  GraduationCap, 
  Calendar, 
  Settings, 
  Moon, 
  Sun, 
  CheckCircle2, 
  Circle, 
  TrendingUp, 
  Award, 
  Clock, 
  Menu, 
  X,
  ChevronRight,
  Target
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { format, differenceInDays } from 'date-fns';
import axios from 'axios';
import { cn } from './lib/utils';
import { DEEPAYAN_SHEET, SSC_CGL_SECTIONS, type DSAPhase, type DSAQuestion } from './data';

// --- Types ---
type Tab = 'dashboard' | 'dsa' | 'ssc' | 'schedule' | 'settings';

interface Task {
  id: string;
  title: string;
  completed: boolean;
  category: string;
  timeSpent?: number; // in minutes
}

// --- Constants ---
const UPCOMING_EXAMS = [
  { name: 'SSC CGL 2026 Tier 1', date: new Date('2026-09-15'), category: 'SSC' },
  { name: 'SSC CGL 2026 Tier 2', date: new Date('2026-12-20'), category: 'SSC' },
  { name: 'Major Tech Hiring Season', date: new Date('2026-07-01'), category: 'Career' },
  { name: 'Target DSA Mastery', date: new Date('2026-06-01'), category: 'DSA' },
];

// --- Components ---

const ProgressBar = ({ progress, color = 'var(--accent)' }: { progress: number, color?: string }) => (
  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
    <motion.div 
      initial={{ width: 0 }}
      animate={{ width: `${progress}%` }}
      className="h-full"
      style={{ backgroundColor: color }}
    />
  </div>
);

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('deepayan_theme');
    return saved ? JSON.parse(saved) : false;
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Auth & Sync State
  const [githubToken, setGithubToken] = useState<string | null>(() => localStorage.getItem('deepayan_github_token'));
  const [user, setUser] = useState<{ login: string, name: string, avatar_url: string } | null>(null);
  const [gistId, setGistId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Persistence
  const [dsaProgress, setDsaProgress] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('deepayan_dsa');
    return saved ? JSON.parse(saved) : {};
  });
  
  const [sscProgress, setSscProgress] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('deepayan_ssc');
    return saved ? JSON.parse(saved) : {};
  });

  const [dailyTasks, setDailyTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('deepayan_tasks');
    return saved ? JSON.parse(saved) : [
      { id: '1', title: 'Morning Routine & Meditation', completed: false, category: 'Life' },
      { id: '2', title: '3 DSA Questions from Deepayan Sheet', completed: false, category: 'DSA' },
      { id: '3', title: '1 Hour SSC CGL Reasoning', completed: false, category: 'SSC' },
      { id: '4', title: 'Review System Design', completed: false, category: 'Dev' },
    ];
  });

  const [targetDate] = useState(new Date('2026-09-15')); // SSC CGL 2026 Tier 1

  const [progressHistory, setProgressHistory] = useState<Record<string, { dsa: number, ssc: number }>>(() => {
    const saved = localStorage.getItem('deepayan_history');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('deepayan_dsa', JSON.stringify(dsaProgress));
    updateHistory();
  }, [dsaProgress]);

  useEffect(() => {
    localStorage.setItem('deepayan_ssc', JSON.stringify(sscProgress));
    updateHistory();
  }, [sscProgress]);

  const updateHistory = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const dsaCount = Object.values(dsaProgress).filter(Boolean).length;
    const sscCount = Object.values(sscProgress).filter(Boolean).length;
    
    setProgressHistory(prev => {
      const newHistory = { ...prev, [today]: { dsa: dsaCount, ssc: sscCount } };
      localStorage.setItem('deepayan_history', JSON.stringify(newHistory));
      return newHistory;
    });
  };

  useEffect(() => {
    localStorage.setItem('deepayan_tasks', JSON.stringify(dailyTasks));
  }, [dailyTasks]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('deepayan_theme', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  // --- GitHub Auth & Sync Logic ---

  const checkAuth = async (token: string) => {
    try {
      setIsSyncing(true);
      const res = await axios.get('https://api.github.com/user', {
        headers: { Authorization: `token ${token}` }
      });
      setUser(res.data);
      localStorage.setItem('deepayan_github_token', token);
      setGithubToken(token);
      setLoginError(null);
      fetchGistData(token);
    } catch (err: any) {
      console.error('Auth failed:', err);
      setLoginError('Invalid token or network error. Ensure your token has "gist" and "user" scopes.');
      handleLogout();
    } finally {
      setIsSyncing(false);
    }
  };

  const fetchGistData = async (token: string) => {
    try {
      setIsSyncing(true);
      const gistsResponse = await axios.get('https://api.github.com/gists', {
        headers: { Authorization: `token ${token}` }
      });
      
      const appGist = gistsResponse.data.find((g: any) => g.files['deepayan_os_data.json']);
      
      if (appGist) {
        setGistId(appGist.id);
        const gistDetail = await axios.get(appGist.url, {
          headers: { Authorization: `token ${token}` }
        });
        const content = gistDetail.data.files['deepayan_os_data.json'].content;
        const remoteData = JSON.parse(content);
        
        if (remoteData.dsa) setDsaProgress(remoteData.dsa);
        if (remoteData.ssc) setSscProgress(remoteData.ssc);
        if (remoteData.tasks) setDailyTasks(remoteData.tasks);
        if (remoteData.history) setProgressHistory(remoteData.history);
        
        setLastSyncedAt(new Date());
      }
    } catch (err) {
      console.error('Failed to fetch Gist data:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const syncToGist = async () => {
    if (!githubToken || !user) return;
    try {
      setIsSyncing(true);
      const data = {
        dsa: dsaProgress,
        ssc: sscProgress,
        tasks: dailyTasks,
        history: progressHistory
      };
      
      const payload = {
        description: 'Deepayan Life & Career OS Data',
        public: false,
        files: {
          'deepayan_os_data.json': {
            content: JSON.stringify(data)
          }
        }
      };

      if (gistId) {
        await axios.patch(`https://api.github.com/gists/${gistId}`, payload, {
          headers: { Authorization: `token ${githubToken}` }
        });
      } else {
        const createResponse = await axios.post('https://api.github.com/gists', payload, {
          headers: { Authorization: `token ${githubToken}` }
        });
        setGistId(createResponse.data.id);
      }
      setLastSyncedAt(new Date());
    } catch (err) {
      console.error('Failed to sync to Gist:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Debounced sync
  useEffect(() => {
    if (!githubToken || !user) return;
    const timer = setTimeout(() => {
      syncToGist();
    }, 5000);
    return () => clearTimeout(timer);
  }, [dsaProgress, sscProgress, dailyTasks, progressHistory, githubToken, user]);

  useEffect(() => {
    if (githubToken) {
      checkAuth(githubToken);
    }
  }, []);

  const handleLogout = () => {
    setUser(null);
    setGistId(null);
    setGithubToken(null);
    localStorage.removeItem('deepayan_github_token');
  };

  // --- Calculations ---
  const dsaStats = useMemo(() => {
    const total = DEEPAYAN_SHEET.reduce((acc, phase) => acc + phase.questions.length, 0);
    const completed = Object.values(dsaProgress).filter(Boolean).length;
    return { total, completed, percentage: (completed / total) * 100 };
  }, [dsaProgress]);

  const sscStats = useMemo(() => {
    const total = SSC_CGL_SECTIONS.reduce((acc, section) => acc + section.tasks.length, 0);
    const completed = Object.values(sscProgress).filter(Boolean).length;
    return { total, completed, percentage: (completed / total) * 100 };
  }, [sscProgress]);

  const daysLeft = differenceInDays(targetDate, new Date());

  const chartData = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    return Array.from({ length: 7 }).map((_, i) => {
      const date = new Date();
      date.setDate(today.getDate() - (6 - i));
      const dateStr = format(date, 'yyyy-MM-dd');
      const history = progressHistory[dateStr] || { dsa: 0, ssc: 0 };
      
      // If no history for that day, we show a cumulative-like progress or 0
      // For a better visual, if it's today, we use current stats
      if (dateStr === format(today, 'yyyy-MM-dd')) {
        return { name: days[date.getDay()], dsa: dsaStats.completed, ssc: sscStats.completed };
      }
      
      return { 
        name: days[date.getDay()], 
        dsa: history.dsa || 0, 
        ssc: history.ssc || 0 
      };
    });
  }, [progressHistory, dsaStats.completed, sscStats.completed]);

  const nextDsa = useMemo(() => {
    for (const phase of DEEPAYAN_SHEET) {
      const next = phase.questions.find(q => !dsaProgress[q.id]);
      if (next) return { ...next, phaseTitle: phase.title };
    }
    return null;
  }, [dsaProgress]);

  const nextSsc = useMemo(() => {
    for (const section of SSC_CGL_SECTIONS) {
      const next = section.tasks.find(t => !sscProgress[`${section.id}-${t}`]);
      if (next) return { task: next, sectionTitle: section.title, sectionId: section.id };
    }
    return null;
  }, [sscProgress]);

  const todayStats = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
    const todayData = progressHistory[today] || { dsa: 0, ssc: 0 };
    const yesterdayData = progressHistory[yesterday] || { dsa: 0, ssc: 0 };
    
    return {
      dsaToday: Math.max(0, dsaStats.completed - (yesterdayData.dsa || 0)),
      sscToday: Math.max(0, sscStats.completed - (yesterdayData.ssc || 0)),
    };
  }, [progressHistory, dsaStats.completed, sscStats.completed]);

  const toggleDsa = (id: string) => {
    setDsaProgress(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSsc = (sectionId: string, task: string) => {
    const key = `${sectionId}-${task}`;
    setSscProgress(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleTask = (id: string) => {
    setDailyTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  // --- Render Helpers ---

  const SidebarItem = ({ id, icon: Icon, label }: { id: Tab, icon: any, label: string }) => (
    <button
      onClick={() => { setActiveTab(id); setIsSidebarOpen(false); }}
      className={cn(
        "flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-all duration-200",
        activeTab === id 
          ? "bg-accent text-white shadow-lg shadow-accent/20" 
          : "text-ink/60 hover:bg-muted hover:text-ink"
      )}
    >
      <Icon size={20} />
      <span className="font-medium">{label}</span>
      {activeTab === id && <motion.div layoutId="active-pill" className="ml-auto w-1.5 h-1.5 bg-white rounded-full" />}
    </button>
  );

  if (!githubToken || !user) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-6 relative overflow-hidden">
        {/* Radial Background Elements */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-accent/10 rounded-full blur-2xl" />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 w-full max-w-md card-minimal p-8 md:p-12 space-y-8 text-center"
        >
          <div className="space-y-2">
            <div className="w-16 h-16 bg-accent/10 text-accent rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Code2 size={32} />
            </div>
            <h1 className="text-3xl font-serif font-bold tracking-tight">Deepayan OS</h1>
            <p className="text-ink/60 text-sm">Connect your GitHub Gist to sync your progress across devices.</p>
          </div>

          <form 
            onSubmit={(e) => {
              e.preventDefault();
              const token = (e.currentTarget.elements.namedItem('token') as HTMLInputElement).value;
              if (token) checkAuth(token);
            }}
            className="space-y-4"
          >
            <div className="space-y-2 text-left">
              <label className="text-[10px] uppercase tracking-widest font-bold opacity-40 ml-1">GitHub Personal Access Token</label>
              <input 
                name="token"
                type="password"
                placeholder="ghp_xxxxxxxxxxxx"
                required
                className="w-full px-4 py-3 rounded-xl bg-muted border border-border focus:border-accent outline-none transition-all font-mono text-sm"
              />
              {loginError && <p className="text-xs text-red-500 mt-1 ml-1">{loginError}</p>}
            </div>
            <button 
              type="submit"
              disabled={isSyncing}
              className="w-full py-4 bg-accent text-white rounded-xl font-bold shadow-lg shadow-accent/20 hover:opacity-90 transition-all disabled:opacity-50"
            >
              {isSyncing ? 'Verifying...' : 'Connect & Sync'}
            </button>
          </form>

          <div className="pt-4 border-t border-border">
            <p className="text-[10px] text-ink/40 leading-relaxed">
              Don't have a token? <a href="https://github.com/settings/tokens/new?description=DeepayanOS&scopes=gist,user" target="_blank" rel="noreferrer" className="text-accent hover:underline">Create a Classic Token</a> with <span className="font-bold">gist</span> and <span className="font-bold">user</span> scopes.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-bg text-ink">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-bg/80 backdrop-blur-md z-50">
        <h1 className="text-xl font-serif font-bold tracking-tight">Deepayan OS</h1>
        <div className="flex items-center gap-4">
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 rounded-full hover:bg-muted">
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 rounded-full hover:bg-muted">
            <Menu size={20} />
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <AnimatePresence>
        {(isSidebarOpen || window.innerWidth >= 768) && (
          <motion.aside
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className={cn(
              "fixed md:sticky top-0 left-0 h-screen w-72 bg-bg border-r border-border p-6 z-[60] flex flex-col gap-8",
              !isSidebarOpen && "hidden md:flex"
            )}
          >
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-serif font-bold tracking-tighter">Deepayan OS</h1>
              <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2">
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 flex flex-col gap-2">
              <SidebarItem id="dashboard" icon={LayoutDashboard} label="Dashboard" />
              <SidebarItem id="dsa" icon={Code2} label="Deepayan Sheet" />
              <SidebarItem id="ssc" icon={GraduationCap} label="SSC CGL" />
              <SidebarItem id="schedule" icon={Calendar} label="Schedule" />
              <SidebarItem id="settings" icon={Settings} label="Settings" />
            </nav>

            <div className="mt-auto pt-6 border-t border-border space-y-2">
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/50">
                <img src={user.avatar_url} alt={user.login} className="w-8 h-8 rounded-full border border-border" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{user.name || user.login}</p>
                  <button onClick={handleLogout} className="text-[10px] text-red-500 font-bold uppercase hover:underline">Logout</button>
                </div>
              </div>
              <button 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-lg hover:bg-muted transition-colors"
              >
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                <span className="font-medium">{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[55] md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 max-w-6xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <p className="text-accent font-medium uppercase tracking-widest text-xs mb-2">
                    {user ? `Welcome back, ${user.name || user.login}` : 'Welcome back'}
                  </p>
                  <h2 className="text-4xl md:text-5xl font-serif font-bold">Today's Focus</h2>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-4 bg-muted px-4 py-2 rounded-full">
                    <Clock size={18} className="text-accent" />
                    <span className="font-mono text-sm">{format(new Date(), 'EEEE, MMMM do')}</span>
                  </div>
                  {user && (
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-tighter opacity-40">
                      {isSyncing ? (
                        <span className="flex items-center gap-1"><TrendingUp size={10} className="animate-pulse" /> Syncing...</span>
                      ) : (
                        <span>Synced to Gist {lastSyncedAt ? format(lastSyncedAt, 'HH:mm') : 'Never'}</span>
                      )}
                    </div>
                  )}
                </div>
              </header>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="card-minimal flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500">
                      <Code2 size={24} />
                    </div>
                    <span className="text-2xl font-bold">{Math.round(dsaStats.percentage)}%</span>
                  </div>
                  <div>
                    <p className="text-sm text-ink/60 font-medium">DSA Mastery</p>
                    <p className="text-xs text-ink/40">{dsaStats.completed}/{dsaStats.total} Questions</p>
                  </div>
                  <ProgressBar progress={dsaStats.percentage} color="#3b82f6" />
                </div>

                <div className="card-minimal flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="p-3 bg-orange-500/10 rounded-xl text-orange-500">
                      <GraduationCap size={24} />
                    </div>
                    <span className="text-2xl font-bold">{Math.round(sscStats.percentage)}%</span>
                  </div>
                  <div>
                    <p className="text-sm text-ink/60 font-medium">SSC CGL Prep</p>
                    <p className="text-xs text-ink/40">{sscStats.completed}/{sscStats.total} Topics</p>
                  </div>
                  <ProgressBar progress={sscStats.percentage} color="#f97316" />
                </div>

                <div className="card-minimal flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500">
                      <Target size={24} />
                    </div>
                    <span className="text-2xl font-bold">{daysLeft}</span>
                  </div>
                  <div>
                    <p className="text-sm text-ink/60 font-medium">Days to Exam</p>
                    <p className="text-xs text-ink/40">SSC CGL Tier 1 (Sept 15)</p>
                  </div>
                  <ProgressBar progress={Math.max(0, Math.min(100, (1 - daysLeft / 180) * 100))} color="#10b981" />
                </div>
              </div>

              {/* Main Dashboard Content */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Daily Checklist */}
                <section className="lg:col-span-1 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <TrendingUp size={20} className="text-accent" />
                      Daily Streak
                    </h3>
                    <span className="text-xs font-medium px-2 py-1 bg-accent/10 text-accent rounded-md">8 Day Streak</span>
                  </div>
                  <div className="space-y-3">
                    {dailyTasks.map(task => {
                      // Auto-complete logic for certain tasks
                      let isAutoCompleted = task.completed;
                      if (task.id === '2' && todayStats.dsaToday >= 3) isAutoCompleted = true;
                      if (task.id === '3' && todayStats.sscToday >= 1) isAutoCompleted = true;

                      return (
                        <button
                          key={task.id}
                          onClick={() => toggleTask(task.id)}
                          className={cn(
                            "w-full flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 text-left",
                            isAutoCompleted 
                              ? "bg-muted/50 border-transparent opacity-60" 
                              : "bg-bg border-border hover:border-accent"
                          )}
                        >
                          {isAutoCompleted ? <CheckCircle2 className="text-accent" size={20} /> : <Circle className="text-ink/20" size={20} />}
                          <div className="flex-1">
                            <p className={cn("font-medium", isAutoCompleted && "line-through")}>{task.title}</p>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] uppercase tracking-widest font-bold opacity-40">{task.category}</span>
                              {task.id === '2' && <span className="text-[10px] opacity-40">({todayStats.dsaToday}/3)</span>}
                              {task.id === '3' && <span className="text-[10px] opacity-40">({todayStats.sscToday}/1)</span>}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Next Up Recommendations */}
                  <div className="space-y-4 pt-4">
                    <h3 className="text-sm font-bold uppercase tracking-widest opacity-40">Next Recommended</h3>
                    {nextDsa && (
                      <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl flex items-center justify-between group cursor-pointer" onClick={() => setActiveTab('dsa')}>
                        <div>
                          <p className="text-[10px] font-bold text-blue-500 uppercase">DSA • {nextDsa.phaseTitle}</p>
                          <p className="text-sm font-medium">{nextDsa.title}</p>
                        </div>
                        <ChevronRight size={16} className="text-blue-500 group-hover:translate-x-1 transition-transform" />
                      </div>
                    )}
                    {nextSsc && (
                      <div className="p-4 bg-orange-500/5 border border-orange-500/10 rounded-xl flex items-center justify-between group cursor-pointer" onClick={() => setActiveTab('ssc')}>
                        <div>
                          <p className="text-[10px] font-bold text-orange-500 uppercase">SSC • {nextSsc.sectionTitle}</p>
                          <p className="text-sm font-medium">{nextSsc.task}</p>
                        </div>
                        <ChevronRight size={16} className="text-orange-500 group-hover:translate-x-1 transition-transform" />
                      </div>
                    )}
                  </div>
                </section>

                {/* Motivational Chart & Exams */}
                <div className="lg:col-span-2 space-y-8">
                  <section className="space-y-4">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Award size={20} className="text-accent" />
                      Cumulative Progress
                    </h3>
                    <div className="card-minimal h-[300px] p-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--ink)', opacity: 0.5 }} />
                          <YAxis hide />
                          <Tooltip 
                            contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px' }}
                            itemStyle={{ fontSize: '12px' }}
                          />
                          <Line type="monotone" dataKey="dsa" name="DSA Questions" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6' }} activeDot={{ r: 6 }} />
                          <Line type="monotone" dataKey="ssc" name="SSC Topics" stroke="#f97316" strokeWidth={3} dot={{ r: 4, fill: '#f97316' }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Calendar size={20} className="text-accent" />
                      Upcoming Exams & Milestones
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {UPCOMING_EXAMS.map((exam, i) => {
                        const diff = differenceInDays(exam.date, new Date());
                        return (
                          <div key={i} className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border border-border/50">
                            <div>
                              <p className="font-bold text-sm">{exam.name}</p>
                              <p className="text-xs opacity-50">{format(exam.date, 'MMM do, yyyy')}</p>
                            </div>
                            <div className="text-right">
                              <p className={cn(
                                "text-lg font-serif font-bold",
                                diff < 30 ? "text-red-500" : "text-accent"
                              )}>{diff}d</p>
                              <p className="text-[10px] uppercase font-bold opacity-30">Remaining</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'dsa' && (
            <motion.div
              key="dsa"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <header>
                <h2 className="text-4xl font-serif font-bold">Deepayan Sheet</h2>
                <p className="text-ink/60 mt-2">Master your logic building before starting advanced DSA.</p>
              </header>

              <div className="space-y-12">
                {DEEPAYAN_SHEET.map((phase) => (
                  <section key={phase.id} className="space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
                      <div>
                        <h3 className="text-2xl font-serif font-bold">{phase.title}</h3>
                        <p className="text-sm text-ink/40">{phase.description}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono opacity-60">
                          {phase.questions.filter(q => dsaProgress[q.id]).length} / {phase.questions.length}
                        </span>
                        <div className="w-32">
                          <ProgressBar 
                            progress={(phase.questions.filter(q => dsaProgress[q.id]).length / phase.questions.length) * 100} 
                            color="var(--accent)"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {phase.questions.map((q) => (
                        <button
                          key={q.id}
                          onClick={() => toggleDsa(q.id)}
                          className={cn(
                            "flex items-start gap-4 p-4 rounded-xl border text-left transition-all group",
                            dsaProgress[q.id] 
                              ? "bg-accent/5 border-accent/20" 
                              : "bg-bg border-border hover:border-accent/50"
                          )}
                        >
                          <div className={cn(
                            "mt-1 p-1 rounded-full border transition-colors",
                            dsaProgress[q.id] ? "bg-accent border-accent text-white" : "border-border text-transparent"
                          )}>
                            <CheckCircle2 size={14} />
                          </div>
                          <div className="flex-1">
                            <p className={cn("text-sm font-medium", dsaProgress[q.id] && "text-ink/60")}>{q.title}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <span className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded font-bold uppercase",
                                q.level === 1 ? "bg-emerald-500/10 text-emerald-500" :
                                q.level === 2 ? "bg-blue-500/10 text-blue-500" :
                                "bg-purple-500/10 text-purple-500"
                              )}>
                                Level {q.level}
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'ssc' && (
            <motion.div
              key="ssc"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <header>
                <h2 className="text-4xl font-serif font-bold">SSC CGL Prep</h2>
                <p className="text-ink/60 mt-2">Section-wise tracking for Tier 1 & 2 preparation.</p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {SSC_CGL_SECTIONS.map((section) => (
                  <div key={section.id} className="card-minimal space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-bold">{section.title}</h3>
                      <Award size={20} className="text-orange-500" />
                    </div>
                    <div className="space-y-2">
                      {section.tasks.map((task) => {
                        const key = `${section.id}-${task}`;
                        const isDone = sscProgress[key];
                        return (
                          <button
                            key={task}
                            onClick={() => toggleSsc(section.id, task)}
                            className={cn(
                              "w-full flex items-center justify-between p-3 rounded-lg border transition-all",
                              isDone ? "bg-muted border-transparent opacity-60" : "bg-bg border-border hover:border-orange-500/30"
                            )}
                          >
                            <span className={cn("text-sm font-medium", isDone && "line-through")}>{task}</span>
                            {isDone ? <CheckCircle2 size={18} className="text-orange-500" /> : <Circle size={18} className="text-ink/10" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'schedule' && (
            <motion.div
              key="schedule"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-8"
            >
              <header className="flex items-center justify-between">
                <div>
                  <h2 className="text-4xl font-serif font-bold">Daily Schedule</h2>
                  <p className="text-ink/60 mt-2">Optimize your time for maximum productivity.</p>
                </div>
                <button className="bg-accent text-white px-6 py-2 rounded-full font-bold text-sm shadow-lg shadow-accent/20">
                  Add Slot
                </button>
              </header>

              <div className="space-y-4">
                {[
                  { time: '06:00 AM', task: 'Wake up & Morning Ritual', type: 'Life' },
                  { time: '07:30 AM', task: 'Deep Work: DSA Deepayan Sheet', type: 'DSA' },
                  { time: '10:00 AM', task: 'SSC CGL: Quantitative Aptitude', type: 'SSC' },
                  { time: '01:00 PM', task: 'Lunch & Rest', type: 'Life' },
                  { time: '03:00 PM', task: 'SSC CGL: English & Reasoning', type: 'SSC' },
                  { time: '06:00 PM', task: 'Project Work / Tech Learning', type: 'Dev' },
                  { time: '09:00 PM', task: 'Review & Planning', type: 'Life' },
                ].map((slot, i) => (
                  <div key={i} className="flex items-center gap-6 group">
                    <div className="w-20 font-mono text-xs opacity-40 group-hover:opacity-100 transition-opacity">{slot.time}</div>
                    <div className="flex-1 card-minimal py-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-1 h-8 rounded-full",
                          slot.type === 'DSA' ? 'bg-blue-500' :
                          slot.type === 'SSC' ? 'bg-orange-500' :
                          slot.type === 'Dev' ? 'bg-purple-500' : 'bg-emerald-500'
                        )} />
                        <div>
                          <p className="font-medium">{slot.task}</p>
                          <span className="text-[10px] uppercase tracking-widest font-bold opacity-30">{slot.type}</span>
                        </div>
                      </div>
                      <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              <h2 className="text-4xl font-serif font-bold">Settings</h2>
              <div className="card-minimal space-y-8">
                <section className="space-y-4">
                  <h3 className="text-lg font-bold">Personalization</h3>
                  <div className="flex items-center justify-between p-4 bg-muted rounded-xl">
                    <div className="flex items-center gap-3">
                      <Moon size={20} />
                      <div>
                        <p className="font-medium text-sm">Dark Mode</p>
                        <p className="text-xs opacity-50">Switch between light and dark themes</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setIsDarkMode(!isDarkMode)}
                      className={cn(
                        "w-12 h-6 rounded-full transition-colors relative",
                        isDarkMode ? "bg-accent" : "bg-ink/10"
                      )}
                    >
                      <motion.div 
                        animate={{ x: isDarkMode ? 24 : 4 }}
                        className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow-sm" 
                      />
                    </button>
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-lg font-bold">Data Management</h3>
                  <button 
                    onClick={() => {
                      if(confirm('Are you sure? This will reset all your progress.')) {
                        localStorage.clear();
                        window.location.reload();
                      }
                    }}
                    className="w-full text-left p-4 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500/20 transition-colors"
                  >
                    <p className="font-medium text-sm">Reset All Progress</p>
                    <p className="text-xs opacity-70">Wipe all DSA, SSC, and Task data</p>
                  </button>
                </section>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Mobile Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-bg/80 backdrop-blur-lg border-t border-border px-6 py-3 flex justify-between items-center z-50">
        <button onClick={() => setActiveTab('dashboard')} className={cn("p-2 rounded-xl transition-colors", activeTab === 'dashboard' ? "text-accent bg-accent/10" : "text-ink/40")}>
          <LayoutDashboard size={24} />
        </button>
        <button onClick={() => setActiveTab('dsa')} className={cn("p-2 rounded-xl transition-colors", activeTab === 'dsa' ? "text-accent bg-accent/10" : "text-ink/40")}>
          <Code2 size={24} />
        </button>
        <button onClick={() => setActiveTab('ssc')} className={cn("p-2 rounded-xl transition-colors", activeTab === 'ssc' ? "text-accent bg-accent/10" : "text-ink/40")}>
          <GraduationCap size={24} />
        </button>
        <button onClick={() => setActiveTab('schedule')} className={cn("p-2 rounded-xl transition-colors", activeTab === 'schedule' ? "text-accent bg-accent/10" : "text-ink/40")}>
          <Calendar size={24} />
        </button>
      </nav>
    </div>
  );
}
