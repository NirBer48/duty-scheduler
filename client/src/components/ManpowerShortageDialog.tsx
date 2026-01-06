import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
} from '@mui/material';
import { useI18n } from '../util/i18n';

interface ManpowerShortageDialogProps {
  open: boolean;
  missingCount: number;
  onClose: () => void;
  onConfirm: () => void;
}

const ManpowerShortageDialog: React.FC<ManpowerShortageDialogProps> = ({
  open,
  missingCount,
  onClose,
  onConfirm,
}) => {
  const { t } = useI18n();

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="xs" 
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          overflow: 'hidden',
        }
      }}
    >
      <Box
        sx={{
          background: 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)',
          py: 3,
          px: 3,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            bgcolor: 'rgba(255,255,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 1,
          }}
        >
          <Typography variant="h3" sx={{ color: 'white' }}>⚠️</Typography>
        </Box>
        <Typography variant="h5" sx={{ color: 'white', fontWeight: 700, textAlign: 'center' }}>
          {t('Manpower Shortage')}
        </Typography>
      </Box>
      <DialogContent sx={{ py: 1, px: 3, textAlign: 'center' }}>
        {/* <Typography variant="body1" color="text.secondary" gutterBottom>
          {t('Not enough people available')}
        </Typography> */}
        <Box
          sx={{
            my: 3,
            py: 2,
            px: 3,
            bgcolor: '#fff3e0',
            borderRadius: 2,
            border: '2px dashed #ff9800',
          }}
        >
          <Typography variant="h4" sx={{ color: '#e65100', fontWeight: 700 }}>
            {missingCount}
          </Typography>
          <Typography variant="body2" sx={{ color: '#e65100', mt: 0.5 }}>
            {t('Missing X people')}
          </Typography>
        </Box>
        <Typography variant="body1" sx={{ color: 'text.primary', fontWeight: 500 }}>
          {t('Create schedule with empty cells?')}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1, justifyContent: 'center' }}>
        <Button 
          onClick={onClose}
          variant="outlined"
          sx={{ 
            px: 4, 
            borderRadius: 2,
            borderColor: '#bdbdbd',
            color: 'text.secondary',
            '&:hover': {
              borderColor: '#9e9e9e',
              bgcolor: '#f5f5f5',
            }
          }}
        >
          {t('Cancel')}
        </Button>
        <Button 
          variant="contained" 
          onClick={onConfirm}
          sx={{ 
            px: 4, 
            borderRadius: 2,
            background: 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)',
            boxShadow: '0 4px 12px rgba(255,152,0,0.4)',
            '&:hover': {
              background: 'linear-gradient(135deg, #fb8c00 0%, #ef6c00 100%)',
              boxShadow: '0 6px 16px rgba(255,152,0,0.5)',
            }
          }}
        >
          {t('Generate')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ManpowerShortageDialog;

