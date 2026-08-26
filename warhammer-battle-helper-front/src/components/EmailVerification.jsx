import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiUrl, getApiHeaders } from '../api/axios';
import { trackEvent } from '../analytics/gtag';
import axios from 'axios';
import {
    Container,
    Box,
    Paper,
    Typography,
    Alert,
    Button,
    CircularProgress
} from '@mui/material';
import { CheckCircle as CheckCircleIcon, Error as ErrorIcon } from '@mui/icons-material';

const EmailVerification = () => {
    const { t } = useTranslation();
    const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
    const called = useRef(false);

    useEffect(() => {
        if (called.current) return;
        called.current = true;

        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');

        if (!token) {
            setStatus('error');
            return;
        }

        axios.get(`${getApiUrl()}/verify-email?token=${token}`, { headers: getApiHeaders() })
            .then(() => {
                setStatus('success');
                trackEvent('email_verified');
            })
            .catch(() => setStatus('error'));
    }, []);

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
                    </Box>

                    {status === 'loading' && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <CircularProgress />
                            <Typography variant="body1">{t('auth.verifyEmailActivating')}</Typography>
                        </Box>
                    )}

                    {status === 'success' && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main' }} />
                            <Typography variant="h5" fontWeight="bold">{t('auth.verifyEmailTitle')}</Typography>
                            <Alert severity="success" sx={{ width: '100%' }}>
                                {t('auth.verifyEmailSuccess')}
                            </Alert>
                            <Button
                                variant="contained"
                                color="success"
                                fullWidth
                                sx={{ mt: 1, py: 1.5 }}
                                href="/login"
                            >
                                {t('auth.verifyEmailGoToLogin')}
                            </Button>
                        </Box>
                    )}

                    {status === 'error' && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <ErrorIcon sx={{ fontSize: 64, color: 'error.main' }} />
                            <Alert severity="error" sx={{ width: '100%' }}>
                                {t('auth.verifyEmailError')}
                            </Alert>
                            <Button
                                variant="outlined"
                                fullWidth
                                sx={{ mt: 1 }}
                                href="/register"
                            >
                                {t('auth.registerHere')}
                            </Button>
                        </Box>
                    )}
                </Paper>
            </Box>
        </Container>
    );
};

export default EmailVerification;
