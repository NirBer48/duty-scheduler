import React, { useState, useEffect } from 'react';
import ScheduleCalendar from './components/ScheduleView';
import PeopleEditor from './components/PeopleEditor';
import PostsEditor from './components/PostsEditor';
import { fetchPeople, fetchPosts, generateSchedule, clearSchedule, fetchLastSchedule, fetchConstraints, addConstraint } from './api';
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

const STORAGE_KEY_START = 'duty_scheduler_start';
const STORAGE_KEY_END = 'duty_scheduler_end';
const STORAGE_KEY_ASSIGNMENTS = 'duty_scheduler_assignments';
const STORAGE_KEY_ES_ASSIGNMENTS = 'duty_scheduler_es_assignments';
const STORAGE_KEY_ES_GROUPS = 'duty_scheduler_es_groups';
const STORAGE_KEY_SHIFT_OVERRIDES = 'duty_scheduler_shift_overrides';

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

const ensureDefaultTime = (storageKey: string, calculate: () => string) => {
  const saved = localStorage.getItem(storageKey);
  if (saved && saved.endsWith('T20:00')) return saved;
  const next = calculate();
  localStorage.setItem(storageKey, next);
  return next;
};

const ensureDefaultStart = () => ensureDefaultTime(STORAGE_KEY_START, calculateDefaultStart);
const ensureDefaultEnd = () => ensureDefaultTime(STORAGE_KEY_END, calculateDefaultEnd);

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
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [start, setStart] = useState(ensureDefaultStart);
  const [end, setEnd] = useState(ensureDefaultEnd);
  const { t, lang, setLang } = useI18n();
  const [error, setError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [constraintDialogOpen, setConstraintDialogOpen] = useState(false);
  const [constraintPersonId, setConstraintPersonId] = useState<number | ''>('');
  const [constraintTitle, setConstraintTitle] = useState('');
  const [constraintStart, setConstraintStart] = useState('');
  const [constraintEnd, setConstraintEnd] = useState('');
  const [constraintError, setConstraintError] = useState('');
  const [tab, setTab] = useState(0);

  const refreshPeople = () => fetchPeople().then(setPeople);
  const refreshPosts = () => fetchPosts().then(data => {
    setPosts(data);
    return data;
  });

  useEffect(() => {
    refreshPeople();
  }, []);

  useEffect(() => {
    refreshPosts();
  }, []);

  useEffect(() => {
    fetchConstraints().then(setConstraints).catch(() => { });
  }, []);

  useEffect(() => {
    const loadLastSchedule = async () => {
      try {
        const snapshot = await fetchLastSchedule();
        if (snapshot.assignments?.length) {
          setAssignments(snapshot.assignments);
        }
        setBWAssignments(snapshot.bwAssignments || []);
        if (snapshot.esAssignments?.length) {
          setESAssignments(snapshot.esAssignments);
        }
      } catch (err) {
        console.error('Failed to load last schedule', err);
      }
    };
    loadLastSchedule();
  }, []);

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
  useEffect(() => { localStorage.setItem(STORAGE_KEY_ASSIGNMENTS, JSON.stringify(assignments)); }, [assignments]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_ES_ASSIGNMENTS, JSON.stringify(esAssignments)); }, [esAssignments]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_ES_GROUPS, JSON.stringify(esGroups)); }, [esGroups]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_SHIFT_OVERRIDES, JSON.stringify(shiftOverrides)); }, [shiftOverrides]);

  const handleSchedule = async () => {
    const startISO = new Date(start).toISOString();
    const endISO = new Date(end).toISOString();
    setIsGenerating(true);
    try {
      const res = await generateSchedule(
        startISO,
        endISO,
        shiftOverrides,
        esAssignments,
        assignments,
        bwAssignments,
        constraints
      );
      setAssignments(res.assignments || []);
      setBWAssignments(res.bwAssignments || []);
      if (res.esAssignments) {
        setESAssignments(res.esAssignments);
      }
      setError(res.error || '');
      await Promise.all([refreshPeople(), refreshPosts()]);
    } catch (e) {
      setError(t('Save failed'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClearSchedule = async () => {
    if (window.confirm(t('Are you sure you want to clear the schedule?'))) {
      setAssignments([]);
      setESAssignments([
        { groupId: 'es1', personIds: [] },
        { groupId: 'es2', personIds: [] },
      ]);
      setBWAssignments([]);
      setError('');
      await clearSchedule();
    }
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
          <Typography variant="h6" sx={{ flexGrow: 1 }}>{t('Duty Scheduler')}</Typography>
          <Button color="inherit" onClick={() => setLang(lang === 'en' ? 'he' : 'en')}>
            {lang === 'en' ? 'עברית' : 'English'}
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth={false} sx={{ mt: 2, px: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label={t('Guardes')} />
          <Tab label={t('Kitchen')} />
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
                      onClick={handleSchedule}
                      variant="contained"
                      disabled={isGenerating}
                    >
                      {isGenerating ? t('Assigning') : t('Generate')}
                    </Button>
                    <Button onClick={handleClearSchedule} variant="outlined" color="error" disabled={isGenerating}>
                      {t('Clear')}
                    </Button>
                    <Button onClick={() => setConstraintDialogOpen(true)} variant="outlined">
                      {t('Add Constraint')}
                    </Button>
                  </Stack>
                  {error && (
                    <Typography color="error" sx={{ mt: 2 }}>{t(error)}</Typography>
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
                    constraints={constraints}
                  />
                </Paper>
              </>
            )}
            {tab === 1 && (
              <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="h6" gutterBottom>{t('Kitchen')}</Typography>
                <Stack direction="row" spacing={3} flexWrap="wrap" alignItems="center">
                  <TextField
                    type="datetime-local"
                    label={t('Start')}
                    value={start}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ step: 14400 }}
                    size="small"
                    onChange={() => { }}
                  />
                  <TextField
                    type="datetime-local"
                    label={t('End')}
                    value={end}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ step: 14400 }}
                    size="small"
                    onChange={() => { }}
                  />
                  <Button variant="contained" onClick={() => { }}>
                    {t('Generate')}
                  </Button>
                  <Button variant="outlined" color="error" onClick={() => { }}>
                    {t('Clear')}
                  </Button>
                  <Button onClick={() => setConstraintDialogOpen(true)} variant="outlined">
                    {t('Add Constraint')}
                  </Button>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {t('Coming soon')}
                </Typography>
              </Paper>
            )}
          </Box>
        </Box>
      </Container>
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
