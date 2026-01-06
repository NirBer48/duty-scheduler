import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  TextField,
} from "@mui/material";
import { useI18n } from "../../util/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  shiftLabel: string;
  currentRequired: number;
  // Optional boundary edit: start time of this shift (prev shift end will follow)
  currentStartHHmm?: string; // "HH:mm"
  canEditStart?: boolean;
  // Optional boundary edit: end time of this shift (next shift start will follow)
  currentEndHHmm?: string; // "HH:mm"
  canEditEnd?: boolean;
  onSave: (required: number, newStartHHmm?: string, newEndHHmm?: string) => void;
  canRemove?: boolean;
  onRemove?: () => void;
}

export const DutyShiftSettingsDialog: React.FC<Props> = ({
  open,
  onClose,
  title,
  shiftLabel,
  currentRequired,
  currentStartHHmm,
  canEditStart = false,
  currentEndHHmm,
  canEditEnd = false,
  onSave,
  canRemove = false,
  onRemove,
}) => {
  const { t } = useI18n();
  const [required, setRequired] = useState<number>(currentRequired);
  const [startHHmm, setStartHHmm] = useState<string>(currentStartHHmm || "06:00");
  const [endHHmm, setEndHHmm] = useState<string>(currentEndHHmm || "21:00");

  useEffect(() => {
    setRequired(currentRequired);
    setStartHHmm(currentStartHHmm || "06:00");
    setEndHHmm(currentEndHHmm || "21:00");
  }, [currentRequired, currentStartHHmm, currentEndHHmm, open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        {t("Shift Settings")}: {title}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          {t("Shift")}: {shiftLabel}
        </Typography>
        {canEditStart && (
          <TextField
            type="time"
            label={t("Start")}
            value={startHHmm}
            onChange={(e) => setStartHHmm(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
            InputLabelProps={{ shrink: true }}
            inputProps={{ step: 60 }}
          />
        )}
        {canEditEnd && (
          <TextField
            type="time"
            label={t("End")}
            value={endHHmm}
            onChange={(e) => setEndHHmm(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
            InputLabelProps={{ shrink: true }}
            inputProps={{ step: 60 }}
          />
        )}
        <TextField
          type="number"
          label={t("Required per shift")}
          value={required}
          onChange={(e) => setRequired(Math.max(0, Number(e.target.value)))}
          fullWidth
          InputProps={{ inputProps: { min: 0 } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("Cancel")}</Button>
        {canRemove && (
          <Button
            onClick={() => {
              onRemove?.();
              onClose();
            }}
            color="error"
          >
            {t("Remove")}
          </Button>
        )}
        <Button
          onClick={() => {
            onSave(
              required,
              canEditStart ? startHHmm : undefined,
              canEditEnd ? endHHmm : undefined
            );
            onClose();
          }}
          variant="contained"
        >
          {t("Save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};


