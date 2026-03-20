import React, { useState, useRef } from 'react';
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
import { CheckCircle as CheckCircleIcon, LockReset as LockResetIcon } from '@mui/icons-material';

const ResetPassword = () => {
    const { t } = useTranslation();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState('idle'); // 'idle' | 'success' | 'error'
    const [errorMessage, setErrorMessage] = useState('');
    const called = useRef(false);

    const token = new URLSearchParams(window.location.search).get('token');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (called.current) return;

        if (password.length < 8) {
            setErrorMessage(t('auth.resetPassword.errorPasswordTooShort'));
            return;
        }
        if (password !== confirmPassword) {
            setErrorMessage(t('auth.resetPassword.errorPasswordMismatch'));
            return;
        }

        setErrorMessage('');
        setIsLoading(true);
        called.current = true;

        try {
            await axios.post(
                `${getApiUrl()}/reset-password`,
                { token, password },
                { headers: getApiHeaders() }
            );
            setStatus('success');
        } catch (err) {
            setStatus('error');
            const msg = err.response?.data?.error;
            setErrorMessage(msg || t('auth.resetPassword.errorInvalidToken'));
        } finally {
            setIsLoading(false);
            called.current = false;
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
                            {t('auth.resetPassword.title')}
                        </Typography>
                    </Box>

                    {status === 'success' && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main' }} />
                            <Alert severity="success" sx={{ width: '100%' }}>
                                {t('auth.resetPassword.successMessage')}
                            </Alert>
                            <Button variant="contained" fullWidth sx={{ mt: 1, py: 1.5 }} href="/login">
                                {t('auth.verifyEmailGoToLogin')}
                            </Button>
                        </Box>
                    )}

                    {status === 'error' && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <Alert severity="error" sx={{ width: '100%' }}>
                                {errorMessage || t('auth.resetPassword.errorInvalidToken')}
                            </Alert>
                            <Link href="/forgot-password" underline="hover">
                                {t('auth.resetPassword.requestNewLink')}
                            </Link>
                        </Box>
                    )}

                    {status === 'idle' && (
                        <Box component="form" onSubmit={handleSubmit}>
                            <TextField
                                margin="normal"
                                required
                                fullWidth
                                label={t('auth.resetPassword.newPasswordLabel')}
                                type="password"
                                autoFocus
                                value={password}
                                onChange={(e) => { setPassword(e.target.value); setErrorMessage(''); }}
                                disabled={isLoading}
                            />
                            <TextField
                                margin="normal"
                                required
                                fullWidth
                                label={t('auth.resetPassword.confirmPasswordLabel')}
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => { setConfirmPassword(e.target.value); setErrorMessage(''); }}
                                disabled={isLoading}
                            />

                            {errorMessage && (
                                <Alert severity="error" sx={{ mt: 2 }}>
                                    {errorMessage}
                                </Alert>
                            )}

                            <Button
                                type="submit"
                                fullWidth
                                variant="contained"
                                sx={{ mt: 3, mb: 2, py: 1.5 }}
                                disabled={isLoading}
                                startIcon={isLoading ? <CircularProgress size={20} /> : <LockResetIcon />}
                            >
                                {isLoading ? t('auth.resetPassword.submitting') : t('auth.resetPassword.submitButton')}
                            </Button>
                        </Box>
                    )}
                </Paper>
            </Box>
        </Container>
    );
};

export default ResetPassword;
