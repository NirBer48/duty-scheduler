import React, { useState, useEffect } from 'react';
import ScheduleCalendar from './components/ScheduleView';
import PeopleEditor from './components/PeopleEditor';
import PostsEditor from './components/PostsEditor';
import { fetchPeople, fetchPosts, generateSchedule, clearSchedule, fetchLastSchedule } from './api';
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
} from './types';

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
  const [start, setStart] = useState(ensureDefaultStart);
  const [end, setEnd] = useState(ensureDefaultEnd);
  const { t, lang, setLang } = useI18n();
  const [error, setError] = useState('');

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
    const res = await generateSchedule(
      startISO,
      endISO,
      shiftOverrides,
      esAssignments,
      assignments,
      bwAssignments
    );
    setAssignments(res.assignments || []);
    setBWAssignments(res.bwAssignments || []);
    if (res.esAssignments) {
      setESAssignments(res.esAssignments);
    }
    setError(res.error || '');
    await Promise.all([refreshPeople(), refreshPosts()]);
  };

  const handleClearSchedule = async () => {
    if (window.confirm(t('Are you sure you want to clear the schedule?'))) {
      setAssignments([]);
      setESAssignments([
        { groupId: 'es1', personIds: [] },
        { groupId: 'es2', personIds: [] },
      ]);
      setBWAssignments([]);
      setStart(calculateDefaultStart());
      setEnd(calculateDefaultEnd());
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
      <Container maxWidth={false} sx={{ mt: 4, px: 3 }}>
        <Box display="flex" gap={3} alignItems="flex-start">
          <Box sx={{ minWidth: 320, maxWidth: 380, flexShrink: 0 }}>
            <PeopleEditor onUpdate={handlePeopleUpdate} />
            <PostsEditor onUpdate={handlePostsUpdate} />
          </Box>
          
          <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
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
                <Button onClick={handleSchedule} variant="contained">{t('Generate')}</Button>
                <Button onClick={handleClearSchedule} variant="outlined" color="error">{t('Clear')}</Button>
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
                onAssignmentsChange={setAssignments}
                shiftOverrides={shiftOverrides}
                onShiftOverridesChange={setShiftOverrides}
                esAssignments={esAssignments}
                onESAssignmentsChange={setESAssignments}
                esGroups={esGroups}
                onESGroupsChange={setESGroups}
                bwAssignments={bwAssignments}
                onBWAssignmentsChange={setBWAssignments}
              />
            </Paper>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}

export default App;
