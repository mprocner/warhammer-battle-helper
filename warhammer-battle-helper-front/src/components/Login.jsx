import React, { useState } from 'react';
import axios from 'axios';
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

            const response = await axios.post('http://localhost:8080/login', {
                email: formData.email,
                password: formData.password
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
                        <LoginIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
                        <Typography component="h1" variant="h4" fontWeight="bold" color="text.primary">
                            Warhammer Battle Helper
                        </Typography>
                        <Typography variant="h6" color="text.secondary" sx={{ mt: 1 }}>
                            Login
                        </Typography>
                    </Box>

                    <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            id="email"
                            label="Email Address"
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
                            label="Password"
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
                            {isLoading ? 'Logging in...' : 'Login'}
                        </Button>

                        <Box sx={{ textAlign: 'center', mt: 2 }}>
                            <Typography variant="body2">
                                Don't have an account?{' '}
                                <Link href="/register" underline="hover">
                                    Register here
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
