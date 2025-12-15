import React, { useState, useEffect } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Avatar from "@mui/material/Avatar";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ArrowBackIosIcon from "@mui/icons-material/ArrowBackIos";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import { useI18n } from "../util/i18n";
import { fetchScheduleByDate } from "../api";
import ScheduleCalendar from "./ScheduleView";
import type { Post, Person, Assignment, BWAssignment } from "../types";

type Props = {
  people: Person[];
  posts: Post[];
};

const toISODate = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const HistoryView: React.FC<Props> = ({ people, posts }) => {
  const [date, setDate] = useState<string>(() => toISODate(new Date()));
  const [loading, setLoading] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [bwAssignments, setBWAssignments] = useState<BWAssignment[]>([]);
  const [error, setError] = useState<string>("");

  const { t, rtl } = useI18n();

  const fetchForDate = async (day: string) => {
    setLoading(true);
    setError("");
    try {
      const snap = await fetchScheduleByDate(day);
      setAssignments(snap.assignments || []);
      setBWAssignments(snap.bwAssignments || []);
    } catch (e: any) {
      setError(e?.message || "Failed to fetch history");
      setAssignments([]);
      setBWAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForDate(date);
  }, [date]);

  const changeDay = (delta: number) => {
    const parts = date.split("-").map((s) => Number(s));
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    d.setDate(d.getDate() + delta);
    setDate(toISODate(d));
  };

  const start = `${date}T00:00`;
  const parts = date.split("-").map((s) => Number(s));
  const next = new Date(parts[0], parts[1] - 1, parts[2]);
  next.setDate(next.getDate() + 1);
  const end = `${toISODate(next)}T00:00`;

  return (
    <Paper sx={{ p: 2 }}>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <Box sx={{ display: "flex", gap: 1 }}>
                  <Button
                    onClick={() => changeDay(-1)}
                    disabled={loading}
                    variant="outlined"
                    size="small"
                    startIcon={
                      rtl ? <ArrowForwardIosIcon /> : <ArrowBackIosIcon />
                    }
                    sx={{ textTransform: "none", borderRadius: 1 }}
                  >
                    {t("Prev")}
                  </Button>
                  <TextField
                    label={t("Date")}
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                  />
                  <Button
                    onClick={() => changeDay(1)}
                    disabled={loading}
                    variant="contained"
                    size="small"
                    endIcon={
                      rtl ? <ArrowBackIosIcon /> : <ArrowForwardIosIcon />
                    }
                    sx={{ textTransform: "none", ml: 1, borderRadius: 1 }}
                  >
                    {t("Next")}
                  </Button>
                </Box>
        {loading && (
          <Typography variant="body2">
            {t("Assigning") || "Loading..."}
          </Typography>
        )}
        {error && (
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        )}
      </Stack>

      <Box sx={{ height: "60vh", overflow: "auto" }}>
        {assignments.length === 0 && bwAssignments.length === 0 ? (
          <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}>
            <Card
              sx={{ width: "100%", maxWidth: 640, bgcolor: "background.paper" }}
            >
              <CardContent
                sx={{
                  display: "flex",
                  gap: 2,
                  alignItems: "center",
                  flexDirection: rtl ? "row-reverse" : "row",
                }}
              >
                <Avatar sx={{ bgcolor: "primary.main", width: 64, height: 64 }}>
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
          <ScheduleCalendar
            assignments={assignments}
            posts={posts}
            people={people}
            start={start}
            end={end}
            isGenerating={false}
            onAssignmentsChange={() => {}}
            shiftOverrides={[]}
            onShiftOverridesChange={() => {}}
            esAssignments={[]}
            onESAssignmentsChange={() => {}}
            esGroups={[]}
            onESGroupsChange={() => {}}
            bwAssignments={bwAssignments}
            onBWAssignmentsChange={() => {}}
            constraints={[]}
          />
        )}
      </Box>
    </Paper>
  );
};

export default HistoryView;
