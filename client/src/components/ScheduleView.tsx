import React, { useState, useEffect } from "react";
import dayjs from "dayjs";
import { Assignment, Person, Post, ShiftOverride, ESGroup, ESGroupAssignment, ESGroupId, BWAssignment, Constraint } from "../types";
import { useI18n } from "../util/i18n";
import { Box, Typography, Alert, Button, IconButton, Chip, CircularProgress } from "@mui/material";
import SettingsIcon from '@mui/icons-material/Settings';
import EditIcon from '@mui/icons-material/Edit';
import { saveAllSchedules } from "../api";
import { 
    CellEditDialog, 
    ESEditDialog, 
    ShiftSettingsDialog, 
    BWEditDialog,
    exportToExcel,
    getShiftsForPeriod,
    getPersonIds,
    getCellKey,
    getShiftIndex,
    BW_SLOT_DEFINITIONS,
    BW_REQUIRED_PER_SLOT,
    getBwSlotKey,
    getShiftTimeWindow,
    hasTimeOverlap,
    getBwSlotRangeMinutes,
    getBwDaysForRange,
    isNightShift,
    isStandingExemptPost
} from "./schedule";

interface Props {
    posts: Post[];
    assignments: Assignment[];
    people: Person[];
    start: string;
    end: string;
    isGenerating?: boolean;
    onAssignmentsChange?: (assignments: Assignment[]) => void;
    shiftOverrides?: ShiftOverride[];
    onShiftOverridesChange?: (overrides: ShiftOverride[]) => void;
    esAssignments?: ESGroupAssignment[];
    onESAssignmentsChange?: (esAssignments: ESGroupAssignment[]) => void;
    esGroups?: ESGroup[];
    onESGroupsChange?: (esGroups: ESGroup[]) => void;
    bwAssignments?: BWAssignment[];
    onBWAssignmentsChange?: (assignments: BWAssignment[]) => void;
    constraints?: Constraint[];
}

