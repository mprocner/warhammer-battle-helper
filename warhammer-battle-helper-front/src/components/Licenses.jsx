import React from 'react';
import { Container, Box, Paper, Typography, Link } from '@mui/material';
import { useTranslation } from 'react-i18next';

// CC-BY-4.0 attribution required by the SRD licence. Reproduced verbatim from the official
// SRD 5.2.1 "Legal Information" page, so it deliberately bypasses i18n: a translated notice is no
// longer the notice the licence asks for. The licence also forbids any other mention of the
// publisher — keep it here only.
export const SRD_ATTRIBUTION = 'This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.';

const CC_BY_URL = 'https://creativecommons.org/licenses/by/4.0/legalcode';

const Licenses = () => {
    const { t } = useTranslation();

    return (
        <Container component="main" maxWidth="md">
            <Box sx={{ mt: 6, mb: 6 }}>
                <Paper elevation={3} sx={{ p: 4, borderRadius: 2 }}>
                    <Typography variant="h5" sx={{ mb: 2 }}>
                        {t('licenses.title')}
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 3 }}>
                        {t('licenses.intro')}
                    </Typography>
                    <Typography variant="h6" sx={{ mb: 1 }}>
                        {t('licenses.srdTitle')}
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                        {SRD_ATTRIBUTION}
                    </Typography>
                    <Link href={CC_BY_URL} target="_blank" rel="noopener noreferrer" variant="body2">
                        {t('licenses.ccLink')}
                    </Link>
                </Paper>
            </Box>
        </Container>
    );
};

export default Licenses;
