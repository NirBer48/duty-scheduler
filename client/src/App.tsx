import React, { useState, useEffect } from 'react';
import ScheduleCalendar from './components/ScheduleView';
import KitchenDutyView from './components/KitchenDutyView';
import PeopleEditor from './components/PeopleEditor';
import PostsEditor from './components/PostsEditor';
import { fetchPeople, fetchPosts, generateGuardsSchedule, generateKitchenSchedule, clearSchedule, fetchLastSchedule, fetchConstraints, addConstraint, login, register, logout, fetchMe } from './api';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import { useI18n } from './util/i18n';
import type {
  Post,
  Person,
  Assignment,
  ShiftOverride,
  ESGroupAssignment,
  ESGroup,
  BWAssignment,
  Constraint,
  KitchenAssignment,
  EscortAssignment,
  KitchenSettings,
  EscortSettings,
} from './types';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  Tabs,
  Tab,
} from '@mui/material';
import ConstraintsEditor from './components/ConstraintsEditor';
import HistoryView from './components/HistoryView';

const STORAGE_KEY_START = 'duty_scheduler_start';
const STORAGE_KEY_END = 'duty_scheduler_end';
const STORAGE_KEY_ASSIGNMENTS = 'duty_scheduler_assignments';
const STORAGE_KEY_ES_ASSIGNMENTS = 'duty_scheduler_es_assignments';
const STORAGE_KEY_ES_GROUPS = 'duty_scheduler_es_groups';
const STORAGE_KEY_SHIFT_OVERRIDES = 'duty_scheduler_shift_overrides';
const STORAGE_KEY_KITCHEN_ASSIGNMENTS = 'duty_scheduler_kitchen_assignments';
const STORAGE_KEY_ESCORT_ASSIGNMENTS = 'duty_scheduler_escort_assignments';
const STORAGE_KEY_KITCHEN_SETTINGS = 'duty_scheduler_kitchen_settings';
const STORAGE_KEY_ESCORT_SETTINGS = 'duty_scheduler_escort_settings';
const STORAGE_KEY_KITCHEN_START = 'duty_scheduler_kitchen_start';
const STORAGE_KEY_KITCHEN_END = 'duty_scheduler_kitchen_end';

const formatLocalDateTime = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const calculateDefaultStart = () => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(20, 0, 0, 0);
  if (now < start) start.setDate(start.getDate() - 1);
  return formatLocalDateTime(start);
};

const calculateDefaultEnd = () => {
  const now = new Date();
  const end = new Date(now);
  end.setHours(20, 0, 0, 0);
  if (now >= end) end.setDate(end.getDate() + 1);
  return formatLocalDateTime(end);
};

const loadFromStorage = <T,>(key: string, defaultValue: T): T => {
  try {
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved) as T;
  } catch {
    // ignore malformed storage entries
  }
  return defaultValue;
};

const loadString = (key: string, fallback: string): string => {
  const saved = localStorage.getItem(key);
  return saved ?? fallback;
};

