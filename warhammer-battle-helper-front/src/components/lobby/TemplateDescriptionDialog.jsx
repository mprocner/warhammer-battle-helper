import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import RichTextEditor from '../common/richText/RichTextEditor';
import { parchmentDialogProps, DISPLAY_FONT, BODY_FONT } from './lobbyStyles';

// Read-only view of a template's description, shared by the system picker, the selected-system
// card and "My templates". Open while `template` is set.
function TemplateDescriptionDialog({ template, onClose }) {
  const { t } = useTranslation();
  return (
    <Dialog open={!!template} onClose={onClose} maxWidth="sm" fullWidth PaperProps={parchmentDialogProps()}>
      {template && (
        <>
          <DialogTitle sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, color: 'primary.main', display: 'flex', alignItems: 'center', gap: 1 }}>
            {template.name}
            {template.language && (
              <Chip size="small" variant="outlined" label={t(`languages.${template.language}`)}
                sx={{ fontFamily: BODY_FONT, color: 'primary.main', borderColor: 'primary.light' }} />
            )}
          </DialogTitle>
          <DialogContent>
            <RichTextEditor value={template.description} editable={false} toolbar={false} />
          </DialogContent>
          <DialogActions sx={{ p: 2, pt: 0 }}>
            <Button onClick={onClose} sx={{ fontFamily: BODY_FONT }}>{t('common.close')}</Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}

export default TemplateDescriptionDialog;
