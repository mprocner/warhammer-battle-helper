import React from 'react';
import { Box, Typography, Switch, FormControlLabel } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useConsent, CONSENT_GRANTED } from '../../analytics/ConsentContext';
import { isConfigured } from '../../analytics/gtag';

const PrivacySettings = () => {
    const { t } = useTranslation();
    const { consent, grant, deny } = useConsent();

    if (!isConfigured()) {
        return (
            <Typography variant="body2" color="text.secondary">
                {t('userSettings.privacy.unavailable')}
            </Typography>
        );
    }

    return (
        <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
                {t('userSettings.privacy.title')}
            </Typography>
            <FormControlLabel
                control={
                    <Switch
                        checked={consent === CONSENT_GRANTED}
                        onChange={(e) => (e.target.checked ? grant() : deny())}
                    />
                }
                label={t('userSettings.privacy.analyticsLabel')}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {t('userSettings.privacy.analyticsHelp')}
            </Typography>
        </Box>
    );
};

export default PrivacySettings;
