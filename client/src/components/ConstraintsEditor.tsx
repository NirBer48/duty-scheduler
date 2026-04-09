import React, { useEffect, useMemo, useState } from 'react';
import {
    Box,
    Paper,
    Typography,
    TextField,
    Button,
    IconButton,
    List,
    ListItem,
    ListItemText,
    Alert,
    Divider,
    Autocomplete,
    Checkbox,
    Collapse,
    Stack,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import { useI18n } from '../util/i18n';
import { Constraint, Person } from '../types';
import { fetchConstraints, deleteConstraint, addConstraint } from '../api';

interface Props {
    people: Person[];
    constraints: Constraint[];
    onRefresh: () => void;
}

const ConstraintsEditor: React.FC<Props> = ({ people, constraints, onRefresh }) => {
    const { t, lang } = useI18n();
    const dir = lang === 'he' ? 'rtl' : 'ltr';
    const align = lang === 'he' ? 'right' : 'left';

    const [search, setSearch] = useState('');
    const [error, setError] = useState('');

    // Form state for adding constraints
    const [formOpen, setFormOpen] = useState(false);
    const [selectedPeople, setSelectedPeople] = useState<Person[]>([]);
    const [title, setTitle] = useState('');
    const [startISO, setStartISO] = useState('');
    const [endISO, setEndISO] = useState('');
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);

    const personName = (id: number) => people.find(p => p.id === id)?.name || id;

    const filtered = useMemo(() => {
        if (!search.trim()) return constraints;
        const q = search.toLowerCase();
        return constraints.filter(c => c.title.toLowerCase().includes(q));
    }, [constraints, search]);

    const handleAddConstraints = async () => {
        setFormError('');

        if (selectedPeople.length === 0) {
            setFormError(t('Select at least one person'));
            return;
        }
        if (!title.trim()) {
            setFormError(t('Activity name is required'));
            return;
        }
        if (!startISO || !endISO) {
            setFormError(t('Start and end are required'));
            return;
        }
        if (endISO <= startISO) {
            setFormError(t('End must be after start'));
            return;
        }

        setSaving(true);
        try {
            // Create one constraint per selected person
            for (const person of selectedPeople) {
                await addConstraint({
                    personId: person.id,
                    title: title.trim(),
                    startISO,
                    endISO,
                    id: 0,
                } as Constraint);
            }
            // Reset form
            setSelectedPeople([]);
            setTitle('');
            setStartISO('');
            setEndISO('');
            setFormOpen(false);
            onRefresh();
        } catch (e: any) {
            setFormError(e?.message || t('Save failed'));
        } finally {
            setSaving(false);
        }
    };

    const icon = <CheckBoxOutlineBlankIcon fontSize="small" />;
    const checkedIcon = <CheckBoxIcon fontSize="small" />;

    return (
        <Paper sx={{ p: 2, mb: 2, maxHeight: 500, minWidth: 300, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="h6" fontWeight="bold">{t('Constraints')}</Typography>
                <Button
                    size="small"
                    onClick={() => setFormOpen(!formOpen)}
                    endIcon={formOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                >
                    {formOpen ? t('Close') : t('Add')}
                </Button>
            </Box>

            <Collapse in={formOpen}>
                <Box sx={{ mb: 2, p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
                    <Stack spacing={1.5}>
                        <Autocomplete
                            multiple
                            size="small"
                            options={people}
                            disableCloseOnSelect
                            getOptionLabel={(option) => option.name}
                            value={selectedPeople}
                            onChange={(_, newValue) => setSelectedPeople(newValue)}
                            renderOption={(props, option, { selected }) => (
                                <li {...props}>
                                    <Checkbox
                                        icon={icon}
                                        checkedIcon={checkedIcon}
                                        style={{ marginRight: 8 }}
                                        checked={selected}
                                    />
                                    {option.name}
                                </li>
                            )}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label={t('People')}
                                    placeholder={selectedPeople.length === 0 ? t('Select people') : ''}
                                />
                            )}
                        />
                        <TextField
                            size="small"
                            fullWidth
                            label={t('Activity name')}
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                        <TextField
                            size="small"
                            fullWidth
                            type="datetime-local"
                            label={t('Start')}
                            value={startISO}
                            onChange={(e) => setStartISO(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                        />
                        <TextField
                            size="small"
                            fullWidth
                            type="datetime-local"
                            label={t('End')}
                            value={endISO}
                            onChange={(e) => setEndISO(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                        />
                        {formError && <Alert severity="error" sx={{ py: 0 }}>{formError}</Alert>}
                        <Button
                            variant="contained"
                            size="small"
                            onClick={handleAddConstraints}
                            disabled={saving}
                        >
                            {saving ? t('Saving...') : t('Add Constraint')}
                        </Button>
                    </Stack>
                </Box>
            </Collapse>

            <Divider sx={{ mb: 1.5 }} />
            <TextField
                value={search}
                onChange={e => setSearch(e.target.value)}
                size="small"
                fullWidth
                label={t('Search constraints')}
                sx={{ mb: 1.5, direction: dir, textAlign: align }}
            />
            {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
            <Box sx={{ overflow: 'auto', flex: 1 }}>
                <List
                    dense
                    sx={{
                        direction: dir,
                        textAlign: align,
                    }}
                >
                    {filtered.map(c => (
                        <ListItem
                            key={c.id}
                            secondaryAction={
                                <IconButton edge="end" onClick={async () => {
                                    await deleteConstraint(c.id);
                                    onRefresh();
                                }} size="small">
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            }
                            sx={{ py: 0.75, direction: dir, textAlign: align }}
                        >
                            <ListItemText
                                primary={
                                    <Typography variant="body2" sx={{ direction: dir }}>
                                        {personName(c.personId)} — {c.title}
                                    </Typography>
                                }
                                secondary={
                                    <Typography variant="caption" component="span" sx={{ display: 'block', direction: dir }}>
                                        {c.startISO} → {c.endISO}
                                    </Typography>
                                }
                            />
                        </ListItem>
                    ))}
                    {filtered.length === 0 && (
                        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2, direction: dir }}>
                            {t('No constraints yet')}
                        </Typography>
                    )}
                </List>
            </Box>
        </Paper>
    );
};

export default ConstraintsEditor;
