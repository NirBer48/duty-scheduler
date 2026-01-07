import React, { useState, useEffect, useMemo } from "react";
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
    TextField,
    Alert,
    Tooltip
} from "@mui/material";
import { useI18n } from "../../util/i18n";
import { Assignment, BWAssignment, Escort400Assignment, EscortAssignment, KitchenAssignment, Person, ESGroup, Constraint, RasarAssignment } from "../../types";
import { buildDutyCountsByPerson } from "./dutyCounts";

interface Props {
    open: boolean;
    onClose: () => void;
    group: ESGroup;
    people: Person[];
    currentPersonIds: number[];
    onSave: (personIds: number[], totalPeople: number) => void;
    otherESPersonIds: number[];
    constraints?: Constraint[];
    rangeStartISO: string;
    rangeEndISO: string;
    guardAssignments: Assignment[];
    bwAssignments: BWAssignment[];
    kitchenAssignments: KitchenAssignment[];
    escortAssignments: EscortAssignment[];
    rasarAssignments: RasarAssignment[];
    escort400Assignments: Escort400Assignment[];
}

export const ESEditDialog: React.FC<Props> = ({ 
    open, 
    onClose, 
    group, 
    people, 
    currentPersonIds, 
    onSave, 
    otherESPersonIds,
    constraints = [],
    rangeStartISO,
    rangeEndISO,
    guardAssignments,
    bwAssignments,
    kitchenAssignments,
    escortAssignments,
    rasarAssignments,
    escort400Assignments,
}) => {
    const [selected, setSelected] = useState<number[]>(currentPersonIds);
    const [totalPeople, setTotalPeople] = useState(group.totalPeople);
    const { t } = useI18n();
    const [search, setSearch] = useState('');

    useEffect(() => {
        const safeSelection = currentPersonIds.filter(id => {
            const person = people.find(p => p.id === id);
            return person && !person.limitedAbility;
        });
        setSelected(safeSelection);
        setTotalPeople(group.totalPeople);
        setSearch('');
    }, [currentPersonIds, group.totalPeople, open, people]);

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
        const safeSelection = selected.filter(id => {
            const person = people.find(p => p.id === id);
            return person && !person.limitedAbility;
        });
        onSave(safeSelection, totalPeople);
        onClose();
    };

    // Filter out people already in the other ES group or marked as limited ability
    const availablePeople = useMemo(
        () => people.filter(p => !p.limitedAbility && !otherESPersonIds.includes(p.id)),
        [people, otherESPersonIds]
    );

    const limitedAbilityCount = useMemo(
        () => people.filter(p => p.limitedAbility).length,
        [people]
    );

    const constraintsByPerson = useMemo(() => {
        const map = new Map<number, Constraint[]>();
        constraints.forEach(c => {
            const arr = map.get(c.personId) || [];
            arr.push(c);
            map.set(c.personId, arr);
        });
        return map;
    }, [constraints]);

    // Check which people have rasar assignments (ES members shouldn't have rasar)
    const rasarByPerson = useMemo(() => {
        const map = new Map<number, RasarAssignment[]>();
        rasarAssignments.forEach(r => {
            const arr = map.get(r.personId) || [];
            arr.push(r);
            map.set(r.personId, arr);
        });
        return map;
    }, [rasarAssignments]);

    // Check which people have escort400 assignments (ES members shouldn't have escort400)
    const escort400ByPerson = useMemo(() => {
        const map = new Map<number, Escort400Assignment[]>();
        escort400Assignments.forEach(e => {
            const arr = map.get(e.personId) || [];
            arr.push(e);
            map.set(e.personId, arr);
        });
        return map;
    }, [escort400Assignments]);

    const dutyCountsByPerson = useMemo(
        () =>
            buildDutyCountsByPerson({
                people,
                rangeStartISO,
                rangeEndISO,
                guardAssignments,
                bwAssignments,
                kitchenAssignments,
                escortAssignments,
                rasarAssignments,
                escort400Assignments,
            }),
        [people, rangeStartISO, rangeEndISO, guardAssignments, bwAssignments, kitchenAssignments, escortAssignments, rasarAssignments, escort400Assignments]
    );

    const tooltipForPerson = (person: Person) => {
        const c = dutyCountsByPerson.get(person.id);
        const lines: Array<{ label: string; count: number }> = [];
        if (c?.guards) lines.push({ label: t('Guards'), count: c.guards });
        if (c?.bw) lines.push({ label: t('BW Assignments'), count: c.bw });
        if (c?.kitchen) lines.push({ label: t('Kitchen'), count: c.kitchen });
        if (c?.escort) lines.push({ label: t('Escort'), count: c.escort });
        if (c?.rasar) lines.push({ label: t('Rasar'), count: c.rasar });
        if (c?.escort400) lines.push({ label: t('Contractor escort - 400'), count: c.escort400 });

        return (
            <Box sx={{ whiteSpace: 'pre-line' }}>
                <Typography variant="subtitle2">{person.name}</Typography>
                <Box sx={{ height: 8 }} />
                {lines.length === 0 ? (
                    <Typography variant="body2">{t('No duties in range')}</Typography>
                ) : (
                    lines.map(l => (
                        <Typography key={l.label} variant="body2">
                            {l.label}: {l.count}
                        </Typography>
                    ))
                )}
            </Box>
        );
    };

    const filteredPeople = availablePeople.filter(person => {
        if (!search.trim()) return true;
        const query = search.toLowerCase();
        return (
            person.name.toLowerCase().includes(query) ||
            person.gender.toLowerCase().includes(query)
        );
    });

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
                {limitedAbilityCount > 0 && (
                    <Alert severity="info" sx={{ mb: 2 }}>
                        {t('Limited ability note')}
                    </Alert>
                )}
                <TextField
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={t('Search people')}
                    fullWidth
                    size="small"
                    sx={{ mb: 2 }}
                />
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 300, overflow: 'auto' }}>
                    {filteredPeople.map(person => {
                        const isSelected = selected.includes(person.id);
                        const isDisabled = !isSelected && selected.length >= totalPeople;
                        const personConstraints = constraintsByPerson.get(person.id) || [];
                        const personRasar = rasarByPerson.get(person.id) || [];
                        const personEscort400 = escort400ByPerson.get(person.id) || [];
                        const hasRasarConflict = personRasar.length > 0;
                        const hasEscort400Conflict = personEscort400.length > 0;

                        return (
                            <Box key={person.id}>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={isSelected}
                                            onChange={() => handleToggle(person.id)}
                                            disabled={isDisabled}
                                        />
                                    }
                                    label={
                                        <Tooltip title={tooltipForPerson(person)} placement="top" arrow>
                                            <span style={{ color: (hasRasarConflict || hasEscort400Conflict) ? '#ed6c02' : undefined }}>
                                                {person.name} ({person.gender})
                                                {(hasRasarConflict || hasEscort400Conflict) && ' ⚠️'}
                                            </span>
                                        </Tooltip>
                                    }
                                    sx={{ opacity: isDisabled ? 0.5 : 1 }}
                                />
                                {personConstraints.map(c => (
                                    <Typography key={c.id} variant="caption" color="error" sx={{ display: 'block', ml: 4 }}>
                                        ⚠️ {t('Constraint conflict')}: {c.title}
                                    </Typography>
                                ))}
                                {hasRasarConflict && (
                                    <Typography variant="caption" color="warning.main" sx={{ display: 'block', ml: 4 }}>
                                        ⚠️ {t('Has rasar duty')} ({personRasar.length})
                                    </Typography>
                                )}
                                {hasEscort400Conflict && (
                                    <Typography variant="caption" color="warning.main" sx={{ display: 'block', ml: 4 }}>
                                        ⚠️ {t('Has escort 400 duty')} ({personEscort400.length})
                                    </Typography>
                                )}
                            </Box>
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

