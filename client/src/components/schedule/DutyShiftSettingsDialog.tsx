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
  onSave: (required: number) => void;
}

export const DutyShiftSettingsDialog: React.FC<Props> = ({
  open,
  onClose,
  title,
  shiftLabel,
  currentRequired,
  onSave,
}) => {
  const { t } = useI18n();
  const [required, setRequired] = useState<number>(currentRequired);

  useEffect(() => {
    setRequired(currentRequired);
  }, [currentRequired, open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        {t("Shift Settings")}: {title}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          {t("Shift")}: {shiftLabel}
        </Typography>
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
        <Button
          onClick={() => {
            onSave(required);
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


