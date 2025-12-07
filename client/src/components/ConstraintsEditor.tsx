import React, { useEffect, useMemo, useState } from 'react';
import { Box, Paper, Typography, TextField, Button, IconButton, List, ListItem, ListItemText, Alert, Divider } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useI18n } from '../util/i18n';
import { Constraint, Person } from '../types';
import { fetchConstraints, deleteConstraint } from '../api';

interface Props {
    people: Person[];
}

const ConstraintsEditor: React.FC<Props> = ({ people }) => {
    const { t, lang } = useI18n();
    const dir = lang === 'he' ? 'rtl' : 'ltr';
    const align = lang === 'he' ? 'right' : 'left';

    const [constraints, setConstraints] = useState<Constraint[]>([]);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');

    const refresh = async () => {
        try {
            const data = await fetchConstraints();
            setConstraints(data);
            setError('');
        } catch {
            setError(t('Fetch failed'));
        }
    };

    useEffect(() => {
        refresh();
    }, []);

    const personName = (id: number) => people.find(p => p.id === id)?.name || id;

    const filtered = useMemo(() => {
        if (!search.trim()) return constraints;
        const q = search.toLowerCase();
        return constraints.filter(c => c.title.toLowerCase().includes(q));
    }, [constraints, search]);

    return (
        <Paper sx={{ p: 2, mb: 2, maxHeight: 335, minWidth: 300, display: 'flex', flexDirection: 'column', direction: dir, textAlign: align }}>
            <Typography variant="h6" mb={1}>{t('Constraints')}</Typography>
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
                                    refresh();
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


