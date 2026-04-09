import React, { useState, useEffect, useMemo } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Avatar from "@mui/material/Avatar";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import Popover from "@mui/material/Popover";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import { useI18n } from "../util/i18n";
import { fetchHistoryPeriods, fetchScheduleByPeriod } from "../api";
import ScheduleCalendar from "./ScheduleView";
import KitchenDutyView from "./KitchenDutyView";
import type {
  Post,
  Person,
  Assignment,
  BWAssignment,
  ESGroupAssignment,
  KitchenAssignment,
  EscortAssignment,
  KitchenSettings,
  EscortSettings,
} from "../types";
import {
  FormControl,
  Select,
  MenuItem,
} from "@mui/material";
type Props = {
  people: Person[];
  posts: Post[];
};

// Helper to get days in month
const getDaysInMonth = (year: number, month: number): number => {
  return new Date(year, month + 1, 0).getDate();
};

// Helper to get first day of month (0 = Sunday)
const getFirstDayOfMonth = (year: number, month: number): number => {
  return new Date(year, month, 1).getDay();
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_NAMES_HE = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DAY_NAMES_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];


const HistoryView: React.FC<Props> = ({ people, posts }) => {
  const [periods, setPeriods] = useState<{ start: string; end: string }[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [bwAssignments, setBWAssignments] = useState<BWAssignment[]>([]);
  const [esAssignments, setESAssignments] = useState<ESGroupAssignment[]>([]);
  const [kitchenAssignments, setKitchenAssignments] = useState<KitchenAssignment[]>([]);
  const [escortAssignments, setEscortAssignments] = useState<EscortAssignment[]>([]);
  const [kitchenSettings, setKitchenSettings] = useState<KitchenSettings>({ shifts: [{ id: 'default', start: '06:00', end: '21:00', required: 36 }] });
  const [escortSettings, setEscortSettings] = useState<EscortSettings>({ requiredShift1: 4, requiredShift2: 4, requiredShift3: 4, requiredShift4: 4 });
  const [error, setError] = useState<string>("");
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [calendarAnchor, setCalendarAnchor] = useState<HTMLElement | null>(null);

  const { t, rtl, lang } = useI18n();

  const monthNames = lang === 'he' ? MONTH_NAMES_HE : MONTH_NAMES;
  const dayNames = lang === 'he' ? DAY_NAMES_HE : DAY_NAMES;

  // Compute all dates that have history (only the start date of each period)
  const historyDates = useMemo(() => {
    const dates = new Set<string>();
    for (const period of periods) {
      dates.add(period.start);
    }
    return dates;
  }, [periods]);

  // Sorted array of history dates for navigation
  const sortedHistoryDates = useMemo(() => {
    return Array.from(historyDates).sort();
  }, [historyDates]);

  useEffect(() => {
    const loadPeriods = async () => {
      try {
        const data = await fetchHistoryPeriods();
        setPeriods(data.periods);
        // Auto-select most recent history date (start date of first/latest period)
        if (data.periods.length > 0) {
          const dates = data.periods.map(p => p.start).sort();
          const latestDate = dates[dates.length - 1];
          setSelectedDate(latestDate);
          const d = new Date(latestDate);
          setCurrentMonth(d.getMonth());
          setCurrentYear(d.getFullYear());
        }
      } catch (e: any) {
        setError(e?.message || "Failed to fetch periods");
      }
    };
    loadPeriods();
  }, []);

  // Find which period has this start date
  const findPeriodForDate = (date: string): { start: string; end: string } | null => {
    for (const period of periods) {
      if (date === period.start) {
        return period;
      }
    }
    return null;
  };

  const fetchForDate = async (date: string) => {
    const period = findPeriodForDate(date);
    if (!period) return;
    
    setLoading(true);
    setError("");
    try {
      const snap = await fetchScheduleByPeriod(period.start, period.end);
      const fetchedAssignments = snap.assignments || [];
      const fetchedBW = snap.bwAssignments || [];
      const fetchedES = snap.esAssignments || [];
      const fetchedKitchen = snap.kitchenAssignments || [];
      const fetchedEscort = snap.escortAssignments || [];
      
      setAssignments(fetchedAssignments);
      setBWAssignments(fetchedBW);
      setESAssignments(fetchedES);
      setKitchenAssignments(fetchedKitchen);
      setEscortAssignments(fetchedEscort);
      if (snap.kitchenSettings) setKitchenSettings(snap.kitchenSettings);
      if (snap.escortSettings) setEscortSettings(snap.escortSettings);

      // Use exact start/end from assignments; fallback to selected period bounds if missing
      let minStart = '';
      let maxEnd = '';
      for (const a of fetchedAssignments) {
        if (a.start && (!minStart || a.start < minStart)) minStart = a.start;
        if (a.end && (!maxEnd || a.end > maxEnd)) maxEnd = a.end;
      }
      if (!minStart) minStart = `${period.start}T00:00:00`;
      if (!maxEnd) maxEnd = `${period.end}T23:59:59`;

      setDateRange({ start: minStart, end: maxEnd });
    } catch (e: any) {
      setError(e?.message || "Failed to fetch history");
      setAssignments([]);
      setBWAssignments([]);
      setESAssignments([]);
      setKitchenAssignments([]);
      setEscortAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDate && historyDates.has(selectedDate)) {
      fetchForDate(selectedDate);
    }
  }, [selectedDate, historyDates]);

  // Navigation: go to previous history date
  const goToPrevHistory = () => {
    const idx = sortedHistoryDates.indexOf(selectedDate);
    if (idx > 0) {
      const newDate = sortedHistoryDates[idx - 1];
      setSelectedDate(newDate);
      const d = new Date(newDate);
      setCurrentMonth(d.getMonth());
      setCurrentYear(d.getFullYear());
    }
  };

  // Navigation: go to next history date
  const goToNextHistory = () => {
    const idx = sortedHistoryDates.indexOf(selectedDate);
    if (idx < sortedHistoryDates.length - 1) {
      const newDate = sortedHistoryDates[idx + 1];
      setSelectedDate(newDate);
      const d = new Date(newDate);
      setCurrentMonth(d.getMonth());
      setCurrentYear(d.getFullYear());
    }
  };

  // Calendar navigation
  const goToPrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const currentIdx = sortedHistoryDates.indexOf(selectedDate);
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx < sortedHistoryDates.length - 1;

  const handleDateClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    setCalendarAnchor(null); // Close popover after selection
  };

  // Render calendar grid
  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
    const days: React.ReactNode[] = [];

    // Empty cells for days before the first day
    for (let i = 0; i < firstDay; i++) {
      days.push(<Box key={`empty-${i}`} sx={{ width: 32, height: 32 }} />);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const hasHistory = historyDates.has(dateStr);
      const isSelected = dateStr === selectedDate;

      days.push(
        <Box
          key={day}
          onClick={() => hasHistory && handleDateClick(dateStr)}
          sx={{
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            cursor: hasHistory ? 'pointer' : 'default',
            bgcolor: isSelected ? 'primary.main' : hasHistory ? 'primary.light' : 'transparent',
            color: isSelected ? 'primary.contrastText' : hasHistory ? 'primary.contrastText' : 'text.disabled',
            fontWeight: hasHistory ? 600 : 400,
            opacity: hasHistory ? 1 : 0.4,
            fontSize: '0.875rem',
            transition: 'all 0.2s',
            '&:hover': hasHistory ? {
              bgcolor: isSelected ? 'primary.dark' : 'primary.main',
              color: 'primary.contrastText',
            } : {},
          }}
        >
          {day}
        </Box>
      );
    }

    return days;
  };

  return (
    <>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">
            {t("History")}
          </Typography>
          
          {/* Compact Navigation Bar */}
          <Stack direction="row" alignItems="center" spacing={1}>
            <IconButton 
              onClick={goToPrevHistory} 
              disabled={!hasPrev}
              size="small"
              color="primary"
              title={t("Previous history date")}
            >
              {rtl ? <NavigateNextIcon /> : <NavigateBeforeIcon />}
            </IconButton>
            
            <Button
              onClick={(e) => setCalendarAnchor(e.currentTarget)}
              variant="outlined"
              size="small"
              sx={{ minWidth: 150, textTransform: 'none', display: 'flex', alignItems: 'center', gap: 1 }}
            >
              {!rtl && <CalendarMonthIcon sx={{ fontSize: 20 }} />}
              {selectedDate ? new Date(selectedDate + 'T00:00:00').toLocaleDateString() : t("Select date")}
              {rtl && <CalendarMonthIcon sx={{ fontSize: 20 }} />}
            </Button>
            
            <IconButton 
              onClick={goToNextHistory} 
              disabled={!hasNext}
              size="small"
              color="primary"
              title={t("Next history date")}
            >
              {rtl ? <NavigateBeforeIcon /> : <NavigateNextIcon />}
            </IconButton>
            
            {loading && (
              <Typography variant="body2" color="text.secondary">
                {t("Loading...")}
              </Typography>
            )}
          </Stack>
        </Stack>

        {error && (
          <Typography color="error" sx={{ mt: 1 }}>
            {t(error)}
          </Typography>
        )}

        {/* Calendar Popover */}
        <Popover
          open={Boolean(calendarAnchor)}
          anchorEl={calendarAnchor}
          onClose={() => setCalendarAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Box sx={{ p: 2 }}>
            {/* Month/Year Header */}
            <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ mb: 1 }}>
              <IconButton onClick={rtl ? goToNextMonth : goToPrevMonth} size="small">
                <ChevronLeftIcon />
              </IconButton>
              <FormControl size="small" variant="standard">
                <Select
                  value={currentMonth}
                  onChange={(e) => setCurrentMonth(e.target.value as number)}
                  disableUnderline
                  MenuProps={{
                    disablePortal: false,
                    PaperProps: { sx: { maxHeight: 300 } },
                  }}
                  sx={{ 
                    fontWeight: 600, 
                    fontSize: '0.875rem',
                    '& .MuiSelect-select': { py: 0, pr: 2 }
                  }}
                >
                  {monthNames.map((month, idx) => (
                    <MenuItem key={idx} value={idx}>{month}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" variant="standard">
                <Select
                  value={currentYear}
                  onChange={(e) => setCurrentYear(e.target.value as number)}
                  disableUnderline
                  MenuProps={{
                    disablePortal: false,
                    PaperProps: { sx: { maxHeight: 300 } },
                  }}
                  sx={{ 
                    fontWeight: 600, 
                    fontSize: '0.875rem',
                    '& .MuiSelect-select': { py: 0, pr: 2 }
                  }}
                >
                  {Array.from({ length: 20 }, (_, i) => currentYear - 10 + i).map(year => (
                    <MenuItem key={year} value={year}>{year}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <IconButton onClick={rtl ? goToPrevMonth : goToNextMonth} size="small">
                <ChevronRightIcon />
              </IconButton>
            </Stack>

            {/* Day names header */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 32px)', gap: 0.5, mb: 0.5 }}>
              {dayNames.map(day => (
                <Box
                  key={day}
                  sx={{
                    width: 32,
                    height: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    color: 'text.secondary',
                  }}
                >
                  {t(day)}
                </Box>
              ))}
            </Box>

            {/* Calendar Grid */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 32px)', gap: 0.5 }}>
              {renderCalendar()}
            </Box>
          </Box>
        </Popover>
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Box sx={{ height: "60vh", overflow: "auto" }}>
          {assignments.length === 0 && bwAssignments.length === 0 && esAssignments.length === 0 && kitchenAssignments.length === 0 && escortAssignments.length === 0 ? (
            <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}>
              <Card
                sx={{
                  width: "100%",
                  maxWidth: 640,
                  bgcolor: "background.paper",
                }}
              >
                <CardContent
                  sx={{
                    display: "flex",
                    gap: 2,
                    alignItems: "center",
                    flexDirection: rtl ? "row-reverse" : "row",
                  }}
                >
                  <Avatar
                    sx={{ bgcolor: "primary.main", width: 64, height: 64 }}
                  >
                    <CalendarMonthIcon sx={{ fontSize: 32 }} />
                  </Avatar>
                  <Box sx={{ flex: 1, textAlign: rtl ? "right" : "left" }}>
                    <Typography variant="h6">
                      {t("No history for this day")}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 1 }}
                    >
                      {t("Explore other dates")}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Box>
          ) : (
            <>
              <ScheduleCalendar
                assignments={assignments}
                posts={posts}
                people={people}
                start={dateRange.start}
                end={dateRange.end}
                isGenerating={false}
                shiftOverrides={[]}
                esAssignments={esAssignments}
                esGroups={[]}
                bwAssignments={bwAssignments}
                constraints={[]}
                readOnly={true}
                kitchenAssignments={kitchenAssignments}
                escortAssignments={escortAssignments}
                kitchenSettings={kitchenSettings}
                escortSettings={escortSettings}
              />
              <Box sx={{ mt: 3 }}>
                <KitchenDutyView
                  people={people}
                  kitchenDay={(dateRange.start || '').substring(0, 10) || (selectedPeriod.split(' ')[0] || '')}
                  onKitchenDayChange={() => {}}
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
                  constraints={[]}
                  onGenerate={() => {}}
                  onClear={() => {}}
                  onAddConstraint={() => {}}
                  readOnly={true}
                />
              </Box>
            </>
          )}
        </Box>
      </Paper>
    </>
  );
};

export default HistoryView;
