import React, { useState, useEffect } from "react";
import { Assignment, Person, Post, ShiftOverride, ESGroup, ESGroupAssignment } from "../types";
import { useI18n } from "../util/i18n";
import { Box, Typography, Alert, Button, IconButton, Chip } from "@mui/material";
import SettingsIcon from '@mui/icons-material/Settings';
import EditIcon from '@mui/icons-material/Edit';

import { 
    CellEditDialog, 
    ESEditDialog, 
    ShiftSettingsDialog, 
    exportToExcel,
    getShiftsForPeriod,
    getPersonIds,
    getCellKey,
    getShiftIndex
} from "./schedule";

interface Props {
    posts: Post[];
    assignments: Assignment[];
    people: Person[];
    start: string;
    end: string;
    onAssignmentsChange?: (assignments: Assignment[]) => void;
    shiftOverrides?: ShiftOverride[];
    onShiftOverridesChange?: (overrides: ShiftOverride[]) => void;
    esAssignments?: ESGroupAssignment[];
    onESAssignmentsChange?: (esAssignments: ESGroupAssignment[]) => void;
    esGroups?: ESGroup[];
    onESGroupsChange?: (esGroups: ESGroup[]) => void;
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
    onESGroupsChange
}) => {
    const shifts = getShiftsForPeriod(start, end);
    const { t, lang } = useI18n();

    // ES Groups state - use external if provided
    const [localESGroups, setLocalESGroups] = useState<ESGroup[]>([
        { id: 'es1', name: lang === 'he' ? "כ\"כ א'" : "ES 1", totalPeople: 5, activePerShift: 1 },
        { id: 'es2', name: lang === 'he' ? "כ\"כ ב'" : "ES 2", totalPeople: 4, activePerShift: 1 },
    ]);
    
    const esGroups = onESGroupsChange && externalESGroups ? externalESGroups : localESGroups;
    const setESGroups = onESGroupsChange || setLocalESGroups;

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
    const setESAssignments = onESAssignmentsChange || setLocalESAssignments;
    
    const [hasChanges, setHasChanges] = useState(false);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [invalidCells, setInvalidCells] = useState<Set<string>>(new Set());
    const [invalidESGroups, setInvalidESGroups] = useState<Set<string>>(new Set());

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

    // Sync effects
    useEffect(() => {
        setLocalAssignments(initialAssignments);
        setHasChanges(false);
        setValidationErrors([]);
        setInvalidCells(new Set());
        setInvalidESGroups(new Set());
    }, [initialAssignments]);

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

    const isInvalidCell = (postId: number, shiftLabel: string, day: string): boolean => {
        const required = getRequiredCount(postId, day, shiftLabel);
        const assignedCount = getPersonIds(localAssignments, shiftLabel, day, postId).length;
        if (assignedCount < required) return true;
        return invalidCells.has(getCellKey(postId, day, shiftLabel));
    };

    const isESInvalid = (groupId: 'es1' | 'es2'): boolean => {
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
    };

    // Validation
    const validateAndMarkCells = (): { valid: boolean; errors: string[] } => {
        const errors: string[] = [];
        const newInvalidCells = new Set<string>();
        const newInvalidESGroups = new Set<string>();

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

        // Check same gender pairing
        for (const shift of shifts) {
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
            }
        }

        setInvalidCells(newInvalidCells);
        setInvalidESGroups(newInvalidESGroups);
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
            const response = await fetch('http://localhost:4000/api/schedule/save-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assignments: localAssignments,
                    overrides: shiftOverrides,
                    esAssignments,
                    esGroups
                })
            });
            const result = await response.json();

            if (result.ok) {
                setHasChanges(false);
                setValidationErrors([]);
                onAssignmentsChange?.(localAssignments);
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

            {/* Schedule table */}
            <Box sx={{ overflowX: "auto", width: "100%", minWidth: 600 }}>
                <table style={{ borderCollapse: "collapse", minWidth: "100%", tableLayout: "fixed" }}>
                    <thead>
                        <tr>
                            <th style={{ border: "1px solid #888", background: "#f0f0f0", minWidth: 140, padding: "8px 4px", position: "sticky", left: 0, zIndex: 1 }}>
                                {t('Shift')}
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
                />
            )}
        </>
    );
};

export default ScheduleCalendar;
