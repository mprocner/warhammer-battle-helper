import React, { useState } from 'react';
import axios from 'axios';
import { useTranslation, Trans } from 'react-i18next';
import { getApiUrl, getApiHeaders } from '../api/axios';
import { trackEvent } from '../analytics/gtag';
import {
    Container,
    Box,
    Paper,
    TextField,
    Button,
    Typography,
    Alert,
    Checkbox,
    FormControlLabel,
    Link,
    CircularProgress
} from '@mui/material';
import { PersonAdd as PersonAddIcon } from '@mui/icons-material';

const Register = ({ onRegisterSuccess, addLogMessage }) => {
    const { t } = useTranslation();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        signature: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [acceptedTerms, setAcceptedTerms] = useState(false);

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
        setError('');
        setSuccess('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setSuccess('');

        if (formData.password !== formData.confirmPassword) {
            setError(t('validation.passwordsDoNotMatch'));
            setIsLoading(false);
            return;
        }

        try {
            addLogMessage(`Attempting to register user ${formData.email}`, 'info');

            // eslint-disable-next-line no-unused-vars
            const response = await axios.post(`${getApiUrl()}/register`, {
                email: formData.email,
                password: formData.password,
                acceptedTerms,
                ...(formData.signature.trim() && { signature: formData.signature.trim() })
            }, {
                headers: getApiHeaders()
            });

            addLogMessage(`Successfully registered user ${formData.email}`, 'success');
            setSuccess(t('auth.registrationSuccess'));
            trackEvent('sign_up', { method: 'email' });

            setFormData({
                email: '',
                password: '',
                confirmPassword: '',
                signature: ''
            });
            setAcceptedTerms(false);

            if (onRegisterSuccess) {
                onRegisterSuccess(formData.email);
            }

        } catch (error) {
            const errorMessage = error.response?.data?.error || t('auth.registrationFailed');
            setError(errorMessage);
            addLogMessage(`Registration failed: ${errorMessage}`, 'error');
        } finally {
            setIsLoading(false);
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
                        <img src="/img/logo.png" alt="RollHammer" style={{ height: 240, objectFit: 'contain', marginBottom: 8 }} />
                        <Typography variant="h6" color="text.secondary" sx={{ mt: 1 }}>
                            {t('auth.createAccount')}
                        </Typography>
                    </Box>

                    <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            id="email"
                            label={t('auth.email')}
                            name="email"
                            autoComplete="email"
                            autoFocus
                            value={formData.email}
                            onChange={handleChange}
                            disabled={isLoading}
                        />
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            name="password"
                            label={t('auth.password')}
                            type="password"
                            id="password"
                            autoComplete="new-password"
                            value={formData.password}
                            onChange={handleChange}
                            disabled={isLoading}
                            inputProps={{ minLength: 6 }}
                            helperText={t('auth.minimumCharacters')}
                        />
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            name="confirmPassword"
                            label={t('auth.confirmPassword')}
                            type="password"
                            id="confirmPassword"
                            autoComplete="new-password"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            disabled={isLoading}
                        />

                        <TextField
                            margin="normal"
                            fullWidth
                            name="signature"
                            label={t('auth.signature')}
                            id="signature"
                            value={formData.signature}
                            onChange={handleChange}
                            disabled={isLoading}
                            inputProps={{ maxLength: 50 }}
                            helperText={t('auth.signaturePlaceholder')}
                        />

                        <FormControlLabel
                            sx={{ mt: 1 }}
                            control={
                                <Checkbox
                                    required
                                    checked={acceptedTerms}
                                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                                    disabled={isLoading}
                                />
                            }
                            label={
                                <Typography variant="body2">
                                    {/* A link inside a label does not toggle the checkbox: clicks on
                                        interactive content are excluded from label activation. */}
                                    <Trans
                                        i18nKey="auth.acceptTerms"
                                        components={{
                                            terms: <Link href="/terms" target="_blank" rel="noopener noreferrer" />,
                                        }}
                                    />
                                </Typography>
                            }
                        />

                        {error && (
                            <Alert severity="error" sx={{ mt: 2 }}>
                                {error}
                            </Alert>
                        )}

                        {success && (
                            <Alert severity="success" sx={{ mt: 2 }}>
                                {success}
                            </Alert>
                        )}

                        <Button
                            type="submit"
                            fullWidth
                            variant="contained"
                            color="success"
                            sx={{ mt: 3, mb: 2, py: 1.5 }}
                            disabled={isLoading || !acceptedTerms}
                            startIcon={isLoading ? <CircularProgress size={20} /> : <PersonAddIcon />}
                        >
                            {isLoading ? t('auth.creatingAccount') : t('auth.registerButton')}
                        </Button>

                        <Box sx={{ textAlign: 'center', mt: 2 }}>
                            <Typography variant="body2">
                                {t('auth.alreadyHaveAccount')}{' '}
                                <Link href="/login" underline="hover">
                                    {t('auth.loginHere')}
                                </Link>
                            </Typography>
                        </Box>
                    </Box>
                </Paper>
            </Box>
        </Container>
    );
};

export default Register;
