import React, { useState, useEffect } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Avatar from "@mui/material/Avatar";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import { useI18n } from "../util/i18n";
import { fetchHistoryPeriods, fetchScheduleByPeriod } from "../api";
import ScheduleCalendar from "./ScheduleView";
import KitchenDutyView from "./KitchenDutyView";
import type { Post, Person, Assignment, BWAssignment, ESGroupAssignment, KitchenAssignment, EscortAssignment, KitchenSettings, EscortSettings } from "../types";import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
type Props = {
  people: Person[];
  posts: Post[];
};


const HistoryView: React.FC<Props> = ({ people, posts }) => {
  const [periods, setPeriods] = useState<{ start: string; end: string }[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [bwAssignments, setBWAssignments] = useState<BWAssignment[]>([]);
  const [esAssignments, setESAssignments] = useState<ESGroupAssignment[]>([]);
  const [kitchenAssignments, setKitchenAssignments] = useState<KitchenAssignment[]>([]);
  const [escortAssignments, setEscortAssignments] = useState<EscortAssignment[]>([]);
  const [kitchenSettings, setKitchenSettings] = useState<KitchenSettings>({ requiredPerShift: 36, shift2Start: '13:00' });
  const [escortSettings, setEscortSettings] = useState<EscortSettings>({ requiredPerShift: 4 });
  const [error, setError] = useState<string>("");
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });

  const { t, rtl } = useI18n();

  useEffect(() => {
    const loadPeriods = async () => {
      try {
        const data = await fetchHistoryPeriods();
        setPeriods(data.periods);
        if (data.periods.length > 0) {
          setSelectedPeriod(`${data.periods[0].start} to ${data.periods[0].end}`);
        }
      } catch (e: any) {
        setError(e?.message || "Failed to fetch periods");
      }
    };
    loadPeriods();
  }, []);

  const fetchForPeriod = async (periodStr: string) => {
    if (!periodStr) return;
    const [start, , end] = periodStr.split(' ');
    setLoading(true);
    setError("");
    try {
      const snap = await fetchScheduleByPeriod(start, end);
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
      if (!minStart) minStart = `${start}T00:00:00`;
      if (!maxEnd) maxEnd = `${end}T23:59:59`;

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
    if (selectedPeriod) {
      fetchForPeriod(selectedPeriod);
    }
  }, [selectedPeriod]);

  return (
    <>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          {t("History")}
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <FormControl size="small">
            <InputLabel>{t("Schedule Period")}</InputLabel>
            <Select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              label={t("Schedule Period")}
              sx={{ minWidth: 200 }}
            >
              {periods.map((p, i) => (
                <MenuItem key={i} value={`${p.start} to ${p.end}`}>
                  {p.start} to {p.end}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {loading && (
            <Typography variant="body2">
              {t("Loading...")}
            </Typography>
          )}
        </Stack>
        {error && (
          <Typography color="error" sx={{ mt: 2 }}>
            {t(error)}
          </Typography>
        )}
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
                  start={dateRange.start}
                  end={dateRange.end}
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
