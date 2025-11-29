import React, { useState, useEffect } from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    TextField
} from "@mui/material";
import { useI18n } from "../../util/i18n";
import { Post } from "../../types";

interface Props {
    open: boolean;
    onClose: () => void;
    post: Post;
    day: string;
    shiftLabel: string;
    currentRequired: number;
    onSave: (required: number) => void;
}

export const ShiftSettingsDialog: React.FC<Props> = ({ 
    open, 
    onClose, 
    post, 
    day, 
    shiftLabel, 
    currentRequired, 
    onSave 
}) => {
    const [required, setRequired] = useState(currentRequired);
    const { t } = useI18n();

    useEffect(() => {
        setRequired(currentRequired);
    }, [currentRequired, open]);

    const handleSave = () => {
        onSave(required);
        onClose();
};

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>
                {t('Shift Settings')}: {post.name}
            </DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                    {day} {shiftLabel}
                </Typography>
                <TextField
                    type="number"
                    label={t('Required per shift')}
                    value={required}
                    onChange={e => setRequired(Math.max(0, Number(e.target.value)))}
                    fullWidth
                    InputProps={{ inputProps: { min: 0 } }}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('Cancel')}</Button>
                <Button onClick={handleSave} variant="contained">{t('Save')}</Button>
            </DialogActions>
        </Dialog>
    );
}

