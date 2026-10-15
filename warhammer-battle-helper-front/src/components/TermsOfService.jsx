import React from 'react';
import { Container, Box, Paper, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { PROVIDER_NAME, CONTACT_EMAIL, TERMS_EFFECTIVE_DATE } from '../legal/legalInfo';

// Section and paragraph numbers are generated here, not written in the text, so inserting a
// section never leaves stale numbering behind.
const TermsOfService = () => {
    const { t } = useTranslation();
    const sections = t('terms.sections', {
        returnObjects: true,
        name: PROVIDER_NAME,
        email: CONTACT_EMAIL,
    });

    return (
        <Container component="main" maxWidth="md">
            <Box sx={{ mt: 6, mb: 6 }}>
                <Paper elevation={3} sx={{ p: 4, borderRadius: 2 }}>
                    <Typography variant="h5" component="h1" sx={{ mb: 1 }}>
                        {t('terms.title')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        {t('terms.effectiveDate', { date: TERMS_EFFECTIVE_DATE })}
                    </Typography>

                    {sections.map((section, index) => (
                        <Box key={index} component="section" sx={{ mb: 3 }}>
                            <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
                                {`§ ${index + 1}. ${section.title}`}
                            </Typography>
                            <Box component="ol" sx={{ pl: 3, m: 0 }}>
                                {section.paragraphs.map((paragraph, pIndex) => (
                                    <Typography key={pIndex} component="li" variant="body2" sx={{ mb: 1 }}>
                                        {paragraph}
                                    </Typography>
                                ))}
                            </Box>
                        </Box>
                    ))}
                </Paper>
            </Box>
        </Container>
    );
};

export default TermsOfService;
