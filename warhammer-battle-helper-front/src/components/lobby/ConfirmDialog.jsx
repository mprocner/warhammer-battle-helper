import React from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from '@mui/material';
import { parchmentDialogProps, DISPLAY_FONT, BODY_FONT } from './lobbyStyles';

// Generic yes/no prompt on parchment. `danger` turns the frame and the confirm button red
// for irreversible actions (deleting a game or a template).
function ConfirmDialog({ open, title, message, confirmLabel, danger = false, onConfirm, onCancel }) {
  const { t } = useTranslation();
  const accent = danger ? 'error.main' : 'primary.main';

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth
      PaperProps={parchmentDialogProps(accent)}>
      <DialogTitle sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, color: accent }}>
        {title}
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ fontFamily: BODY_FONT, fontSize: '1.1rem' }}>{message}</Typography>
      </DialogContent>
      <DialogActions sx={{ p: 2, pt: 0 }}>
        <Button onClick={onCancel} sx={{ fontFamily: BODY_FONT }}>
          {t('common.cancel')}
        </Button>
        <Button onClick={onConfirm} variant="contained" color={danger ? 'error' : 'primary'}
          sx={{ fontFamily: BODY_FONT, fontWeight: 600 }}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ConfirmDialog;
