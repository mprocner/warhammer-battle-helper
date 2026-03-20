import React, { useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { getApiUrl, getApiHeaders } from '../api/axios';
import {
    Container,
    Box,
    Paper,
    TextField,
    Button,
    Typography,
    Alert,
    Link,
    CircularProgress
} from '@mui/material';
import { LockReset as LockResetIcon } from '@mui/icons-material';

const ForgotPassword = () => {
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            await axios.post(`${getApiUrl()}/forgot-password`, { email }, { headers: getApiHeaders() });
        } catch {
            // Intentionally swallowed — always show success to prevent user enumeration
        } finally {
            setIsLoading(false);
            setSubmitted(true);
        }
    };

    return (
        <Container component="main" maxWidth="xs">
            <Box
                sx={{
                    minHeight: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center'
                }}
            >
                <Paper elevation={6} sx={{ p: 4, width: '100%', borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
                        <img src="/img/logo.png" alt="RollHammer" style={{ height: 180, objectFit: 'contain', marginBottom: 8 }} />
                        <Typography variant="h6" color="text.secondary" sx={{ mt: 1 }}>
                            {t('auth.forgotPassword.title')}
                        </Typography>
                    </Box>

                    {submitted ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <Alert severity="success" sx={{ width: '100%' }}>
                                {t('auth.forgotPassword.successMessage')}
                            </Alert>
                            <Link href="/login" underline="hover" sx={{ mt: 1 }}>
                                {t('auth.forgotPassword.backToLogin')}
                            </Link>
                        </Box>
                    ) : (
                        <Box component="form" onSubmit={handleSubmit}>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                {t('auth.forgotPassword.description')}
                            </Typography>
                            <TextField
                                margin="normal"
                                required
                                fullWidth
                                id="email"
                                label={t('auth.forgotPassword.emailLabel')}
                                name="email"
                                autoComplete="email"
                                autoFocus
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={isLoading}
                            />
                            <Button
                                type="submit"
                                fullWidth
                                variant="contained"
                                sx={{ mt: 3, mb: 2, py: 1.5 }}
                                disabled={isLoading}
                                startIcon={isLoading ? <CircularProgress size={20} /> : <LockResetIcon />}
                            >
                                {isLoading ? t('auth.forgotPassword.sending') : t('auth.forgotPassword.submitButton')}
                            </Button>
                            <Box sx={{ textAlign: 'center', mt: 1 }}>
                                <Link href="/login" underline="hover">
                                    {t('auth.forgotPassword.backToLogin')}
                                </Link>
                            </Box>
                        </Box>
                    )}
                </Paper>
            </Box>
        </Container>
    );
};

export default ForgotPassword;
