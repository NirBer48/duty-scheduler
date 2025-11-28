import React, { useState, useEffect } from 'react';
import ScheduleCalendar from './components/ScheduleView';
import PeopleEditor from './components/PeopleEditor';
import PostsEditor from './components/PostsEditor';
import { fetchPeople, fetchPosts, generateSchedule } from './api';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import { useI18n } from './util/i18n';
import type { Post, Person, Assignment, ShiftOverride } from './types';

const STORAGE_KEY_START = 'duty_scheduler_start';
const STORAGE_KEY_END = 'duty_scheduler_end';

function getDefaultStart() {
  const saved = localStorage.getItem(STORAGE_KEY_START);
  if (saved) return saved;
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(Math.floor(d.getHours() / 4) * 4);
  return d.toISOString().slice(0, 16);
}
function getDefaultEnd() {
  const saved = localStorage.getItem(STORAGE_KEY_END);
  if (saved) return saved;
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(Math.floor(d.getHours() / 4) * 4 + 24);
  return d.toISOString().slice(0, 16);
}

export default function App() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [shiftOverrides, setShiftOverrides] = useState<ShiftOverride[]>([]);
  const [start, setStart] = useState(getDefaultStart);
  const [end, setEnd] = useState(getDefaultEnd);
  const { t, lang, setLang } = useI18n();
  const [error, setError] = useState('');

  useEffect(() => { fetchPeople().then(setPeople); }, []);
  useEffect(() => { fetchPosts().then(setPosts); }, []);

  // Persist dates
  useEffect(() => { localStorage.setItem(STORAGE_KEY_START, start); }, [start]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_END, end); }, [end]);

  const handleSchedule = async () => {
    const startISO = new Date(start).toISOString();
    const endISO = new Date(end).toISOString();
    const res = await generateSchedule(startISO, endISO, shiftOverrides);
    setAssignments(res.assignments || []);
    setError(res.error || '');
    fetchPeople().then(setPeople);
    fetchPosts().then(setPosts);
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
              />
            </Paper>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
