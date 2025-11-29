import React, { useState, useEffect } from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Checkbox,
    FormControlLabel,
    Box,
    Typography,
    TextField
} from "@mui/material";
import { useI18n } from "../../util/i18n";
import { Person, ESGroup } from "../../types";

interface Props {
    open: boolean;
    onClose: () => void;
    group: ESGroup;
    people: Person[];
    currentPersonIds: number[];
    onSave: (personIds: number[], totalPeople: number) => void;
    otherESPersonIds: number[];
}

export function ESEditDialog({ 
    open, 
    onClose, 
    group, 
    people, 
    currentPersonIds, 
    onSave, 
    otherESPersonIds 
}: Props) {
    const [selected, setSelected] = useState<number[]>(currentPersonIds);
    const [totalPeople, setTotalPeople] = useState(group.totalPeople);
    const { t } = useI18n();

    useEffect(() => {
        setSelected(currentPersonIds);
        setTotalPeople(group.totalPeople);
    }, [currentPersonIds, group.totalPeople, open]);

    const handleToggle = (personId: number) => {
        setSelected(prev => {
            if (prev.includes(personId)) {
                return prev.filter(id => id !== personId);
            } else {
                if (prev.length < totalPeople) {
                    return [...prev, personId];
                }
                return prev;
            }
        });
    };

    const handleSave = () => {
        onSave(selected, totalPeople);
        onClose();
    };

    // Filter out people already in the other ES group
    const availablePeople = people.filter(p => !otherESPersonIds.includes(p.id));

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                {t('Edit ES Group')}: {group.name}
            </DialogTitle>
            <DialogContent>
                <Box sx={{ mb: 2, mt: 1}}>
                    <TextField
                        type="number"
                        label={t('Total people needed')}
                        value={totalPeople}
                        onChange={e => {
                            const newVal = Math.max(1, Number(e.target.value));
                            setTotalPeople(newVal);
                            if (selected.length > newVal) {
                                setSelected(prev => prev.slice(0, newVal));
                            }
                        }}
                        fullWidth
                        InputProps={{ inputProps: { min: 1 } }}
                        size="small"
                    />
                </Box>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                    {t('Active per shift')}: {group.activePerShift} ({t('rest are resting')})
                </Typography>
                <Typography variant="body2" color={selected.length === totalPeople ? "success.main" : "warning.main"} sx={{ mb: 2 }}>
                    {t('Selected')}: {selected.length} / {totalPeople}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 300, overflow: 'auto' }}>
                    {availablePeople.map(person => {
                        const isSelected = selected.includes(person.id);
                        const isDisabled = !isSelected && selected.length >= totalPeople;

                        return (
                            <FormControlLabel
                                key={person.id}
                                control={
                                    <Checkbox
                                        checked={isSelected}
                                        onChange={() => handleToggle(person.id)}
                                        disabled={isDisabled}
                                    />
                                }
                                label={`${person.name} (${person.gender})`}
                                sx={{ opacity: isDisabled ? 0.5 : 1 }}
                            />
                        );
                    })}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('Cancel')}</Button>
                <Button onClick={handleSave} variant="contained">{t('Save')}</Button>
            </DialogActions>
        </Dialog>
    );
}

