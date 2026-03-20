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
import { Login as LoginIcon } from '@mui/icons-material';

const Login = ({ onLogin, addLogMessage }) => {
    const { t } = useTranslation();
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            addLogMessage(`Attempting to log in as ${formData.email}`, 'info');

            const response = await axios.post(`${getApiUrl()}/login`, {
                email: formData.email,
                password: formData.password
            }, {
                headers: getApiHeaders()
            });

            const { token } = response.data;
            localStorage.setItem('token', token);

            addLogMessage(`Successfully logged in as ${formData.email}`, 'success');
            onLogin(formData.email, token);

        } catch (error) {
            const errorMessage = error.response?.data?.error || 'Login failed';
            setError(errorMessage);
            addLogMessage(`Login failed: ${errorMessage}`, 'error');
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
                            {t('navigation.login')}
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
                            autoComplete="current-password"
                            value={formData.password}
                            onChange={handleChange}
                            disabled={isLoading}
                        />

                        {error && (
                            <Alert severity="error" sx={{ mt: 2 }}>
                                {error}
                            </Alert>
                        )}

                        <Button
                            type="submit"
                            fullWidth
                            variant="contained"
                            sx={{ mt: 3, mb: 2, py: 1.5 }}
                            disabled={isLoading}
                            startIcon={isLoading ? <CircularProgress size={20} /> : <LoginIcon />}
                        >
                            {isLoading ? t('common.loading') : t('auth.loginButton')}
                        </Button>

                        <Box sx={{ textAlign: 'center', mt: 1 }}>
                            <Link href="/forgot-password" underline="hover" variant="body2">
                                {t('auth.forgotPassword.title')}
                            </Link>
                        </Box>

                        <Box sx={{ textAlign: 'center', mt: 2 }}>
                            <Typography variant="body2">
                                {t('auth.dontHaveAccount')}{' '}
                                <Link href="/register" underline="hover">
                                    {t('auth.registerHere')}
                                </Link>
                            </Typography>
                        </Box>
                    </Box>
                </Paper>
            </Box>
        </Container>
    );
};

export default Login;
