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
    Chip,
    TextField
} from "@mui/material";
import Tooltip from "@mui/material/Tooltip";
import { useI18n } from "../../util/i18n";
import { Person, Post, Assignment, ESGroup, ESGroupAssignment, BWAssignment, Constraint, KitchenAssignment, EscortAssignment, RasarAssignment, Escort400Assignment } from "../../types";
import { ShiftSlot, getShiftIndex, BW_SLOT_DEFINITIONS, getShiftTimeWindow, getBwSlotRangeMinutes, hasTimeOverlap, isNightShift, isStandingExemptPost, isAsthmaAllowedPost } from "./utils";
import dayjs from "dayjs";
import { buildDutyCountsByPerson } from "./dutyCounts";

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
    bwAssignments: BWAssignment[];
    constraints?: Constraint[];
    rangeStartISO: string;
    rangeEndISO: string;
    kitchenAssignments: KitchenAssignment[];
    escortAssignments: EscortAssignment[];
    rasarAssignments: RasarAssignment[];
    escort400Assignments: Escort400Assignment[];
}

export const CellEditDialog: React.FC<Props> = ({
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
    esGroups,
    bwAssignments,
    constraints = [],
    rangeStartISO,
    rangeEndISO,
    kitchenAssignments,
    escortAssignments,
    rasarAssignments,
    escort400Assignments,
}) => {
    const [selected, setSelected] = useState<number[]>(currentPersonIds);
    const [search, setSearch] = useState('');
    const { t } = useI18n();
    const maxAllowed = requiredCount;

    const dutyCountsByPerson = React.useMemo(
        () =>
            buildDutyCountsByPerson({
                people,
                rangeStartISO,
                rangeEndISO,
                guardAssignments: allAssignments,
                bwAssignments,
                kitchenAssignments,
                escortAssignments,
                rasarAssignments,
                escort400Assignments,
            }),
        [people, rangeStartISO, rangeEndISO, allAssignments, bwAssignments, kitchenAssignments, escortAssignments, rasarAssignments, escort400Assignments]
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
        setSearch('');
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

    const hasSameShiftConflict = (personId: number): string | null => {
        const conflict = allAssignments.some(
            a =>
                a.personId === personId &&
                a.day === day &&
                a.shiftLabel === shiftLabel &&
                a.postId !== post.id
        );
        return conflict ? t('already in shift') : null;
    };

    const hasStandingExemptionConflict = (personId: number): string | null => {
        const person = people.find(p => p.id === personId);
        if (!person) return null;
        if (!person.standingExemption) return null;
        if (!isStandingExemptPost(post.name)) return null;
        return t('Standing exemption - cannot work this post');
    };

    const hasNightGuardExemptionConflict = (personId: number): string | null => {
        const person = people.find(p => p.id === personId);
        if (!person) return null;
        if (!person.nightGuardExemption) return null;
        if (!isNightShift(shiftLabel)) return null;
        return t('Night guard exemption - cannot work night shifts');
    };

    const hasAsthmaExemptionConflict = (personId: number): string | null => {
        const person = people.find(p => p.id === personId);
        if (!person) return null;
        if (!person.asthmaExemption) return null;
        if (isAsthmaAllowedPost(post.name)) return null;
        return t('Asthma exemption - can only work lookout post');
    };

    const hasConstraintConflict = (personId: number): string | null => {
        const cList = constraints.filter(c => c.personId === personId);
        if (cList.length === 0) return null;
        const window = getShiftTimeWindow(shiftLabel);
        if (!window) return null;
        const shiftStart = dayjs(`${day}T00:00`).add(window.start, 'minute');
        let shiftEnd = dayjs(`${day}T00:00`).add(window.end, 'minute');
        if (!shiftEnd.isAfter(shiftStart)) shiftEnd = shiftEnd.add(1, 'day');

        for (const c of cList) {
            const cStart = dayjs(c.startISO);
            const cEnd = dayjs(c.endISO);
            if (shiftStart.isBefore(cEnd) && cStart.isBefore(shiftEnd)) {
                return `${t('Constraint conflict')}: ${c.title}`;
            }
        }
        return null;
    };

    const hasBWConflict = (personId: number): string | null => {
        const shiftWindow = getShiftTimeWindow(shiftLabel);
        if (!shiftWindow) return null;

        // Check if person is assigned to a BW slot on the same day that overlaps with this shift
        for (const bwAssignment of bwAssignments) {
            if (bwAssignment.personId !== personId) continue;
            if (bwAssignment.day !== day) continue;

            const slot = BW_SLOT_DEFINITIONS.find(s => s.id === bwAssignment.slotId);
            if (!slot) continue;

            const bwRange = getBwSlotRangeMinutes(slot);
            if (hasTimeOverlap(shiftWindow.start, shiftWindow.end, bwRange.start, bwRange.end)) {
                return `${t('BW conflict')}: ${slot.label}`;
            }
        }
        return null;
    };

    // Check if an ES member has another ES group member in a BW slot that overlaps with this shift
    const hasESBWConflict = (personId: number): string | null => {
        const personGroup = personToESGroup.get(personId);
        if (!personGroup) return null;

        const shiftWindow = getShiftTimeWindow(shiftLabel);
        if (!shiftWindow) return null;

        const esGroupMembers = esAssignments.find(es => es.groupId === personGroup.id)?.personIds || [];

        // Check if another ES group member is in a BW slot that overlaps with this shift
        for (const bwAssignment of bwAssignments) {
            if (bwAssignment.day !== day) continue;
            if (bwAssignment.personId === personId) continue; // Skip self
            if (!esGroupMembers.includes(bwAssignment.personId)) continue; // Only check same ES group

            const slot = BW_SLOT_DEFINITIONS.find(s => s.id === bwAssignment.slotId);
            if (!slot) continue;

            const bwRange = getBwSlotRangeMinutes(slot);
            if (hasTimeOverlap(shiftWindow.start, shiftWindow.end, bwRange.start, bwRange.end)) {
                const otherPerson = people.find(p => p.id === bwAssignment.personId);
                return `${personGroup.name}: ${otherPerson?.name || bwAssignment.personId} ${t('in BW at this time')}`;
            }
        }
        return null;
    };

    const checkGenderCompatibility = (personId: number): string | null => {
        const person = people.find(p => p.id === personId);

        if (!person) return null;
        if (!isNightShift(shiftLabel)) return null;

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

    // Count violations for sorting
    const getViolationCount = (personId: number): number => {
        let count = 0;
        if (hasRestViolation(personId)) count++;
        if (hasESViolation(personId)) count++;
        if (hasSameShiftConflict(personId)) count++;
        if (hasBWConflict(personId)) count++;
        if (hasESBWConflict(personId)) count++;
        if (hasStandingExemptionConflict(personId)) count++;
        if (hasNightGuardExemptionConflict(personId)) count++;
        if (hasAsthmaExemptionConflict(personId)) count++;
        if (hasConstraintConflict(personId)) count++;
        const person = people.find(p => p.id === personId);
        const assignedCountWithPerson = (isSelected => {
            const base = selected.length;
            if (isSelected) return base;
            if (base >= maxAllowed) return base; // cannot add more
            return base + 1;
        })(selected.includes(personId));
        if (person?.duelGuard && assignedCountWithPerson < Math.max(2, requiredCount)) {
            count++;
        }
        if (checkGenderCompatibility(personId)) count++;
        return count;
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
                <TextField
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('Search people')}
                    fullWidth
                    size="small"
                    sx={{ mb: 2 }}
                />
                <Box sx={{ maxHeight: 300, overflowY: 'auto', pr: 1 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {people
                            .filter(person => {
                                if (!search.trim()) return true;
                                const query = search.toLowerCase();
                                return person.name.toLowerCase().includes(query) || person.gender.toLowerCase().includes(query);
                            })
                            .sort((a, b) => getViolationCount(a.id) - getViolationCount(b.id))
                            .map(person => {
                                const isSelected = selected.includes(person.id);
                                const restViolation = hasRestViolation(person.id);
                                const esViolation = hasESViolation(person.id);
                                const genderIssue = checkGenderCompatibility(person.id);
                                const shiftConflict = hasSameShiftConflict(person.id);
                                const bwConflict = hasBWConflict(person.id);
                                const esBwConflict = hasESBWConflict(person.id);
                                const standingConflict = hasStandingExemptionConflict(person.id);
                                const nightGuardConflict = hasNightGuardExemptionConflict(person.id);
                                const asthmaConflict = hasAsthmaExemptionConflict(person.id);
                                const constraintConflict = hasConstraintConflict(person.id);
                                const assignedCountWithPerson = isSelected ? selected.length : selected.length + 1;
                                const duelGuardConflict = person.duelGuard && assignedCountWithPerson < Math.max(2, requiredCount);
                                const isDisabled = (!isSelected && selected.length >= maxAllowed);
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
                                                <Tooltip title={tooltipForPerson(person)} placement="top" arrow>
                                                    <span>
                                                        {person.name} ({person.gender})
                                                        {person.sameGenderPreference && ' 👫'}
                                                        {esGroup && <Chip label={esGroup.name} size="small" sx={{ ml: 1 }} color="info" />}
                                                    </span>
                                                </Tooltip>
                                            }
                                            sx={{ opacity: isDisabled ? 0.5 : 1 }}
                                        />
                                        {restViolation && (
                                            <Typography variant="caption" color="error" sx={{ ml: 4, display: 'block' }}>
                                                ⚠️ {restViolation}
                                            </Typography>
                                        )}
                                        {esViolation && (
                                            <Typography variant="caption" color="error" sx={{ ml: 4, display: 'block' }}>
                                                ⚠️ {esViolation}
                                            </Typography>
                                        )}
                                        {shiftConflict && (
                                            <Typography variant="caption" color="error" sx={{ ml: 4, display: 'block' }}>
                                                ⚠️ {shiftConflict}
                                            </Typography>
                                        )}
                                        {bwConflict && (
                                            <Typography variant="caption" color="error" sx={{ ml: 4, display: 'block' }}>
                                                ⚠️ {bwConflict}
                                            </Typography>
                                        )}
                                        {standingConflict && (
                                            <Typography variant="caption" color="error" sx={{ ml: 4, display: 'block' }}>
                                                ⚠️ {standingConflict}
                                            </Typography>
                                        )}
                                        {nightGuardConflict && (
                                            <Typography variant="caption" color="error" sx={{ ml: 4, display: 'block' }}>
                                                ⚠️ {nightGuardConflict}
                                            </Typography>
                                        )}
                                        {asthmaConflict && (
                                            <Typography variant="caption" color="error" sx={{ ml: 4, display: 'block' }}>
                                                ⚠️ {asthmaConflict}
                                            </Typography>
                                        )}
                                        {constraintConflict && (
                                            <Typography variant="caption" color="error" sx={{ ml: 4, display: 'block' }}>
                                                ⚠️ {constraintConflict}
                                            </Typography>
                                        )}
                                        {duelGuardConflict && (
                                            <Typography variant="caption" color="error" sx={{ ml: 4, display: 'block' }}>
                                                ⚠️ {t('Duel guard - cannot be alone in this shift')}
                                            </Typography>
                                        )}
                                        {esBwConflict && (
                                            <Typography variant="caption" color="error" sx={{ ml: 4, display: 'block' }}>
                                                ⚠️ {esBwConflict}
                                            </Typography>
                                        )}
                                        {genderIssue && (
                                            <Typography variant="caption" color="warning.main" sx={{ ml: 4, display: 'block' }}>
                                                ⚠️ {genderIssue}
                                            </Typography>
                                        )}
                                    </Box>
                                );
                            })}
                    </Box>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('Cancel')}</Button>
                <Button onClick={handleSave} variant="contained">{t('Save')}</Button>
            </DialogActions>
        </Dialog>
    );
}

