import React, { useState } from 'react';
import { Container, Box, Paper, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import SettingsSidebar from './SettingsSidebar';
import ChangePasswordForm from './ChangePasswordForm';

const SECTION_COMPONENTS = {
    changePassword: <ChangePasswordForm />,
};

const SettingsPage = () => {
    const { t } = useTranslation();
    const [activeSection, setActiveSection] = useState(null);

    return (
        <Container component="main" maxWidth="md">
            <Box sx={{ mt: 6, mb: 4 }}>
                <Typography variant="h5" sx={{ mb: 3 }}>
                    {t('userSettings.title')}
                </Typography>
                <Paper elevation={3} sx={{ display: 'flex', borderRadius: 2, overflow: 'hidden' }}>
                    <Box sx={{ width: 220, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', p: 1 }}>
                        <SettingsSidebar activeSection={activeSection} onSelect={setActiveSection} />
                    </Box>
                    <Box sx={{ flex: 1, p: 4 }}>
                        {activeSection ? (
                            SECTION_COMPONENTS[activeSection]
                        ) : (
                            <Typography variant="body2" color="text.secondary">
                                {t('userSettings.selectOption')}
                            </Typography>
                        )}
                    </Box>
                </Paper>
            </Box>
        </Container>
    );
};

export default SettingsPage;
