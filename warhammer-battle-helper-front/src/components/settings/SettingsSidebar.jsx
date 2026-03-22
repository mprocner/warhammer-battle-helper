import React from 'react';
import { List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import { LockReset as LockResetIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

const SECTIONS = [
    { key: 'changePassword', icon: <LockResetIcon /> },
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
