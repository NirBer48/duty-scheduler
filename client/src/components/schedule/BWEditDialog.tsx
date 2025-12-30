import React, { useEffect, useMemo, useState } from "react";
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
    Chip,
    Tooltip
} from "@mui/material";
import { useI18n } from "../../util/i18n";
import { Assignment, BWAssignment, Escort400Assignment, EscortAssignment, KitchenAssignment, Person, RasarAssignment, ESGroup, ESGroupAssignment } from "../../types";
import { BW_SLOT_DEFINITIONS, BW_REQUIRED_PER_SLOT, getShiftTimeWindow, getBwSlotRangeMinutes, hasTimeOverlap } from "./utils";
import { buildDutyCountsByPerson } from "./dutyCounts";

interface Props {
    open: boolean;
    onClose: () => void;
    day: string;
    slotId: string;
    people: Person[];
    currentPersonIds: number[];
    onSave: (personIds: number[]) => void;
    assignments: Assignment[];
    esAssignments: ESGroupAssignment[];
    esGroups: ESGroup[];
    bwAssignments: BWAssignment[];
    rangeStartISO: string;
    rangeEndISO: string;
    kitchenAssignments: KitchenAssignment[];
    escortAssignments: EscortAssignment[];
    rasarAssignments: RasarAssignment[];
    escort400Assignments: Escort400Assignment[];
}