const App: React.FC = () => {
  const [assignments, setAssignments] = useState<Assignment[]>(() =>
    loadFromStorage(STORAGE_KEY_ASSIGNMENTS, [])
  );
  const [people, setPeople] = useState<Person[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [shiftOverrides, setShiftOverrides] = useState<ShiftOverride[]>(() =>
    loadFromStorage(STORAGE_KEY_SHIFT_OVERRIDES, [])
  );
  const [esAssignments, setESAssignments] = useState<ESGroupAssignment[]>(() =>
    loadFromStorage(STORAGE_KEY_ES_ASSIGNMENTS, [
      { groupId: 'es1', personIds: [] },
      { groupId: 'es2', personIds: [] },
    ])
  );
  const [esGroups, setESGroups] = useState<ESGroup[]>(() =>
    loadFromStorage(STORAGE_KEY_ES_GROUPS, [
      { id: 'es1', name: "כ\"כ א'", totalPeople: 5, activePerShift: 1 },
      { id: 'es2', name: "כ\"כ ב'", totalPeople: 5, activePerShift: 1 },
    ])
  );
  const [bwAssignments, setBWAssignments] = useState<BWAssignment[]>([]);
  const [kitchenAssignments, setKitchenAssignments] = useState<KitchenAssignment[]>(() =>
    loadFromStorage(STORAGE_KEY_KITCHEN_ASSIGNMENTS, [])
  );
  const [escortAssignments, setEscortAssignments] = useState<EscortAssignment[]>(() =>
    loadFromStorage(STORAGE_KEY_ESCORT_ASSIGNMENTS, [])
  );
  const [kitchenSettings, setKitchenSettings] = useState<KitchenSettings>(() =>
    loadFromStorage(STORAGE_KEY_KITCHEN_SETTINGS, { requiredShift1: 36, requiredShift2: 36, shift2Start: '13:00' })
  );
  const [escortSettings, setEscortSettings] = useState<EscortSettings>(() =>
    loadFromStorage(STORAGE_KEY_ESCORT_SETTINGS, { requiredShift1: 4, requiredShift2: 4, requiredShift3: 4, requiredShift4: 4 })
  );
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [start, setStart] = useState(() => loadString(STORAGE_KEY_START, calculateDefaultStart()));
  const [end, setEnd] = useState(() => loadString(STORAGE_KEY_END, calculateDefaultEnd()));
  const [kitchenStart, setKitchenStart] = useState(() => loadString(STORAGE_KEY_KITCHEN_START, calculateDefaultStart()));
  const [kitchenEnd, setKitchenEnd] = useState(() => loadString(STORAGE_KEY_KITCHEN_END, calculateDefaultEnd()));
  const { t, lang, setLang } = useI18n();
  const [error, setError] = useState('');
  const [missingCount, setMissingCount] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [constraintDialogOpen, setConstraintDialogOpen] = useState(false);
  const [constraintPersonId, setConstraintPersonId] = useState<number | ''>('');
  const [constraintTitle, setConstraintTitle] = useState('');
  const [constraintStart, setConstraintStart] = useState('');
  const [constraintEnd, setConstraintEnd] = useState('');
  const [constraintError, setConstraintError] = useState('');
  const [tab, setTab] = useState(0);
  const [user, setUser] = useState<{ id: number; email: string } | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');

  const refreshPeople = () => fetchPeople().then(setPeople);
  const refreshPosts = () => fetchPosts().then(data => {
    setPosts(data);
    return data;
  });

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshPeople();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refreshPosts();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchConstraints().then(setConstraints).catch(() => { });
  }, [user]);

  useEffect(() => {
    const loadLastSchedule = async () => {
      try {
        const snapshot = await fetchLastSchedule();
        if (snapshot.assignments?.length) {
          setAssignments(snapshot.assignments);
        }
        setBWAssignments(snapshot.bwAssignments || []);
        setKitchenAssignments(snapshot.kitchenAssignments || []);
        setEscortAssignments(snapshot.escortAssignments || []);
        if (snapshot.kitchenSettings) setKitchenSettings(snapshot.kitchenSettings);
        if (snapshot.escortSettings) setEscortSettings(snapshot.escortSettings);
        if (snapshot.esAssignments?.length) {
          setESAssignments(snapshot.esAssignments);
        }
      } catch (err) {
        console.error('Failed to load last schedule', err);
      }
    };
    if (user) loadLastSchedule();
  }, [user]);

  useEffect(() => {
    setESAssignments((prev: ESGroupAssignment[]) => {
      let changed = false;
      const sanitized = prev.map(group => {
        const allowedIds = group.personIds.filter(id => {
          const person = people.find((person: Person) => person.id === id);
          return person && !person.limitedAbility;
        });
        if (allowedIds.length !== group.personIds.length) {
          changed = true;
          return { ...group, personIds: allowedIds };
        }
        return group;
      });
      return changed ? sanitized : prev;
    });
  }, [people]);

  useEffect(() => { localStorage.setItem(STORAGE_KEY_START, start); }, [start]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_END, end); }, [end]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_KITCHEN_START, kitchenStart); }, [kitchenStart]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_KITCHEN_END, kitchenEnd); }, [kitchenEnd]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_ASSIGNMENTS, JSON.stringify(assignments)); }, [assignments]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_ES_ASSIGNMENTS, JSON.stringify(esAssignments)); }, [esAssignments]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_ES_GROUPS, JSON.stringify(esGroups)); }, [esGroups]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_SHIFT_OVERRIDES, JSON.stringify(shiftOverrides)); }, [shiftOverrides]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_KITCHEN_ASSIGNMENTS, JSON.stringify(kitchenAssignments)); }, [kitchenAssignments]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_ESCORT_ASSIGNMENTS, JSON.stringify(escortAssignments)); }, [escortAssignments]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_KITCHEN_SETTINGS, JSON.stringify(kitchenSettings)); }, [kitchenSettings]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_ESCORT_SETTINGS, JSON.stringify(escortSettings)); }, [escortSettings]);

  const handleScheduleGuards = async () => {
    if (!user) {
      setError(t('Invalid credentials'));
      return;
    }
    // Clear previous error state before generating
    setError('');
    setMissingCount(null);
    
    // Send as local (no timezone shift) to keep boundaries exact
    const startISO = start;
    const endISO = end;
    setIsGenerating(true);
    try {
      const res = await generateGuardsSchedule(
        startISO,
        endISO,
        shiftOverrides,
        esAssignments,
        assignments,
        bwAssignments,
        kitchenAssignments,
        escortAssignments,
        kitchenSettings,
        escortSettings,
        constraints
      );
      setAssignments(res.assignments || []);
      setBWAssignments(res.bwAssignments || []);
      setKitchenAssignments(res.kitchenAssignments || []);
      setEscortAssignments(res.escortAssignments || []);
      if (res.kitchenSettings) setKitchenSettings(res.kitchenSettings);
      if (res.escortSettings) setEscortSettings(res.escortSettings);
      if (res.esAssignments) {
        setESAssignments(res.esAssignments);
      }
      setError(res.error || '');
      console.log("missing:", res.missingCount);
      setMissingCount(res.missingCount ?? null);
      await Promise.all([refreshPeople(), refreshPosts()]);
    } catch (e) {
      setError(t('Save failed'));
      setMissingCount(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClearGuards = async () => {
    if (!user) return;
    if (window.confirm(t('Are you sure you want to clear the schedule?'))) {
      setAssignments([]);
      setESAssignments([
        { groupId: 'es1', personIds: [] },
        { groupId: 'es2', personIds: [] },
      ]);
      setBWAssignments([]);
      setError('');
      setMissingCount(null);
      await clearSchedule('guards');
    }
  };

  const handleGenerateKitchen = async () => {
    if (!user) {
      setError(t('Invalid credentials'));
      return;
    }
    setIsGenerating(true);
    try {
      const res = await generateKitchenSchedule(
        start,
        end,
        kitchenStart,
        kitchenEnd,
        esAssignments,
        assignments,
        bwAssignments,
        kitchenAssignments,
        escortAssignments,
        kitchenSettings,
        escortSettings,
        constraints
      );
      // Only kitchen-related state should change, but we keep everything in sync with server response.
      setAssignments(res.assignments || assignments);
      setBWAssignments(res.bwAssignments || bwAssignments);
      setKitchenAssignments(res.kitchenAssignments || []);
      setEscortAssignments(res.escortAssignments || []);
      if (res.kitchenSettings) setKitchenSettings(res.kitchenSettings);
      if (res.escortSettings) setEscortSettings(res.escortSettings);
      setError(res.error || '');
    } catch (e) {
      setError(t('Save failed'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClearKitchen = async () => {
    if (!user) return;
    if (window.confirm(t('Are you sure you want to clear the schedule?'))) {
      setKitchenAssignments([]);
      setEscortAssignments([]);
      setError('');
      setMissingCount(null);
      await clearSchedule('kitchen');
    }
  };

  const translateAuthError = (msg: string) => {
    const lower = (msg || '').toLowerCase();
    if (lower.includes('email exists')) return t('Email already exists');
    if (lower.includes('missing fields')) return t('Invalid credentials');
    if (lower.includes('invalid credentials')) return t('Invalid credentials');
    if (lower.includes('unauthorized')) return t('Invalid credentials');
    return t('Invalid credentials');
  };

  const handleAuthSubmit = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      if (authMode === 'login') {
        const u = await login(authEmail.trim(), authPassword);
        setUser(u);
      } else {
        const u = await register(authEmail.trim(), authPassword);
        setUser(u);
      }
      setAuthPassword('');
    } catch (err: any) {
      setAuthError(translateAuthError(err?.message || ''));
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout().catch(() => {});
    setUser(null);
    setAssignments([]);
    setBWAssignments([]);
    setKitchenAssignments([]);
    setEscortAssignments([]);
    setESAssignments([
      { groupId: 'es1', personIds: [] },
      { groupId: 'es2', personIds: [] },
    ]);
    setPeople([]);
    setPosts([]);
    setConstraints([]);
  };

  const handlePostsUpdate = (updatedPosts: Post[]) => {
    setPosts(updatedPosts);
  };

  const handlePeopleUpdate = () => {
    refreshPeople();
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f3f4f6' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>{t('MyTurn')}</Typography>
          {user && (
            <Typography variant="body2" sx={{ mr: 2 }}>
              {user.email}
            </Typography>
          )}
          {user && (
            <Button color="inherit" onClick={handleLogout}>
              {t('Logout')}
            </Button>
          )}
          <Button color="inherit" onClick={() => setLang(lang === 'en' ? 'he' : 'en')}>
            {lang === 'en' ? 'עברית' : 'English'}
          </Button>
        </Toolbar>
      </AppBar>
      {!user && (
        <Container maxWidth="sm" sx={{ mt: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {authMode === 'login' ? t('Login') : t('Register')}
            </Typography>
            <Stack spacing={2}>
              <TextField
                label={t('Email')}
                type="email"
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
                fullWidth
                size="small"
              />
              <TextField
                label={t('Password')}
                type="password"
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                fullWidth
                size="small"
              />
              {authError && <Typography color="error">{authError}</Typography>}
              <Button variant="contained" onClick={handleAuthSubmit} disabled={authLoading}>
                {authMode === 'login' ? t('Login') : t('Register')}
              </Button>
              <Button
                variant="text"
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'register' : 'login');
                  setAuthError('');
                }}
              >
                {authMode === 'login' ? t('Need an account?') : t('Already have an account?')}
              </Button>
            </Stack>
          </Paper>
        </Container>
      )}

      {user && (
        <Container maxWidth={false} sx={{ mt: 2, px: 3 }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
            <Tab label={t('Guards')} />
            <Tab label={t('Kitchen')} />
            <Tab label={t('History')} />
          </Tabs>
        <Box display="flex" gap={3} alignItems="flex-start">
          <Box sx={{ minWidth: 320, maxWidth: 380, flexShrink: 0 }}>
            <PeopleEditor onUpdate={handlePeopleUpdate} />
            {tab === 0 && <PostsEditor onUpdate={handlePostsUpdate} />}
            <ConstraintsEditor people={people} />
          </Box>

            <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              {tab === 0 && (
                <>
                  <Paper sx={{ p: 2, mb: 2 }}>
                    <Typography variant="h6" gutterBottom>{t('Scheduler')}</Typography>
                    <Stack direction="row" spacing={3} flexWrap="wrap" alignItems="center">
                      <TextField
                        type="datetime-local"
                        label={t('Start')}
                        value={start}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStart(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        inputProps={{ step: 14400 }}
                        size="small"
                      />
                      <TextField
                        type="datetime-local"
                        label={t('End')}
                        value={end}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnd(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        inputProps={{ step: 14400 }}
                        size="small"
                      />
                      <Button
                        onClick={handleScheduleGuards}
                        variant="contained"
                        disabled={isGenerating}
                      >
                        {isGenerating ? t('Assigning') : t('Generate')}
                      </Button>
                      <Button onClick={handleClearGuards} variant="outlined" color="error" disabled={isGenerating}>
                        {t('Clear')}
                      </Button>
                      <Button onClick={() => setConstraintDialogOpen(true)} variant="outlined">
                        {t('Add Constraint')}
                      </Button>
                    </Stack>
                    {error && (
                      <Typography color="error" sx={{ mt: 2 }}>
                        {missingCount != null && missingCount > 0 
                          ? t('Missing about X people to complete the task').replace('{count}', String(missingCount))
                          : t(error)
                        }
                      </Typography>
                    )}
                  </Paper>
                  <Paper sx={{ p: 2, overflow: 'auto' }}>
                    <ScheduleCalendar
                      assignments={assignments}
                      posts={posts}
                      people={people}
                      start={start}
                      end={end}
                      isGenerating={isGenerating}
                      onAssignmentsChange={setAssignments}
                      shiftOverrides={shiftOverrides}
                      onShiftOverridesChange={setShiftOverrides}
                      esAssignments={esAssignments}
                      onESAssignmentsChange={setESAssignments}
                      esGroups={esGroups}
                      onESGroupsChange={setESGroups}
                      bwAssignments={bwAssignments}
                      onBWAssignmentsChange={setBWAssignments}
                      kitchenAssignments={kitchenAssignments}
                      escortAssignments={escortAssignments}
                      kitchenSettings={kitchenSettings}
                      escortSettings={escortSettings}
                      constraints={constraints}
                    />
                  </Paper>
                </>
              )}
              {tab === 1 && (
                <Paper sx={{ p: 2, overflow: 'auto' }}>
                  <KitchenDutyView
                    people={people}
                    start={kitchenStart}
                    end={kitchenEnd}
                    onStartChange={setKitchenStart}
                    onEndChange={setKitchenEnd}
                    archiveStart={start}
                    archiveEnd={end}
                    assignments={assignments}
                    bwAssignments={bwAssignments}
                    esAssignments={esAssignments}
                    kitchenAssignments={kitchenAssignments}
                    onKitchenAssignmentsChange={setKitchenAssignments}
                    escortAssignments={escortAssignments}
                    onEscortAssignmentsChange={setEscortAssignments}
                    kitchenSettings={kitchenSettings}
                    onKitchenSettingsChange={setKitchenSettings}
                    escortSettings={escortSettings}
                    onEscortSettingsChange={setEscortSettings}
                    constraints={constraints}
                    onGenerate={handleGenerateKitchen}
                    onClear={handleClearKitchen}
                    onAddConstraint={() => setConstraintDialogOpen(true)}
                    isGenerating={isGenerating}
                  />
                </Paper>
            )}
              {tab === 2 && (
                  <HistoryView people={people} posts={posts} />
                )}
            </Box>
          </Box>
        </Container>
      )}
      <Dialog open={constraintDialogOpen} onClose={() => setConstraintDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('Add Constraint')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <FormControl fullWidth size="small" sx={{ mt: 1 }}>
            <InputLabel>{t('Person')}</InputLabel>
            <Select
              label={t('Person')}
              value={constraintPersonId}
              onChange={e => setConstraintPersonId(Number(e.target.value))}
            >
              {people.map(p => (
                <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label={t('Activity name')}
            value={constraintTitle}
            onChange={e => setConstraintTitle(e.target.value)}
            fullWidth
            size="small"
          />
          <TextField
            type="datetime-local"
            label={t('Start')}
            value={constraintStart}
            onChange={e => setConstraintStart(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
          />
          <TextField
            type="datetime-local"
            label={t('End')}
            value={constraintEnd}
            onChange={e => setConstraintEnd(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
          />
          {constraintError && (
            <Typography color="error" variant="body2">
              {constraintError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConstraintDialogOpen(false)}>{t('Cancel')}</Button>
          <Button
            variant="contained"
            onClick={async () => {
              const titleMissing = !constraintTitle.trim();
              const missingFields = !constraintPersonId || !constraintStart || !constraintEnd;
              let err = '';
              if (titleMissing) err = t('Activity name is required');
              else {
                const startVal = constraintStart;
                const endVal = constraintEnd;
                if (startVal && endVal && endVal <= startVal) {
                  err = t('End must be after start');
                }
              }
              setConstraintError(err);
              if (err || missingFields) return;
              await addConstraint({
                personId: Number(constraintPersonId),
                title: constraintTitle,
                startISO: constraintStart,
                endISO: constraintEnd,
                id: 0,
              } as any);
              const fresh = await fetchConstraints();
              setConstraints(fresh);
              setConstraintDialogOpen(false);
              setConstraintPersonId('');
              setConstraintTitle('');
              setConstraintStart('');
              setConstraintEnd('');
              setConstraintError('');
            }}
          >
            {t('Add')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default App;
