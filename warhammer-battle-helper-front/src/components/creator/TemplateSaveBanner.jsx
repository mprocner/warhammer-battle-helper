import React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button } from '@mui/material';

const FONT = { fontFamily: 'Crimson Text, serif' };

// Shown when the creator stopped autosaving: somebody else saved first (conflict) the user
// lost edit access (forbidden) or the template vanished (gone). Nothing is saved or discarded until the user picks an action.
export default function TemplateSaveBanner({ block, onReload, onOverwrite }) {
  const { t, i18n } = useTranslation();
  if (!block) return null;

  if (block.kind === 'forbidden') {
    return <Alert severity="error" sx={{ borderRadius: 0, ...FONT }}>{t('creator.saveForbidden')}</Alert>;
  }

  if (block.kind === 'gone') {
    return <Alert severity="error" sx={{ borderRadius: 0, ...FONT }}>{t('creator.saveGone')}</Alert>;
  }

  const time = new Date(block.updatedAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
  return (
    <Alert
      severity="warning"
      sx={{ borderRadius: 0, ...FONT }}
      action={(
        <>
          <Button color="inherit" size="small" onClick={onReload} sx={FONT}>{t('creator.saveConflict.reload')}</Button>
          <Button color="inherit" size="small" onClick={onOverwrite} sx={FONT}>{t('creator.saveConflict.overwrite')}</Button>
        </>
      )}
    >
      {block.email
        ? t('creator.saveConflict.message', { email: block.email, time })
        : t('creator.saveConflict.messageUnknown', { time })}
    </Alert>
  );
}