const ScheduleCalendar: React.FC<Props> = ({ 
    assignments: initialAssignments, 
    posts, 
    people, 
    start, 
    end, 
    onAssignmentsChange,
    shiftOverrides: externalOverrides = [],
    onShiftOverridesChange,
    esAssignments: externalESAssignments,
    onESAssignmentsChange,
    esGroups: externalESGroups,
    onESGroupsChange,
    bwAssignments: externalBWAssignments = [],
    onBWAssignmentsChange,
    isGenerating = false,
    constraints = [],
}) => {
    const shifts = getShiftsForPeriod(start, end);
    const { t, lang } = useI18n();

    // ES Groups state - use external if provided
    const [localESGroups, setLocalESGroups] = useState<ESGroup[]>([
        { id: 'es1', name: lang === 'he' ? "כ\"כ א'" : "ES 1", totalPeople: 5, activePerShift: 1 },
        { id: 'es2', name: lang === 'he' ? "כ\"כ ב'" : "ES 2", totalPeople: 5, activePerShift: 1 },
    ]);
    
    const esGroups = onESGroupsChange && externalESGroups ? externalESGroups : localESGroups;

    useEffect(() => {
        const updateNames = (groups: ESGroup[]) => groups.map(g => ({
            ...g,
            name: g.id === 'es1'
                ? (lang === 'he' ? "כ\"כ א'" : "ES 1")
                : (lang === 'he' ? "כ\"כ ב'" : "ES 2")
        }));
        
        if (onESGroupsChange && externalESGroups) {
            onESGroupsChange(updateNames(externalESGroups));
        } else {
            setLocalESGroups(prev => updateNames(prev));
        }
    }, [lang]);

    // Local state
    const [localAssignments, setLocalAssignments] = useState<Assignment[]>(initialAssignments);
    const [localShiftOverrides, setLocalShiftOverrides] = useState<ShiftOverride[]>(externalOverrides);
    const shiftOverrides = onShiftOverridesChange ? externalOverrides : localShiftOverrides;
    
    const [localESAssignments, setLocalESAssignments] = useState<ESGroupAssignment[]>([
        { groupId: 'es1', personIds: [] },
        { groupId: 'es2', personIds: [] },
    ]);
    
    // Use external ES assignments if provided, otherwise use local state
    const esAssignments = onESAssignmentsChange && externalESAssignments ? externalESAssignments : localESAssignments;

    const [localBWAssignments, setLocalBWAssignments] = useState<BWAssignment[]>(externalBWAssignments);
    const bwAssignments = onBWAssignmentsChange ? externalBWAssignments : localBWAssignments;
    const setBWAssignments = onBWAssignmentsChange || setLocalBWAssignments;
    const bwDays = getBwDaysForRange(start, end, bwAssignments);
    
    const [hasChanges, setHasChanges] = useState(false);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [invalidCells, setInvalidCells] = useState<Set<string>>(new Set());
    const [invalidESGroups, setInvalidESGroups] = useState<Set<string>>(new Set());
    const [invalidBWSlots, setInvalidBWSlots] = useState<Set<string>>(new Set());

    // Dialog states
    const [editDialog, setEditDialog] = useState<{
        open: boolean;
        post: Post | null;
        day: string;
        shiftLabel: string;
        currentPersonIds: number[];
    }>({ open: false, post: null, day: '', shiftLabel: '', currentPersonIds: [] });

    const [settingsDialog, setSettingsDialog] = useState<{
        open: boolean;
        post: Post | null;
        day: string;
        shiftLabel: string;
    }>({ open: false, post: null, day: '', shiftLabel: '' });

    const [esEditDialog, setESEditDialog] = useState<{
        open: boolean;
        group: ESGroup | null;
    }>({ open: false, group: null });

    const [bwEditDialog, setBWEditDialog] = useState<{
        open: boolean;
        day: string;
        slotId: string;
    }>({ open: false, day: '', slotId: '' });

    // Sync effects - only reset on initial assignments change (not BW changes)
    useEffect(() => {
        setLocalAssignments(initialAssignments);
        setHasChanges(false);
        setValidationErrors([]);
        setInvalidCells(new Set());
        setInvalidESGroups(new Set());
        setInvalidBWSlots(new Set());
    }, [initialAssignments]);

    // Sync BW assignments from external source (without resetting hasChanges)
    useEffect(() => {
        if (!onBWAssignmentsChange) {
            setLocalBWAssignments(externalBWAssignments);
        }
    }, [externalBWAssignments, onBWAssignmentsChange]);

    useEffect(() => {
        if (!onShiftOverridesChange) {
            setLocalShiftOverrides(externalOverrides);
        }
    }, [externalOverrides, onShiftOverridesChange]);

    // Helper functions
    const getRequiredCount = (postId: number, day: string, shiftLabel: string): number => {
        const override = shiftOverrides.find(o =>
            o.postId === postId && o.day === day && o.shiftLabel === shiftLabel
        );
        if (override) return override.requiredPerShift;
        const post = posts.find(p => p.id === postId);
        return post?.requiredPerShift || 1;
    };

    const getPeopleNames = (postId: number, shiftLabel: string, day: string): string => {
        const ids = getPersonIds(localAssignments, shiftLabel, day, postId);
        return people.filter(p => ids.includes(p.id)).map(p => p.name).join(", ");
    };

    const getBWPersonIds = (day: string, slotId: string): number[] =>
        bwAssignments
            .filter(a => a.day === day && a.slotId === slotId)
            .map(a => a.personId);

    const isInvalidBWSlot = (day: string, slotId: string): boolean =>
        invalidBWSlots.has(getBwSlotKey(day, slotId));

    const isInvalidCell = (postId: number, shiftLabel: string, day: string): boolean => {
        const required = getRequiredCount(postId, day, shiftLabel);
        const assignedCount = getPersonIds(localAssignments, shiftLabel, day, postId).length;
        if (assignedCount < required) return true;
        return invalidCells.has(getCellKey(postId, day, shiftLabel));
    };

    const isESInvalid = (groupId: ESGroupId): boolean => {
        const group = esGroups.find(g => g.id === groupId)!;
        const esAssignment = esAssignments.find(es => es.groupId === groupId);
        if ((esAssignment?.personIds.length || 0) < group.totalPeople) return true;
        return invalidESGroups.has(groupId);
    };

    // Event handlers
    const handleCellClick = (post: Post, day: string, shiftLabel: string) => {
        setEditDialog({
            open: true,
            post,
            day,
            shiftLabel,
            currentPersonIds: getPersonIds(localAssignments, shiftLabel, day, post.id)
        });
    };

    const handleSettingsClick = (e: React.MouseEvent, post: Post, day: string, shiftLabel: string) => {
        e.stopPropagation();
        setSettingsDialog({ open: true, post, day, shiftLabel });
    };

    const handleESClick = (group: ESGroup) => {
        setESEditDialog({ open: true, group });
    };

    const handleBWCellClick = (day: string, slotId: string) => {
        setBWEditDialog({ open: true, day, slotId });
    };

    const handleCellSave = (personIds: number[]) => {
        if (!editDialog.post) return;
        const { post, day, shiftLabel } = editDialog;

        const filtered = localAssignments.filter(a =>
            !(a.postId === post.id && a.day === day && a.shiftLabel === shiftLabel)
        );

        const newAssignments: Assignment[] = personIds.map(personId => ({
            postId: post.id,
            personId,
            day,
            shiftLabel,
            start: '',
            end: ''
        }));

        setLocalAssignments([...filtered, ...newAssignments]);
        setHasChanges(true);
        setValidationErrors([]);
        setInvalidCells(new Set());
        setInvalidESGroups(new Set());
        setInvalidBWSlots(new Set());
    };

    const handleSettingsSave = (required: number) => {
        if (!settingsDialog.post) return;
        const { post, day, shiftLabel } = settingsDialog;

        const filtered = shiftOverrides.filter(o =>
            !(o.postId === post.id && o.day === day && o.shiftLabel === shiftLabel)
        );
        
        const newOverrides = required !== post.requiredPerShift
            ? [...filtered, { postId: post.id, day, shiftLabel, requiredPerShift: required }]
            : filtered;
        
        if (onShiftOverridesChange) {
            onShiftOverridesChange(newOverrides);
        } else {
            setLocalShiftOverrides(newOverrides);
        }
        
        setHasChanges(true);
        setValidationErrors([]);
        setInvalidCells(new Set());
        setInvalidESGroups(new Set());
        setInvalidBWSlots(new Set());
    };

    const handleESSave = (personIds: number[], totalPeople: number) => {
        if (!esEditDialog.group) return;

        const newESAssignments = esAssignments.map(es =>
            es.groupId === esEditDialog.group!.id ? { ...es, personIds } : es
        );
        
        if (onESAssignmentsChange) {
            onESAssignmentsChange(newESAssignments);
        } else {
            setLocalESAssignments(newESAssignments);
        }

        const updatedGroups = esGroups.map(g =>
            g.id === esEditDialog.group!.id ? { ...g, totalPeople } : g
        );
        
        if (onESGroupsChange) {
            onESGroupsChange(updatedGroups);
        } else {
            setLocalESGroups(updatedGroups);
        }

        setHasChanges(true);
        setValidationErrors([]);
        setInvalidCells(new Set());
        setInvalidESGroups(new Set());
        setInvalidBWSlots(new Set());
    };

    const handleBWSave = (day: string, slotId: string, personIds: number[]) => {
        const filtered = bwAssignments.filter(a => !(a.day === day && a.slotId === slotId));
        const updated: BWAssignment[] = [
            ...filtered,
            ...personIds.map(personId => ({ day, slotId, personId })),
        ];

        setBWAssignments(updated);
        setHasChanges(true);
        
        // Run validation with the updated BW assignments
        const validation = validateAndMarkCells(updated);
        setValidationErrors(validation.errors);
    };

    // Validation
    const validateAndMarkCells = (overrideBwAssignments?: BWAssignment[]): { valid: boolean; errors: string[] } => {
        const bwToValidate = overrideBwAssignments ?? bwAssignments;
        const getBWPersonIdsForValidation = (day: string, slotId: string): number[] =>
            bwToValidate
                .filter(a => a.day === day && a.slotId === slotId)
                .map(a => a.personId);
        const bwDaysForValidation = getBwDaysForRange(start, end, bwToValidate);

        const errors: string[] = [];
        const newInvalidCells = new Set<string>();
        const newInvalidESGroups = new Set<string>();
        const newInvalidBWSlots = new Set<string>();

        // Check required counts
        for (const shift of shifts) {
            for (const post of posts) {
                const required = getRequiredCount(post.id, shift.day, shift.label);
                const assignedCount = getPersonIds(localAssignments, shift.label, shift.day, post.id).length;
                if (assignedCount < required) {
                    errors.push(`${shift.day} ${shift.label} - ${post.name}: ${t('needs')} ${required}, ${t('has')} ${assignedCount}`);
                    newInvalidCells.add(getCellKey(post.id, shift.day, shift.label));
                }
            }
        }

        // Check ES groups
        for (const group of esGroups) {
            const esAssignment = esAssignments.find(es => es.groupId === group.id);
            const assignedCount = esAssignment?.personIds.length || 0;
            if (assignedCount < group.totalPeople) {
                errors.push(`${group.name}: ${t('needs')} ${group.totalPeople}, ${t('has')} ${assignedCount}`);
                newInvalidESGroups.add(group.id);
            }
        }

        // Check ES group rule
        for (const shift of shifts) {
            for (const group of esGroups) {
                const esAssignment = esAssignments.find(es => es.groupId === group.id);
                const esMembers = esAssignment?.personIds || [];
                const peopleAtShiftTime = getPersonIds(localAssignments, shift.label, shift.day);
                const esMembersWorking = peopleAtShiftTime.filter(pid => esMembers.includes(pid));

                if (esMembersWorking.length > group.activePerShift) {
                    const memberNames = esMembersWorking.map(pid => people.find(p => p.id === pid)?.name || pid).join(', ');
                    errors.push(`${shift.day} ${shift.label} - ${group.name}: ${t('max')} ${group.activePerShift} ${t('active')}, ${t('has')} ${esMembersWorking.length} (${memberNames})`);
                    newInvalidESGroups.add(group.id);
                    
                    for (const post of posts) {
                        const cellPeople = getPersonIds(localAssignments, shift.label, shift.day, post.id);
                        if (cellPeople.some(pid => esMembers.includes(pid))) {
                            newInvalidCells.add(getCellKey(post.id, shift.day, shift.label));
                        }
                    }
                }
            }
        }

        // Check 8-hour rest
        const personShifts = new Map<number, { idx: number; day: string; label: string; postId: number }[]>();
        for (const assignment of localAssignments) {
            const shiftIdx = getShiftIndex(assignment.day, assignment.shiftLabel, shifts);
            if (shiftIdx >= 0) {
                const existing = personShifts.get(assignment.personId) || [];
                existing.push({ idx: shiftIdx, day: assignment.day, label: assignment.shiftLabel, postId: assignment.postId });
                personShifts.set(assignment.personId, existing);
            }
        }

        for (const [personId, shiftData] of personShifts) {
            const sorted = [...shiftData].sort((a, b) => a.idx - b.idx);
            for (let i = 1; i < sorted.length; i++) {
                if (sorted[i].idx - sorted[i - 1].idx < 3) {
                    const person = people.find(p => p.id === personId);
                    errors.push(`${person?.name || personId}: ${t('Rest violation between')} ${sorted[i - 1].day} ${sorted[i - 1].label} ${t('and')} ${sorted[i].day} ${sorted[i].label}`);
                    newInvalidCells.add(getCellKey(sorted[i - 1].postId, sorted[i - 1].day, sorted[i - 1].label));
                    newInvalidCells.add(getCellKey(sorted[i].postId, sorted[i].day, sorted[i].label));
                }
            }
        }

        // Constraint overlaps
        for (const assignment of localAssignments) {
            const personConstraints = constraints.filter(c => c.personId === assignment.personId);
            if (personConstraints.length === 0) continue;
            const window = getShiftTimeWindow(assignment.shiftLabel);
            if (!window) continue;
            const shiftStart = dayjs(`${assignment.day}T00:00`).add(window.start, 'minute');
            let shiftEnd = dayjs(`${assignment.day}T00:00`).add(window.end, 'minute');
            if (!shiftEnd.isAfter(shiftStart)) shiftEnd = shiftEnd.add(1, 'day');
            for (const c of personConstraints) {
                const cStart = dayjs(c.startISO);
                const cEnd = dayjs(c.endISO);
                if (shiftStart.isBefore(cEnd) && cStart.isBefore(shiftEnd)) {
                    errors.push(`${assignment.day} ${assignment.shiftLabel}: ${people.find(p => p.id === assignment.personId)?.name || assignment.personId} - ${t('Constraint conflict')}: ${c.title}`);
                    newInvalidCells.add(getCellKey(assignment.postId, assignment.day, assignment.shiftLabel));
                    break;
                }
            }
        }

        // Standing exemption
        for (const assignment of localAssignments) {
            const post = posts.find(p => p.id === assignment.postId);
            if (!post || !isStandingExemptPost(post.name)) continue;
            const person = people.find(p => p.id === assignment.personId);
            if (person?.standingExemption) {
                errors.push(`${assignment.day} ${assignment.shiftLabel} - ${post.name}: ${t('Standing exemption - cannot work this post')}`);
                newInvalidCells.add(getCellKey(assignment.postId, assignment.day, assignment.shiftLabel));
            }
        }

        // Check same gender pairing (night shifts only)
        for (const shift of shifts) {
            if (!isNightShift(shift.label)) continue;
            for (const post of posts) {
                const assignedIds = getPersonIds(localAssignments, shift.label, shift.day, post.id);
                if (assignedIds.length > 1) {
                    const assignedPeople = people.filter(p => assignedIds.includes(p.id));
                    for (const person of assignedPeople) {
                        if (person.sameGenderPreference) {
                            for (const other of assignedPeople.filter(p => p.id !== person.id)) {
                                if (other.gender !== person.gender) {
                                    errors.push(`${shift.day} ${shift.label} - ${post.name}: ${person.name} ${t('requires same gender partner')}`);
                                    newInvalidCells.add(getCellKey(post.id, shift.day, shift.label));
                                }
                            }
                        }
                    }
                }
                // Duel guard: cannot be alone in this post/shift
                if (assignedIds.length === 1) {
                    const onlyPerson = people.find(p => p.id === assignedIds[0]);
                    if (onlyPerson?.duelGuard && assignedIds.length < Math.max(2, getRequiredCount(post.id, shift.day, shift.label))) {
                        errors.push(`${shift.day} ${shift.label} - ${post.name}: ${t('Duel guard - cannot be alone in this shift')}`);
                        newInvalidCells.add(getCellKey(post.id, shift.day, shift.label));
                    }
                }
            }
        }

        const esGroupLookup = new Map<number, string>();
        esAssignments.forEach(es => es.personIds.forEach(pid => esGroupLookup.set(pid, es.groupId)));

        for (const day of bwDaysForValidation) {
            for (const slot of BW_SLOT_DEFINITIONS) {
                const key = getBwSlotKey(day, slot.id);
                const assignedIds = getBWPersonIdsForValidation(day, slot.id);
                if (assignedIds.length < BW_REQUIRED_PER_SLOT) {
                    errors.push(`${day} ${slot.label}: ${t('needs')} ${BW_REQUIRED_PER_SLOT}, ${t('has')} ${assignedIds.length}`);
                    newInvalidBWSlots.add(key);
                }

                const slotRange = getBwSlotRangeMinutes(slot);
                for (const personId of assignedIds) {
                    const assignmentsForPerson = localAssignments.filter(a => a.personId === personId && a.day === day);
                    for (const assignment of assignmentsForPerson) {
                        const window = getShiftTimeWindow(assignment.shiftLabel);
                        if (!window) continue;
                        if (hasTimeOverlap(slotRange.start, slotRange.end, window.start, window.end)) {
                            const person = people.find(p => p.id === personId);
                            errors.push(`${person?.name || personId}: ${t('Overlapping shift in this timeframe')} (${day} ${slot.label})`);
                            newInvalidBWSlots.add(key);
                            break;
                        }
                    }
                }

                const usedGroups = new Set<string>();
                for (const personId of assignedIds) {
                    const groupId = esGroupLookup.get(personId);
                    if (!groupId) continue;
                    if (usedGroups.has(groupId)) {
                        const groupName = esGroups.find(g => g.id === groupId)?.name || groupId;
                        errors.push(`${day} ${slot.label} - ${groupName}: ${t('ES limit reached for this slot')}`);
                        newInvalidBWSlots.add(key);
                        break;
                    }
                    usedGroups.add(groupId);
                }

                for (const personId of assignedIds) {
                    const groupId = esGroupLookup.get(personId);
                    if (!groupId) continue;
                    const hasGroupShiftConflict = localAssignments.some(a => {
                        if (a.personId === personId) return false;
                        if (a.day !== day) return false;
                        if (esGroupLookup.get(a.personId) !== groupId) return false;
                        const window = getShiftTimeWindow(a.shiftLabel);
                        if (!window) return false;
                        return hasTimeOverlap(slotRange.start, slotRange.end, window.start, window.end);
                    });
                    if (hasGroupShiftConflict) {
                        const groupName = esGroups.find(g => g.id === groupId)?.name || groupId;
                        errors.push(`${day} ${slot.label} - ${groupName}: ${t('ES overlap with shift')}`);
                        newInvalidBWSlots.add(key);
                        break;
                    }
                }
            }
        }

        setInvalidCells(newInvalidCells);
        setInvalidESGroups(newInvalidESGroups);
        setInvalidBWSlots(newInvalidBWSlots);
        return { valid: errors.length === 0, errors };
    };

    const handleSaveAll = async () => {
        const validation = validateAndMarkCells();
        if (!validation.valid) {
            setValidationErrors(validation.errors);
            return;
        }

        setInvalidCells(new Set());
        setInvalidESGroups(new Set());

        try {
            const result = await saveAllSchedules(localAssignments, bwAssignments, esAssignments);

            if (result.ok) {
                setHasChanges(false);
                setValidationErrors([]);
                onAssignmentsChange?.(localAssignments);
                onBWAssignmentsChange?.(bwAssignments);
                setInvalidBWSlots(new Set());
            } else {
                setValidationErrors([result.error || t('Save failed')]);
            }
        } catch {
            setValidationErrors([t('Save failed')]);
        }
    };

    const handleExport = () => {
        exportToExcel({
            shifts,
            posts,
            people,
            assignments: localAssignments,
            esGroups,
            esAssignments,
            shiftOverrides,
            bwAssignments,
            start,
            end,
            t
        });
    };

    return (
        <>
            {/* Action buttons */}
            <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button variant="outlined" onClick={handleExport}>
                    {t('Export to Excel')}
                </Button>
                <Button variant="contained" color="success" onClick={handleSaveAll} disabled={!hasChanges}>
                    {t('Save Schedule')}
                </Button>
                {hasChanges && (
                    <Typography color="warning.main" variant="body2">
                        {t('Unsaved changes')}
                    </Typography>
                )}
            </Box>

            {/* Validation errors */}
            {validationErrors.length > 0 && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    <Typography variant="subtitle2">{t('Schedule is invalid')}:</Typography>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {validationErrors.slice(0, 10).map((err, i) => <li key={i}>{err}</li>)}
                        {validationErrors.length > 10 && (
                            <li>...{t('and')} {validationErrors.length - 10} {t('more errors')}</li>
                        )}
                    </ul>
                </Alert>
            )}

            {/* Loading indicator during generate */}
            {isGenerating && (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1.5, mb: 2 }}>
                    <CircularProgress size="2rem" />
                    <Typography variant="h5">{t('Assigning')}</Typography>
                </Box>
            )}

            {/* Schedule table */}
            <Typography variant="h6" align="center" sx={{ mb: 1 }}>
                {t('Shifts')}
            </Typography>
            <Box sx={{ overflowX: "auto", width: "100%", minWidth: 600 }}>
                <table style={{ borderCollapse: "collapse", minWidth: "100%", tableLayout: "fixed" }}>
                    <thead>
                        <tr>
                            <th style={{ border: "1px solid #888", background: "#f0f0f0", minWidth: 140, padding: "8px 4px", position: "sticky", left: 0, zIndex: 1 }}>
                                {t('Hours')}
                            </th>
                            {posts.map(post => (
                                <th key={post.id} style={{ border: "1px solid #888", background: "#f0f0f0", minWidth: 130, padding: "8px 4px" }}>
                                    {post.name} ({post.requiredPerShift})
                                </th>
                            ))}
                            {esGroups.map(group => (
                                <th key={group.id} style={{ border: "1px solid #888", background: "#e3f2fd", minWidth: 150, padding: "8px 4px" }}>
                                    {group.name} ({group.totalPeople})
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {shifts.map((shift, shiftIdx) => (
                            <tr key={shift.day + shift.label}>
                                <td style={{ border: "1px solid #888", fontWeight: "bold", minWidth: 140, padding: "4px 8px", background: "#fafafa", position: "sticky", left: 0, zIndex: 1 }}>
                                    {shift.day} {shift.label}
                                </td>
                                {posts.map(post => {
                                    const names = getPeopleNames(post.id, shift.label, shift.day);
                                    const required = getRequiredCount(post.id, shift.day, shift.label);
                                    const assignedCount = getPersonIds(localAssignments, shift.label, shift.day, post.id).length;
                                    const isInvalid = isInvalidCell(post.id, shift.label, shift.day);
                                    const hasOverride = shiftOverrides.some(o => o.postId === post.id && o.day === shift.day && o.shiftLabel === shift.label);

                                    let bgColor = '#fff3e0';
                                    if (isInvalid && validationErrors.length > 0) bgColor = '#ffcdd2';
                                    else if (required === 0) bgColor = '#e0e0e0';
                                    else if (assignedCount === 0) bgColor = '#ffebee';
                                    else if (assignedCount >= required) bgColor = '#e8f5e9';

                                    return (
                                        <td
                                            key={post.id}
                                            onClick={() => handleCellClick(post, shift.day, shift.label)}
                                            style={{
                                                border: isInvalid && validationErrors.length > 0 ? "2px solid #f44336" : "1px solid #ccc",
                                                minWidth: 120,
                                                verticalAlign: 'top',
                                                padding: 4,
                                                cursor: 'pointer',
                                                backgroundColor: bgColor,
                                                transition: 'background-color 0.2s',
                                                position: 'relative'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e3f2fd'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = bgColor}
                                        >
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <span>{names || <span style={{ color: '#999' }}>—</span>}</span>
                                                <IconButton size="small" onClick={(e) => handleSettingsClick(e, post, shift.day, shift.label)} sx={{ p: 0, ml: 0.5 }}>
                                                    <SettingsIcon fontSize="small" color={hasOverride ? "primary" : "disabled"} />
                                                </IconButton>
                                            </Box>
                                            {hasOverride && (
                                                <Typography variant="caption" color="primary" sx={{ display: 'block' }}>
                                                    ({required})
                                                </Typography>
                                            )}
                                        </td>
                                    );
                                })}
                                {shiftIdx === 0 && esGroups.map(group => {
                                    const esAssignment = esAssignments.find(es => es.groupId === group.id);
                                    const assignedCount = esAssignment?.personIds.length || 0;
                                    const isInvalid = isESInvalid(group.id);

                                    let bgColor = '#e3f2fd';
                                    if (isInvalid && validationErrors.length > 0) bgColor = '#ffcdd2';
                                    else if (assignedCount === 0) bgColor = '#ffebee';
                                    else if (assignedCount >= group.totalPeople) bgColor = '#c8e6c9';

                                    return (
                                        <td
                                            key={group.id}
                                            rowSpan={shifts.length}
                                            onClick={() => handleESClick(group)}
                                            style={{
                                                border: isInvalid && validationErrors.length > 0 ? "2px solid #f44336" : "1px solid #888",
                                                minWidth: 150,
                                                verticalAlign: 'top',
                                                padding: 8,
                                                cursor: 'pointer',
                                                backgroundColor: bgColor,
                                                transition: 'background-color 0.2s'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#bbdefb'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = bgColor}
                                        >
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                                <Typography variant="caption" color="textSecondary">
                                                    {t('Active')}: {group.activePerShift} | {t('Resting')}: {group.totalPeople - group.activePerShift}
                                                </Typography>
                                                <EditIcon fontSize="small" color="action" />
                                            </Box>
                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                                {esAssignment?.personIds.map(personId => {
                                                    const person = people.find(p => p.id === personId);
                                                    return person ? <Chip key={personId} label={person.name} size="small" variant="outlined" /> : null;
                                                })}
                                                {assignedCount === 0 && <Typography variant="body2" color="text.secondary">—</Typography>}
                                            </Box>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Box>

            {/* BW table */}
            {bwDays.length > 0 && (
                <Box sx={{ mt: 4, overflowX: 'auto' }}>
                    <Typography variant="h6" align="center" sx={{ mb: 1 }}>{t('BW Assignments')}</Typography>
                    <table style={{ borderCollapse: 'collapse', minWidth: '100%', tableLayout: 'fixed' }}>
                        <thead>
                            <tr>
                                <th style={{ border: "1px solid #888", background: "#f0f0f0", minWidth: 160, padding: "8px 4px" }}>
                                    {t('Hours')}
                                </th>
                                {bwDays.map(day => (
                                    <th key={day} style={{ border: "1px solid #888", background: "#f0f0f0", minWidth: 160, padding: "8px 4px" }}>
                                        {day}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {BW_SLOT_DEFINITIONS.map(slot => {
                                const slotLabel = lang === 'he' ? `עב"ס ${slot.label}` : `BW ${slot.label}`;
                                return (
                                    <tr key={slot.id}>
                                        <td style={{ border: "1px solid #888", padding: "6px 8px", background: "#fafafa", fontWeight: 600 }}>
                                            {slotLabel}
                                        </td>
                                        {bwDays.map(day => {
                                            const personIds = getBWPersonIds(day, slot.id);
                                            const key = getBwSlotKey(day, slot.id);
                                            const isInvalid = isInvalidBWSlot(day, slot.id);
                                            const names = personIds
                                                .map(pid => people.find(p => p.id === pid)?.name || pid)
                                                .join(", ");

                                            let bgColor = '#fff3e0';
                                            if (isInvalid && validationErrors.length > 0) bgColor = '#ffcdd2';
                                            else if (personIds.length === 0) bgColor = '#ffebee';
                                            else if (personIds.length >= BW_REQUIRED_PER_SLOT) bgColor = '#e8f5e9';

                                            return (
                                                <td
                                                    key={key}
                                                    onClick={() => handleBWCellClick(day, slot.id)}
                                                    style={{
                                                        border: isInvalid && validationErrors.length > 0 ? "2px solid #f44336" : "1px solid #ccc",
                                                        padding: 8,
                                                        cursor: 'pointer',
                                                        backgroundColor: bgColor,
                                                        verticalAlign: 'top'
                                                    }}
                                                >
                                                    <Typography variant="body2" sx={{ minHeight: 24 }}>
                                                        {names || <span style={{ color: '#999' }}>—</span>}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {personIds.length} / {BW_REQUIRED_PER_SLOT}
                                                    </Typography>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </Box>
            )}

            {/* Dialogs */}
            {editDialog.post && (
                <CellEditDialog
                    open={editDialog.open}
                    onClose={() => setEditDialog(prev => ({ ...prev, open: false }))}
                    post={editDialog.post}
                    day={editDialog.day}
                    shiftLabel={editDialog.shiftLabel}
                    people={people}
                    currentPersonIds={editDialog.currentPersonIds}
                    requiredCount={getRequiredCount(editDialog.post.id, editDialog.day, editDialog.shiftLabel)}
                    onSave={handleCellSave}
                    allAssignments={localAssignments}
                    allShifts={shifts}
                    esAssignments={esAssignments}
                    esGroups={esGroups}
                    bwAssignments={bwAssignments}
                    constraints={constraints}
                />
            )}

            {settingsDialog.post && (
                <ShiftSettingsDialog
                    open={settingsDialog.open}
                    onClose={() => setSettingsDialog(prev => ({ ...prev, open: false }))}
                    post={settingsDialog.post}
                    day={settingsDialog.day}
                    shiftLabel={settingsDialog.shiftLabel}
                    currentRequired={getRequiredCount(settingsDialog.post.id, settingsDialog.day, settingsDialog.shiftLabel)}
                    onSave={handleSettingsSave}
                />
            )}

            {esEditDialog.group && (
                <ESEditDialog
                    open={esEditDialog.open}
                    onClose={() => setESEditDialog(prev => ({ ...prev, open: false }))}
                    group={esEditDialog.group}
                    people={people}
                    currentPersonIds={esAssignments.find(es => es.groupId === esEditDialog.group!.id)?.personIds || []}
                    onSave={handleESSave}
                    otherESPersonIds={esAssignments.filter(es => es.groupId !== esEditDialog.group!.id).flatMap(es => es.personIds)}
                    constraints={constraints}
                />
            )}

            {bwEditDialog.open && (
                <BWEditDialog
                    open={bwEditDialog.open}
                    onClose={() => setBWEditDialog({ open: false, day: '', slotId: '' })}
                    day={bwEditDialog.day}
                    slotId={bwEditDialog.slotId}
                    people={people}
                    currentPersonIds={getBWPersonIds(bwEditDialog.day, bwEditDialog.slotId)}
                    onSave={(personIds) => handleBWSave(bwEditDialog.day, bwEditDialog.slotId, personIds)}
                    assignments={localAssignments}
                    esAssignments={esAssignments}
                    esGroups={esGroups}
                />
            )}
        </>
    );
};

export default ScheduleCalendar;