export const BWEditDialog: React.FC<Props> = ({
    open,
    onClose,
    day,
    slotId,
    people,
    currentPersonIds,
    onSave,
    assignments,
    esAssignments,
    esGroups,
    bwAssignments,
    rangeStartISO,
    rangeEndISO,
    kitchenAssignments,
    escortAssignments,
    rasarAssignments,
    escort400Assignments,
}) => {
    const slot = BW_SLOT_DEFINITIONS.find(s => s.id === slotId);
    const { t, lang } = useI18n();
    const [selected, setSelected] = useState<number[]>(currentPersonIds);
    const [search, setSearch] = useState('');

    useEffect(() => {
        setSelected(currentPersonIds);
        setSearch('');
    }, [currentPersonIds, slotId, day, open]);

    if (!slot) {
        return null;
    }

    const slotRange = getBwSlotRangeMinutes(slot);
    const assignmentsForDay = useMemo(
        () => assignments.filter(a => a.day === day),
        [assignments, day]
    );

    const personToESGroupId = useMemo(() => {
        const map = new Map<number, string>();
        esAssignments.forEach(group => {
            group.personIds.forEach(pid => map.set(pid, group.groupId));
        });
        return map;
    }, [esAssignments]);

    const personToESGroup = useMemo(() => {
        const map = new Map<number, ESGroup>();
        esAssignments.forEach(es => {
            const group = esGroups.find(g => g.id === es.groupId);
            if (group) {
                es.personIds.forEach(pid => map.set(pid, group));
            }
        });
        return map;
    }, [esAssignments, esGroups]);

    const dutyCountsByPerson = useMemo(
        () =>
            buildDutyCountsByPerson({
                people,
                rangeStartISO,
                rangeEndISO,
                guardAssignments: assignments,
                bwAssignments,
                kitchenAssignments,
                escortAssignments,
                rasarAssignments,
                escort400Assignments,
            }),
        [people, rangeStartISO, rangeEndISO, assignments, bwAssignments, kitchenAssignments, escortAssignments, rasarAssignments, escort400Assignments]
    );

    const tooltipForPerson = (person: Person) => {
        const c = dutyCountsByPerson.get(person.id);
        const lines: Array<{ label: string; count: number }> = [];
        if (c?.guards) lines.push({ label: t('Guards'), count: c.guards });
        if (c?.bw) lines.push({ label: t('BW Assignments'), count: c.bw });
        if (c?.kitchen) lines.push({ label: t('Kitchen'), count: c.kitchen });
        if (c?.escort) lines.push({ label: 'Escort', count: c.escort });
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

    const hasShiftConflict = (personId: number) => {
        const conflicts = assignmentsForDay.filter(a => a.personId === personId);
        for (const assignment of conflicts) {
            const shiftWindow = getShiftTimeWindow(assignment.shiftLabel);
            if (!shiftWindow) continue;
            if (hasTimeOverlap(slotRange.start, slotRange.end, shiftWindow.start, shiftWindow.end)) {
                return true;
            }
        }
        return false;
    };

    const violatesESRule = (personId: number, nextSelection: number[]) => {
        const groupId = personToESGroupId.get(personId);
        if (!groupId) return false;
        for (const selectedId of nextSelection) {
            if (selectedId === personId) continue;
            if (personToESGroupId.get(selectedId) === groupId) {
                return true;
            }
        }
        return false;
    };

    const hasGroupShiftConflict = (personId: number): string | null => {
        const groupId = personToESGroupId.get(personId);
        if (!groupId) return null;
        const slotRange = getBwSlotRangeMinutes(slot);
        const conflict = assignments.some(assignment => {
            if (assignment.personId === personId) return false;
            if (assignment.day !== day) return false;
            const otherGroup = personToESGroupId.get(assignment.personId);
            if (otherGroup !== groupId) return false;
            const window = getShiftTimeWindow(assignment.shiftLabel);
            if (!window) return false;
            return hasTimeOverlap(slotRange.start, slotRange.end, window.start, window.end);
        });
        return conflict ? t('ES overlap with shift') : null;
    };

    // Count violations for sorting
    const getViolationCount = (personId: number): number => {
        let count = 0;
        if (hasShiftConflict(personId)) count++;
        const wouldSelect = selected.includes(personId) ? selected : [...selected, personId];
        if (violatesESRule(personId, wouldSelect)) count++;
        if (hasGroupShiftConflict(personId)) count++;
        return count;
    };

    const togglePerson = (personId: number) => {
        setSelected(prev => {
            if (prev.includes(personId)) {
                return prev.filter(id => id !== personId);
            }
            if (prev.length >= BW_REQUIRED_PER_SLOT) return prev;
            return [...prev, personId];
        });
    };

    const filteredPeople = people
        .filter(person => {
            if (!search.trim()) return true;
            const query = search.toLowerCase();
            return (
                person.name.toLowerCase().includes(query) ||
                person.gender.toLowerCase().includes(query)
            );
        })
        .sort((a, b) => getViolationCount(a.id) - getViolationCount(b.id));

    const labelForSlot = lang === 'he'
        ? `עב"ס ${slot.label}`
        : `BW ${slot.label}`;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                {t('Edit BW Slot')}: {day} | {labelForSlot}
            </DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                    {t('Required per slot')}: {BW_REQUIRED_PER_SLOT}
                </Typography>
                <Typography
                    variant="body2"
                    color={selected.length === BW_REQUIRED_PER_SLOT ? "success.main" : "warning.main"}
                    sx={{ mb: 2 }}
                >
                    {t('Selected')}: {selected.length} / {BW_REQUIRED_PER_SLOT}
                </Typography>
                <TextField
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('Search people')}
                    fullWidth
                    size="small"
                    sx={{ mb: 2 }}
                />
                <Box sx={{ maxHeight: 320, overflowY: 'auto', pr: 1 }}>
                    {filteredPeople.map(person => {
                        const isSelected = selected.includes(person.id);
                        const wouldSelect = isSelected ? selected : [...selected, person.id];
                        const shiftConflict = hasShiftConflict(person.id);
                        const esConflict = violatesESRule(person.id, wouldSelect);
                        const groupShiftConflict = hasGroupShiftConflict(person.id);
                        // Only disable if max selected reached (not for violations - just show warnings)
                        const disabled = !isSelected && selected.length >= BW_REQUIRED_PER_SLOT;
                        const esGroup = personToESGroup.get(person.id);

                        return (
                            <Box key={person.id} sx={{ mb: 1 }}>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={isSelected}
                                            onChange={() => togglePerson(person.id)}
                                            disabled={disabled}
                                        />
                                    }
                                    label={
                                        <Tooltip title={tooltipForPerson(person)} placement="right" arrow>
                                            <span>
                                                {person.name} ({person.gender})
                                                {person.sameGenderPreference && ' 👫'}
                                                {esGroup && <Chip label={esGroup.name} size="small" sx={{ ml: 1 }} color="info" />}
                                            </span>
                                        </Tooltip>
                                    }
                                    sx={{ opacity: disabled ? 0.5 : 1 }}
                                />
                                {shiftConflict && (
                                    <Typography variant="caption" color="error" sx={{ display: 'block', ml: 4 }}>
                                        ⚠️ {t('Overlapping shift in this timeframe')}
                                    </Typography>
                                )}
                                {esConflict && (
                                    <Typography variant="caption" color="error" sx={{ display: 'block', ml: 4 }}>
                                        ⚠️ {t('ES limit reached for this slot')}
                                    </Typography>
                                )}
                                {groupShiftConflict && (
                                    <Typography variant="caption" color="error" sx={{ display: 'block', ml: 4 }}>
                                        ⚠️ {groupShiftConflict}
                                    </Typography>
                                )}
                            </Box>
                        );
                    })}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('Cancel')}</Button>
                <Button onClick={() => { onSave(selected); onClose(); }} variant="contained">
                    {t('Save')}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

