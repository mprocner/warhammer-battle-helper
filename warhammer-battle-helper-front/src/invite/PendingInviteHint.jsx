import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@mui/material';
import { hasPendingInvite } from './pendingInvite';

// Shown on /login and /register to a visitor who came through a game invite link, so they know
// why they landed here and that an account is all they need.
const PendingInviteHint = () => {
  const { t } = useTranslation();
  // Read once on mount: the token only changes by leaving this page.
  const [invited] = useState(hasPendingInvite);
  if (!invited) return null;
  return (
    <Alert severity="info" sx={{ mb: 2 }}>
      {t('invite.loginHint')}
    </Alert>
  );
};

export default PendingInviteHint;
