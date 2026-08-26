import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    AppBar,
    Toolbar,
    Typography,
    Button,
    Box,
    Container,
    IconButton,
    Chip
} from '@mui/material';
import {
    Login as LoginIcon,
    PersonAdd as PersonAddIcon,
    Logout as LogoutIcon,
    Language as LanguageIcon,
    Settings as SettingsIcon,
    Policy as PolicyIcon
} from '@mui/icons-material';

const Navigation = ({ user, onLogout, inGame }) => {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();

    const handleLogout = () => {
        localStorage.removeItem('token');
        onLogout();
        navigate('/login');
    };

    const toggleLanguage = () => {
        const newLang = i18n.language === 'en' ? 'pl' : 'en';
        i18n.changeLanguage(newLang);
    };

    // Hide navigation when in game view
    if (inGame) {
        return null;
    }

    return (
        <AppBar position="static" elevation={0}>
            <Container maxWidth="xl">
                <Toolbar disableGutters>
                    <Box component="a" href="/" sx={{ display: 'flex', alignItems: 'center', flexGrow: 1, mr: 2 }}>
                        <img src="/img/logo.png" alt="RollHammer" style={{height: 100, objectFit: 'contain' }} />
                    </Box>

                    <Box sx={{ flexGrow: 0, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <IconButton
                            color="inherit"
                            onClick={toggleLanguage}
                            title={`Language: ${i18n.language.toUpperCase()}`}
                        >
                            <LanguageIcon />
                            <Typography variant="caption" sx={{ ml: 0.5 }}>
                                {i18n.language.toUpperCase()}
                            </Typography>
                        </IconButton>
                        {/* I2: Navigation renderuje się też dla anonimowych odwiedzających
                            (user może być null), więc to jedyne trwałe miejsce, z którego
                            polityka prywatności jest osiągalna po zamknięciu banera zgody. */}
                        <IconButton
                            color="inherit"
                            onClick={() => navigate('/privacy')}
                            title={t('navigation.privacy')}
                        >
                            <PolicyIcon />
                        </IconButton>
                        {user ? (
                            <>
                                <Chip
                                    label={user.email}
                                    color="secondary"
                                    size="small"
                                    sx={{ display: { xs: 'none', sm: 'flex' } }}
                                />
                                <IconButton
                                    color="inherit"
                                    onClick={() => navigate('/settings')}
                                    title={t('navigation.settings')}
                                >
                                    <SettingsIcon />
                                </IconButton>
                                <Button
                                    color="inherit"
                                    startIcon={<LogoutIcon />}
                                    onClick={handleLogout}
                                >
                                    {t('navigation.logout')}
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    color="inherit"
                                    startIcon={<LoginIcon />}
                                    onClick={() => navigate('/login')}
                                >
                                    {t('navigation.login')}
                                </Button>
                                <Button
                                    variant="outlined"
                                    color="inherit"
                                    startIcon={<PersonAddIcon />}
                                    onClick={() => navigate('/register')}
                                    sx={{ display: { xs: 'none', sm: 'flex' } }}
                                >
                                    {t('navigation.register')}
                                </Button>
                                <IconButton
                                    color="inherit"
                                    onClick={() => navigate('/register')}
                                    sx={{ display: { xs: 'flex', sm: 'none' } }}
                                >
                                    <PersonAddIcon />
                                </IconButton>
                            </>
                        )}
                    </Box>
                </Toolbar>
            </Container>
        </AppBar>
    );
};

export default Navigation;
