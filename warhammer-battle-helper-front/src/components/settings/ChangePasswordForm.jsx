import React, { useState } from 'react';
import { Box, Button, Alert, CircularProgress, Typography } from '@mui/material';
import { LockReset as LockResetIcon, CheckCircle as CheckCircleIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import axiosInstance from '../../api/axios';
import ChangePasswordFields from './ChangePasswordFields';

const ChangePasswordForm = () => {
    const { t } = useTranslation();
    const [fields, setFields] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [errors, setErrors] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [serverError, setServerError] = useState('');

    const handleChange = (name, value) => {
        setFields(prev => ({ ...prev, [name]: value }));
        setErrors(prev => ({ ...prev, [name]: '' }));
        setServerError('');
    };

    const validate = () => {
        const newErrors = {};
        if (fields.newPassword.length < 8) {
            newErrors.newPassword = t('userSettings.changePassword.errorPasswordTooShort');
        }
        if (fields.newPassword !== fields.confirmPassword) {
            newErrors.confirmPassword = t('userSettings.changePassword.errorPasswordMismatch');
        }
        return newErrors;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const validationErrors = validate();
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            return;
        }

        setIsLoading(true);
        try {
            await axiosInstance.patch('/change-password', {
                currentPassword: fields.currentPassword,
                newPassword: fields.newPassword,
            });
            setSuccess(true);
            setFields({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (err) {
            const msg = err.response?.data?.error;
            if (msg === 'Invalid current password') {
                setErrors({ currentPassword: t('userSettings.changePassword.errorCurrentPassword') });
            } else {
                setServerError(msg || t('common.error'));
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
                {t('userSettings.changePassword.title')}
            </Typography>

            {success && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <CheckCircleIcon color="success" />
                    <Alert severity="success" sx={{ flex: 1 }}>
                        {t('userSettings.changePassword.successMessage')}
                    </Alert>
                </Box>
            )}

            {serverError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {serverError}
                </Alert>
            )}

            <Box component="form" onSubmit={handleSubmit}>
                <ChangePasswordFields
                    currentPassword={fields.currentPassword}
                    newPassword={fields.newPassword}
                    confirmPassword={fields.confirmPassword}
                    onChange={handleChange}
                    errors={errors}
                    disabled={isLoading}
                />
                <Button
                    type="submit"
                    variant="contained"
                    sx={{ mt: 3, py: 1.5 }}
                    disabled={isLoading}
                    startIcon={isLoading ? <CircularProgress size={20} /> : <LockResetIcon />}
                >
                    {isLoading ? t('userSettings.changePassword.submitting') : t('userSettings.changePassword.submitButton')}
                </Button>
            </Box>
        </Box>
    );
};

export default ChangePasswordForm;
