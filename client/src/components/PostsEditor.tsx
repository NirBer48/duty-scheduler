import React, { useEffect, useState } from 'react';
import { fetchPosts, addPost, deletePost } from '../api';
import { Box, Paper, Typography, TextField, Button, IconButton, List, ListItem, ListItemText, Alert, Divider } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useI18n } from '../util/i18n';
import type { Post } from '../types';

interface Props {
  onUpdate?: (posts: Post[]) => void;
}

const PostsEditor: React.FC<Props> = ({ onUpdate }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [name, setName] = useState('');
  const [required, setRequired] = useState<number>(1);
  const [validationError, setValidationError] = useState('');
  const { t, lang } = useI18n();
  const dir = lang === 'he' ? 'rtl' : 'ltr';
  const align = lang === 'he' ? 'right' : 'left';

  const refreshPosts = async () => {
    const data = await fetchPosts();
    setPosts(data);
    onUpdate?.(data);
    return data;
  };

  useEffect(() => {
    refreshPosts();
  }, []);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setValidationError(t('Name cannot be empty'));
      return;
    }
    if (posts.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
      setValidationError(t('Name already exists'));
      return;
    }
    setValidationError('');
    await addPost({ name: trimmed, requiredPerShift: Number(required) });
    setName('');
    setRequired(1);
    await refreshPosts();
  };

  const handleDelete = async (id: number) => {
    await deletePost(id);
    await refreshPosts();
  };

  return (
    <Paper sx={{ p: 2, mb: 2, maxHeight: 350, minWidth: 300, display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h6" fontWeight={"bold"} mb={1}>{t('Posts')}</Typography>

      <Divider sx={{ mb: 2 }} />

      <Box display="flex" flexDirection="column" gap={1.5} mb={2}>
        <TextField
          size="small"
          label={t('Name')}
          value={name}
          onChange={e => setName(e.target.value)}
          fullWidth
        />
        <Box display="flex" gap={1} alignItems="center">
          <TextField
            size="small"
            type="number"
            label={t('Required per shift')}
            value={required}
            onChange={e => setRequired(Math.max(1, Number(e.target.value)))}
            InputProps={{ inputProps: { min: 1 } }}
            sx={{ flex: 1 }}
          />
          <Button onClick={handleAdd} variant="contained" size="small">{t('Add')}</Button>
        </Box>
      </Box>

      {validationError && <Alert severity="error" sx={{ mb: 1 }}>{validationError}</Alert>}

      <Divider sx={{ mb: 1 }} />

      <Box sx={{ overflow: 'auto', flex: 1 }}>
        <List
          dense
        >
          {posts.map(p => (
            <ListItem
              secondaryAction={
                <IconButton edge="end" onClick={() => handleDelete(p.id)} size="small">
                  <DeleteIcon fontSize="small" />
                </IconButton>
              }
              key={p.id}
              sx={{
                py: 0.5,
              }}
            >
              <ListItemText
                primary={
                  <Typography
                    variant="body2"
                  >
                    {p.name}
                  </Typography>
                }
                secondary={
                  <Typography
                    variant="caption"
                    component="span"
                  >
                    {`${t('Required')}: ${p.requiredPerShift}`}
                  </Typography>
                }
              />
            </ListItem>
          ))}
          {posts.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              {t('No posts added yet')}
            </Typography>
          )}
        </List>
      </Box>
    </Paper>
  );
};

export default PostsEditor;
