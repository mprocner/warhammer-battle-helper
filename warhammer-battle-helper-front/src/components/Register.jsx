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
import { PersonAdd as PersonAddIcon } from '@mui/icons-material';

const Register = ({ onRegisterSuccess, addLogMessage }) => {
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

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
            setError('Passwords do not match');
            setIsLoading(false);
            return;
        }

        try {
            addLogMessage(`Attempting to register user ${formData.email}`, 'info');

            // eslint-disable-next-line no-unused-vars
            const response = await axios.post('http://localhost:8080/register', {
                email: formData.email,
                password: formData.password
            });

            addLogMessage(`Successfully registered user ${formData.email}`, 'success');
            setSuccess('Registration successful! You can now log in.');

            setFormData({
                email: '',
                password: '',
                confirmPassword: ''
            });

            if (onRegisterSuccess) {
                onRegisterSuccess(formData.email);
            }

        } catch (error) {
            const errorMessage = error.response?.data?.error || 'Registration failed';
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
                        <PersonAddIcon sx={{ fontSize: 40, color: 'success.main', mb: 1 }} />
                        <Typography component="h1" variant="h4" fontWeight="bold" color="text.primary">
                            Warhammer Battle Helper
                        </Typography>
                        <Typography variant="h6" color="text.secondary" sx={{ mt: 1 }}>
                            Create Account
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
                            autoComplete="new-password"
                            value={formData.password}
                            onChange={handleChange}
                            disabled={isLoading}
                            inputProps={{ minLength: 6 }}
                            helperText="Minimum 6 characters"
                        />
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            name="confirmPassword"
                            label="Confirm Password"
                            type="password"
                            id="confirmPassword"
                            autoComplete="new-password"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            disabled={isLoading}
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
                            disabled={isLoading}
                            startIcon={isLoading ? <CircularProgress size={20} /> : <PersonAddIcon />}
                        >
                            {isLoading ? 'Creating Account...' : 'Register'}
                        </Button>

                        <Box sx={{ textAlign: 'center', mt: 2 }}>
                            <Typography variant="body2">
                                Already have an account?{' '}
                                <Link href="/login" underline="hover">
                                    Login here
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
