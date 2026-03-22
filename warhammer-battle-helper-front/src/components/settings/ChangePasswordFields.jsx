import React from 'react';
import { TextField } from '@mui/material';
import { useTranslation } from 'react-i18next';

const ChangePasswordFields = ({ currentPassword, newPassword, confirmPassword, onChange, errors, disabled }) => {
    const { t } = useTranslation();

    return (
        <>
            <TextField
                margin="normal"
                required
                fullWidth
                label={t('userSettings.changePassword.currentPasswordLabel')}
                type="password"
                value={currentPassword}
                onChange={(e) => onChange('currentPassword', e.target.value)}
                error={!!errors.currentPassword}
                helperText={errors.currentPassword}
                disabled={disabled}
                autoComplete="current-password"
            />
            <TextField
                margin="normal"
                required
                fullWidth
                label={t('userSettings.changePassword.newPasswordLabel')}
                type="password"
                value={newPassword}
                onChange={(e) => onChange('newPassword', e.target.value)}
                error={!!errors.newPassword}
                helperText={errors.newPassword || t('userSettings.changePassword.errorPasswordTooShort')}
                disabled={disabled}
                autoComplete="new-password"
            />
            <TextField
                margin="normal"
                required
                fullWidth
                label={t('userSettings.changePassword.confirmPasswordLabel')}
                type="password"
                value={confirmPassword}
                onChange={(e) => onChange('confirmPassword', e.target.value)}
                error={!!errors.confirmPassword}
                helperText={errors.confirmPassword}
                disabled={disabled}
                autoComplete="new-password"
            />
        </>
    );
};

export default ChangePasswordFields;
