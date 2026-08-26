import React from 'react';
import { List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import { LockReset as LockResetIcon, AccountCircle as AccountCircleIcon, BarChart as BarChartIcon, PrivacyTip as PrivacyTipIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

const SECTIONS = [
    { key: 'account', icon: <AccountCircleIcon /> },
    { key: 'changePassword', icon: <LockResetIcon /> },
    { key: 'statistics', icon: <BarChartIcon /> },
    { key: 'privacy', icon: <PrivacyTipIcon /> },
];

const SettingsSidebar = ({ activeSection, onSelect }) => {
    const { t } = useTranslation();

    return (
        <List disablePadding>
            {SECTIONS.map(({ key, icon }) => (
                <ListItemButton
                    key={key}
                    selected={activeSection === key}
                    onClick={() => onSelect(key)}
                    sx={{ borderRadius: 1 }}
                >
                    <ListItemIcon sx={{ minWidth: 36 }}>{icon}</ListItemIcon>
                    <ListItemText primary={t(`userSettings.${key}.title`)} />
                </ListItemButton>
            ))}
        </List>
    );
};

export default SettingsSidebar;
