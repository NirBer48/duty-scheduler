import React, { useState, useEffect } from 'react';
import ScheduleCalendar from './components/ScheduleView';
import PeopleEditor from './components/PeopleEditor';
import PostsEditor from './components/PostsEditor';
import { fetchPeople, fetchPosts, generateSchedule, fetchLastSchedule, clearSchedule } from './api';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import { useI18n } from './util/i18n';
import type { Post, Person, Assignment, ShiftOverride, ESGroupAssignment, ESGroup } from './types';

const STORAGE_KEY_START = 'duty_scheduler_start';
const STORAGE_KEY_END = 'duty_scheduler_end';
const STORAGE_KEY_ASSIGNMENTS = 'duty_scheduler_assignments';
const STORAGE_KEY_ES_ASSIGNMENTS = 'duty_scheduler_es_assignments';
const STORAGE_KEY_ES_GROUPS = 'duty_scheduler_es_groups';
const STORAGE_KEY_SHIFT_OVERRIDES = 'duty_scheduler_shift_overrides';

// Format date as local datetime-local string (YYYY-MM-DDTHH:MM)
function formatLocalDateTime(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Calculate the most recent 20:00 (start of current duty cycle)
function calculateDefaultStart(): string {
  const now = new Date();
  const d = new Date(now);
  
  // Set to 20:00 of current day
  d.setHours(20, 0, 0, 0);
  
  // If current time is before 20:00, use yesterday's 20:00
  if (now < d) {
    d.setDate(d.getDate() - 1);
  }
  
  return formatLocalDateTime(d);
}

// Calculate 20:00 the next day (end of current duty cycle - 24 hours = 6 shifts)
function calculateDefaultEnd(): string {
  const now = new Date();
  const d = new Date(now);
  
  // Set to 20:00 of current day
  d.setHours(20, 0, 0, 0);
  
  // If current time is before 20:00, use today's 20:00
  // Otherwise use tomorrow's 20:00
  if (now >= d) {
    d.setDate(d.getDate() + 1);
  }
  
  return formatLocalDateTime(d);
}

// Get saved start or calculate default
function getDefaultStart() {
  const saved = localStorage.getItem(STORAGE_KEY_START);
  // Only use saved value if it's at 20:00, otherwise recalculate
  if (saved && saved.endsWith('T20:00')) return saved;
  const newDefault = calculateDefaultStart();
  localStorage.setItem(STORAGE_KEY_START, newDefault);
  return newDefault;
}

// Get saved end or calculate default
function getDefaultEnd() {
  const saved = localStorage.getItem(STORAGE_KEY_END);
  // Only use saved value if it's at 20:00, otherwise recalculate
  if (saved && saved.endsWith('T20:00')) return saved;
  const newDefault = calculateDefaultEnd();
  localStorage.setItem(STORAGE_KEY_END, newDefault);
  return newDefault;
}

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Error loading from storage:', key, e);
  }
  return defaultValue;
}

export default function App() {
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
      { id: 'es2', name: "כ\"כ ב'", totalPeople: 4, activePerShift: 1 },
    ])
  );
  const [start, setStart] = useState(getDefaultStart);
  const [end, setEnd] = useState(getDefaultEnd);
  const { t, lang, setLang } = useI18n();
  const [error, setError] = useState('');

  useEffect(() => { fetchPeople().then(setPeople); }, []);
  useEffect(() => { fetchPosts().then(setPosts); }, []);

  // Persist all state to localStorage
  useEffect(() => { localStorage.setItem(STORAGE_KEY_START, start); }, [start]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_END, end); }, [end]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_ASSIGNMENTS, JSON.stringify(assignments)); }, [assignments]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_ES_ASSIGNMENTS, JSON.stringify(esAssignments)); }, [esAssignments]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_ES_GROUPS, JSON.stringify(esGroups)); }, [esGroups]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_SHIFT_OVERRIDES, JSON.stringify(shiftOverrides)); }, [shiftOverrides]);

  const handleSchedule = async () => {
    const startISO = new Date(start).toISOString();
    const endISO = new Date(end).toISOString();
    // Pass ES assignments and existing assignments to the scheduler
    const res = await generateSchedule(startISO, endISO, shiftOverrides, esAssignments, assignments);
    setAssignments(res.assignments || []);
    setError(res.error || '');
    fetchPeople().then(setPeople);
    fetchPosts().then(setPosts);
  };

  const handleClearSchedule = async () => {
    if (window.confirm(t('Are you sure you want to clear the schedule?'))) {
      setAssignments([]);
      // Keep shiftOverrides - they should persist across clears
      // Clear ES assignments as well
      setESAssignments([
        { groupId: 'es1', personIds: [] },
        { groupId: 'es2', personIds: [] },
      ]);
      // Reset dates to default (20:00 to 20:00)
      setStart(calculateDefaultStart());
      setEnd(calculateDefaultEnd());
      setError('');
      await clearSchedule();
    }
  };

  // Reactive: update posts in grid when PostsEditor changes
  const handlePostsUpdate = (updatedPosts: Post[]) => {
    setPosts(updatedPosts);
  };
  // Reactive: update people in grid when PeopleEditor changes
  const handlePeopleUpdate = () => {
    fetchPeople().then(setPeople);
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
          {/* Sidebar - People & Posts editors */}
          <Box sx={{ minWidth: 320, maxWidth: 380, flexShrink: 0 }}>
            <PeopleEditor onUpdate={handlePeopleUpdate} />
            <PostsEditor onUpdate={handlePostsUpdate} />
          </Box>
          
          {/* Main content - Schedule */}
          <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6" gutterBottom>{t('Scheduler')}</Typography>
              <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
                <Typography>{t('Start')}:</Typography>
                <input type="datetime-local" value={start} step={14400} onChange={e => setStart(e.target.value)} />
                <Typography>{t('End')}:</Typography>
                <input type="datetime-local" value={end} step={14400} onChange={e => setEnd(e.target.value)} />
                <Button onClick={handleSchedule} variant="contained">{t('Generate')}</Button>
                <Button onClick={handleClearSchedule} variant="outlined" color="error">{t('Clear')}</Button>
              </Box>
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
              />
            </Paper>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
