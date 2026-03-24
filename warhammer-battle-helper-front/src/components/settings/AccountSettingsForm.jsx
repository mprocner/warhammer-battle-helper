import React, { useState, useEffect } from 'react';
import { Box, Button, Alert, CircularProgress, Typography, TextField } from '@mui/material';
import { Save as SaveIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { getProfile, updateProfile } from '../../api/profile';
import AvatarUpload from '../character-sheet/AvatarUpload';

const AccountSettingsForm = () => {
    const { t } = useTranslation();
    const [avatar, setAvatar] = useState('');
    const [signature, setSignature] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        getProfile()
            .then(data => {
                setAvatar(data.avatar || '');
                setSignature(data.signature || '');
            })
            .catch(() => setError(t('common.error')))
            .finally(() => setIsLoading(false));
    }, [t]);

    const handleAvatarChange = (url) => {
        setAvatar(url);
        setSuccess(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        setSuccess(false);
        setError('');
        try {
            await updateProfile({ avatar, signature });
            setSuccess(true);
        } catch {
            setError(t('common.error'));
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return <div className="account-settings__loading">{t('common.loading')}</div>;
    }

    return (
        <Box component="form" onSubmit={handleSubmit}>
            <Typography variant="h6" sx={{ mb: 2 }}>
                {t('userSettings.account.title')}
            </Typography>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mb: 2 }}>{t('userSettings.account.successMessage')}</Alert>}

            <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
                    {t('userSettings.account.avatar')}
                </Typography>
                <AvatarUpload
                    currentAvatar={avatar}
                    onAvatarChange={handleAvatarChange}
                />
            </Box>

            <Box sx={{ mt: 3 }}>
                <TextField
                    fullWidth
                    margin="normal"
                    label={t('userSettings.account.signature')}
                    value={signature}
                    onChange={e => { setSignature(e.target.value); setSuccess(false); }}
                    helperText={t('userSettings.account.signaturePlaceholder')}
                    inputProps={{ maxLength: 50 }}
                    disabled={isSaving}
                />
            </Box>

            <Button
                type="submit"
                variant="contained"
                sx={{ mt: 3, py: 1.5 }}
                disabled={isSaving}
                startIcon={isSaving ? <CircularProgress size={20} /> : <SaveIcon />}
            >
                {isSaving ? t('userSettings.account.saving') : t('userSettings.account.save')}
            </Button>
        </Box>
    );
};

export default AccountSettingsForm;
