import React from 'react';
import { Container, Box, Paper, Typography, Divider } from '@mui/material';
import { useTranslation } from 'react-i18next';
import usePageTitle from '../hooks/usePageTitle';
import PrivacySettings from './settings/PrivacySettings';
import { PROVIDER_NAME, CONTACT_EMAIL, PRIVACY_EFFECTIVE_DATE } from '../legal/legalInfo';

// Same data shape as the terms (`sections[].paragraphs[]`), with numbers generated here, so
// inserting a section never leaves stale numbering behind.
const PrivacyPolicy = () => {
    const { t } = useTranslation();
    usePageTitle(t('pageTitle.privacy'));
    const sections = t('privacy.sections', {
        returnObjects: true,
        name: PROVIDER_NAME,
        email: CONTACT_EMAIL,
    });

    return (
        <Container component="main" maxWidth="md">
            <Box sx={{ mt: 6, mb: 6 }}>
                <Paper elevation={3} sx={{ p: 4, borderRadius: 2 }}>
                    <Typography variant="h5" component="h1" sx={{ mb: 1 }}>
                        {t('privacy.title')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {t('privacy.effectiveDate', { date: PRIVACY_EFFECTIVE_DATE })}
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 3 }}>
                        {t('privacy.intro')}
                    </Typography>

                    {sections.map((section, index) => (
                        <Box key={index} component="section" sx={{ mb: 3 }}>
                            <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
                                {`${index + 1}. ${section.title}`}
                            </Typography>
                            {section.paragraphs.map((paragraph, pIndex) => (
                                <Typography key={pIndex} component="p" variant="body2" sx={{ mb: 1 }}>
                                    {paragraph}
                                </Typography>
                            ))}
                        </Box>
                    ))}

                    {/* Withdrawing consent must work without an account: /privacy is public,
                        while the Settings page sits behind ProtectedRoute. */}
                    <Divider sx={{ mb: 3 }} />
                    <PrivacySettings />
                </Paper>
            </Box>
        </Container>
    );
};

export default PrivacyPolicy;
