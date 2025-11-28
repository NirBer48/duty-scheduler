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
    Chip
} from "@mui/material";
import { useI18n } from "../../util/i18n";
import { Person, Post, Assignment, ESGroup, ESGroupAssignment } from "../../types";
import { ShiftSlot, getShiftIndex } from "./utils";

interface Props {
    open: boolean;
    onClose: () => void;
    post: Post;
    day: string;
    shiftLabel: string;
    people: Person[];
    currentPersonIds: number[];
    requiredCount: number;
    onSave: (personIds: number[]) => void;
    allAssignments: Assignment[];
    allShifts: ShiftSlot[];
    esAssignments: ESGroupAssignment[];
    esGroups: ESGroup[];
}

export function CellEditDialog({ 
    open, 
    onClose, 
    post, 
    day, 
    shiftLabel, 
    people, 
    currentPersonIds, 
    requiredCount, 
    onSave, 
    allAssignments, 
    allShifts, 
    esAssignments, 
    esGroups 
}: Props) {
    const [selected, setSelected] = useState<number[]>(currentPersonIds);
    const { t } = useI18n();
    const maxAllowed = requiredCount;

    // Build a map of personId -> ES group
    const personToESGroup = new Map<number, ESGroup>();
    esAssignments.forEach(es => {
        const group = esGroups.find(g => g.id === es.groupId);
        if (group) {
            es.personIds.forEach(pid => personToESGroup.set(pid, group));
        }
    });

    useEffect(() => {
        setSelected(currentPersonIds);
    }, [currentPersonIds, open]);

    const hasRestViolation = (personId: number): string | null => {
        const currentShiftIdx = getShiftIndex(day, shiftLabel, allShifts);
        
        // Check shifts within 2 positions (8 hours) before and after
        const offsets = [-2, -1, 1, 2];
        for (const offset of offsets) {
            const idx = currentShiftIdx + offset;
            if (idx >= 0 && idx < allShifts.length) {
                const nearbyShift = allShifts[idx];
                const hasAssignment = allAssignments.some(a =>
                    a.personId === personId &&
                    a.day === nearbyShift.day &&
                    a.shiftLabel === nearbyShift.label &&
                    !(a.day === day && a.shiftLabel === shiftLabel && a.postId === post.id)
                );
                if (hasAssignment) {
                    return `${t('Rest violation')}: ${nearbyShift.day} ${nearbyShift.label}`;
                }
            }
        }

        return null;
    };

    const hasESViolation = (personId: number): string | null => {
        const personGroup = personToESGroup.get(personId);
        if (!personGroup) return null;

        const esGroupMembers = esAssignments.find(es => es.groupId === personGroup.id)?.personIds || [];

        for (const assignment of allAssignments) {
            if (assignment.day === day && assignment.shiftLabel === shiftLabel) {
                if (assignment.postId === post.id) continue;
                if (esGroupMembers.includes(assignment.personId) && assignment.personId !== personId) {
                    const otherPerson = people.find(p => p.id === assignment.personId);
                    return `${personGroup.name}: ${otherPerson?.name || assignment.personId} ${t('already in shift')}`;
                }
            }
        }

        for (const selectedId of selected) {
            if (selectedId !== personId && esGroupMembers.includes(selectedId)) {
                const otherPerson = people.find(p => p.id === selectedId);
                return `${personGroup.name}: ${otherPerson?.name || selectedId} ${t('already selected')}`;
            }
        }

        return null;
    };

    const checkGenderCompatibility = (personId: number): string | null => {
        const person = people.find(p => p.id === personId);
        if (!person) return null;

        if (person.sameGenderPreference) {
            const otherSelected = selected.filter(id => id !== personId);
            for (const otherId of otherSelected) {
                const other = people.find(p => p.id === otherId);
                if (other && other.gender !== person.gender) {
                    return t('Requires same gender partner');
                }
            }
        }

        for (const selectedId of selected) {
            if (selectedId === personId) continue;
            const selectedPerson = people.find(p => p.id === selectedId);
            if (selectedPerson?.sameGenderPreference && selectedPerson.gender !== person?.gender) {
                return `${selectedPerson.name} ${t('requires same gender')}`;
            }
        }

        return null;
    };

    const handleToggle = (personId: number) => {
        setSelected(prev => {
            if (prev.includes(personId)) {
                return prev.filter(id => id !== personId);
            } else {
                if (prev.length < maxAllowed) {
                    return [...prev, personId];
                }
                return prev;
            }
        });
    };

    const handleSave = () => {
        onSave(selected);
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                {t('Edit Shift')}: {post.name} - {day} {shiftLabel}
            </DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                    {t('Required per shift')}: {requiredCount}
                </Typography>
                <Typography variant="body2" color={selected.length === maxAllowed ? "success.main" : "warning.main"} sx={{ mb: 2 }}>
                    {t('Selected')}: {selected.length} / {maxAllowed}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {people.map(person => {
                        const isSelected = selected.includes(person.id);
                        const restViolation = hasRestViolation(person.id);
                        const esViolation = !isSelected ? hasESViolation(person.id) : null;
                        const genderIssue = !isSelected ? checkGenderCompatibility(person.id) : null;
                        const isDisabled = !isSelected && selected.length >= maxAllowed;
                        const esGroup = personToESGroup.get(person.id);

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
                                        <span>
                                            {person.name} ({person.gender})
                                            {person.sameGenderPreference && ' 👫'}
                                            {esGroup && <Chip label={esGroup.name} size="small" sx={{ ml: 1 }} color="info" />}
                                        </span>
                                    }
                                    sx={{ opacity: isDisabled ? 0.5 : 1 }}
                                />
                                {isSelected && restViolation && (
                                    <Typography variant="caption" color="error" sx={{ ml: 4, display: 'block' }}>
                                        ⚠️ {restViolation}
                                    </Typography>
                                )}
                                {!isSelected && esViolation && (
                                    <Typography variant="caption" color="error" sx={{ ml: 4, display: 'block' }}>
                                        ⚠️ {esViolation}
                                    </Typography>
                                )}
                                {!isSelected && genderIssue && (
                                    <Typography variant="caption" color="warning.main" sx={{ ml: 4, display: 'block' }}>
                                        ⚠️ {genderIssue}
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

