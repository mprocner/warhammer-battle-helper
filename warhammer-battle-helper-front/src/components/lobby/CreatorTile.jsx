import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Typography } from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import { DISPLAY_FONT, BODY_FONT } from './lobbyStyles';

// Dashed placeholder tile closing the lobby grid — the way into the template manager
// without going through the create-game dialog.
function CreatorTile({ onClick }) {
  const { t } = useTranslation();

  return (
    <Card onClick={onClick}
      sx={{
        minHeight: 220, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        background: 'rgba(244, 232, 216, 0.3)',
        border: '2px dashed', borderColor: 'primary.light',
        boxShadow: 'none', cursor: 'pointer', transition: 'all 0.2s',
        '&:hover': { borderColor: 'primary.main', background: 'rgba(244, 232, 216, 0.6)', transform: 'translateY(-2px)' },
      }}>
      <TuneIcon sx={{ fontSize: 40, color: 'primary.light', mb: 1 }} />
      <Typography variant="h6" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 600, color: 'primary.main', textAlign: 'center' }}>
        {t('creator.tileTitle')}
      </Typography>
      <Typography variant="body2" sx={{ fontFamily: BODY_FONT, color: 'text.secondary', mt: 0.5, textAlign: 'center', px: 2 }}>
        {t('creator.tileDesc')}
      </Typography>
    </Card>
  );
}

export default CreatorTile;
