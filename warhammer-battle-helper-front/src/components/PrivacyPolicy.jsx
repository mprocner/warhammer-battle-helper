import React from 'react';
import { Container, Box, Paper, Typography, Divider } from '@mui/material';
import { useTranslation } from 'react-i18next';
import PrivacySettings from './settings/PrivacySettings';

const SECTIONS = [
    'necessary',
    'analytics',
    'events',
    'userId',
    'withdraw',
    'contact',
];

const PrivacyPolicy = () => {
    const { t } = useTranslation();

    return (
        <Container component="main" maxWidth="md">
            <Box sx={{ mt: 6, mb: 6 }}>
                <Paper elevation={3} sx={{ p: 4, borderRadius: 2 }}>
                    <Typography variant="h5" sx={{ mb: 2 }}>
                        {t('privacy.title')}
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 3 }}>
                        {t('privacy.intro')}
                    </Typography>

                    {SECTIONS.map((section) => (
                        <Box key={section} sx={{ mb: 3 }}>
                            <Typography variant="h6" sx={{ mb: 1 }}>
                                {t(`privacy.${section}Title`)}
                            </Typography>
                            <Typography variant="body2">
                                {t(`privacy.${section}Body`)}
                            </Typography>
                        </Box>
                    ))}

                    {/* I1: wycofanie zgody musi być dostępne bez konta — dotąd żył tylko
                        w SettingsPage za ProtectedRoute, a /privacy jest dostępne anonimowo. */}
                    <Divider sx={{ mb: 3 }} />
                    <PrivacySettings />
                </Paper>
            </Box>
        </Container>
    );
};

export default PrivacyPolicy;
