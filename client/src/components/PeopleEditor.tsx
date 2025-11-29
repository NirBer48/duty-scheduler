import React, { useEffect, useState } from 'react';
import { fetchPeople, addPerson, deletePerson } from '../api';
import { Box, Paper, Typography, TextField, Select, MenuItem, Button, IconButton, List, ListItem, ListItemText, Alert, FormControlLabel, Checkbox, Divider } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useI18n } from '../util/i18n';
import type { Person } from '../types';
import * as XLSX from 'xlsx-js-style';

interface Props {
  onUpdate?: () => void;
}

const PeopleEditor: React.FC<Props> = ({ onUpdate }) => {
  const [people, setPeople] = useState<Person[]>([]);
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'F' | 'M' | 'X'>('M');
  const [sameGenderPref, setSameGenderPref] = useState(false);
  const [validationError, setValidationError] = useState('');
  const { t, lang } = useI18n();

  const refreshPeople = async () => {
    const updated = await fetchPeople();
    setPeople(updated);
    onUpdate?.();
    return updated;
  };

  useEffect(() => {
    refreshPeople();
  }, []);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setValidationError(t('Name cannot be empty'));
      return;
    }
    if (people.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
      setValidationError(t('Name already exists'));
      return;
    }
    setValidationError('');
    await addPerson({ name: trimmed, gender, sameGenderPref });
    setName('');
    setSameGenderPref(false);
    await refreshPeople();
  };

  const handleDelete = async (id: number) => {
    await deletePerson(id);
    await refreshPeople();
  };

  const parseBool = (value: unknown) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
      const normalized = value.trim().toUpperCase();
      return ['TRUE', 'YES', '1', 'כן'].includes(normalized);
    }
    return false;
  };

  const resolveName = (row: any): string =>
    (row.name || row.Name || row['שם'] || '').toString().trim();

  const resolveGender = (row: any): 'F' | 'M' | 'X' => {
    const raw = (row.gender || row.Gender || row['מגדר'] || 'M').toString().toUpperCase();
    if (['F', 'נ', 'FEMALE'].includes(raw)) return 'F';
    if (['X', 'OTHER'].includes(raw)) return 'X';
    return 'M';
  };

  const resolveSameGenderPref = (row: any) =>
    parseBool(row.sameGenderPref ?? row['העדפת מגדר'] ?? row.sameGender ?? false);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      let importedCount = 0;
      let skippedCount = 0;
      
      const currentPeople = await refreshPeople();
      const existingNames = new Set(currentPeople.map((p: Person) => p.name.toLowerCase()));
      
      for (const row of jsonData as any[]) {
        const resolvedName = resolveName(row);
        if (!resolvedName) {
          skippedCount++;
          continue;
        }
        
        if (existingNames.has(resolvedName.toLowerCase())) {
          skippedCount++;
          continue;
        }
        
        const resolvedGender = resolveGender(row);
        const resolvedSameGenderPref = resolveSameGenderPref(row);
        
        await addPerson({ name: resolvedName, gender: resolvedGender, sameGenderPref: resolvedSameGenderPref });
        existingNames.add(resolvedName.toLowerCase());
        importedCount++;
      }
      
      await refreshPeople();
      
      if (skippedCount > 0) {
        setValidationError(`${t('Imported')}: ${importedCount}, ${t('Skipped')}: ${skippedCount}`);
      } else {
        setValidationError('');
      }
    } catch {
      setValidationError(t('Import failed'));
    }
    
    e.target.value = '';
  };

  return (
    <Paper sx={{ p: 2, mb: 2, maxHeight: 450, minWidth: 300, display: 'flex', flexDirection: 'column' }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="h6">{t('People')}</Typography>
        <Button 
          component="label" 
          variant="outlined"
          size="small"
          sx={{ gap: 1 }}
          endIcon={<UploadFileIcon sx={{ transform: lang === 'he' ? 'scaleX(-1)' : 'none' }} />}
        >
          {t('Import')}
          <input type="file" hidden accept=".xlsx,.csv" onChange={handleImport} />
        </Button>
      </Box>
      
      <Divider sx={{ mb: 2 }} />
      
      {/* Add form - stacked layout */}
      <Box display="flex" flexDirection="column" gap={1.5} mb={2}>
        <Box display="flex" gap={1}>
          <TextField 
            size="small" 
            label={t('Name')} 
            value={name} 
            onChange={e => setName(e.target.value)}
            fullWidth
          />
          <Select 
            size="small" 
            value={gender} 
            onChange={e => setGender(e.target.value as 'F' | 'M' | 'X')}
            sx={{ minWidth: 70 }}
          >
            <MenuItem value="F">F</MenuItem>
            <MenuItem value="M">M</MenuItem>
            <MenuItem value="X">X</MenuItem>
          </Select>
        </Box>
        
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <FormControlLabel
            control={
              <Checkbox 
                checked={sameGenderPref} 
                onChange={e => setSameGenderPref(e.target.checked)} 
                size="small" 
              />
            }
            label={<Typography variant="body2">{t('Same gender only')}</Typography>}
            sx={{ mr: 0 }}
          />
          <Button onClick={handleAdd} variant="contained" size="small">{t('Add')}</Button>
        </Box>
      </Box>
      
      {validationError && <Alert severity="error" sx={{ mb: 1 }}>{validationError}</Alert>}
      
      <Divider sx={{ mb: 1 }} />
      
      {/* People list */}
      <Box sx={{ overflow: 'auto', flex: 1 }}>
        <List dense>
          {people.map(p => (
            <ListItem 
              secondaryAction={
                <IconButton edge="end" onClick={() => handleDelete(p.id)} size="small">
                  <DeleteIcon fontSize="small" />
                </IconButton>
              } 
              key={p.id}
              sx={{ py: 0.5 }}
            >
              <ListItemText 
                primary={
                  <Typography variant="body2">
                    {p.name} ({p.gender}){p.sameGenderPreference ? ' 👫' : ''}
                  </Typography>
                }
                secondary={p.sameGenderPreference ? t('Same gender only') : null}
              />
            </ListItem>
          ))}
          {people.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              {t('No people added yet')}
            </Typography>
          )}
        </List>
      </Box>
    </Paper>
  );
};

export default PeopleEditor;
