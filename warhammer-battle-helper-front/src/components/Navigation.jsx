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
    SportsKabaddi as BattleIcon,
    Language as LanguageIcon
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
        <AppBar position="static" elevation={4}>
            <Container maxWidth="xl">
                <Toolbar disableGutters>
                    <BattleIcon sx={{ display: { xs: 'none', md: 'flex' }, mr: 1 }} />
                    <Typography
                        variant="h6"
                        noWrap
                        component="a"
                        href="/"
                        sx={{
                            mr: 2,
                            display: { xs: 'none', md: 'flex' },
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            letterSpacing: '.1rem',
                            color: 'inherit',
                            textDecoration: 'none',
                            flexGrow: 1
                        }}
                    >
                        {t('navigation.title')}
                    </Typography>

                    <BattleIcon sx={{ display: { xs: 'flex', md: 'none' }, mr: 1 }} />
                    <Typography
                        variant="h6"
                        noWrap
                        component="a"
                        href="/"
                        sx={{
                            mr: 2,
                            display: { xs: 'flex', md: 'none' },
                            flexGrow: 1,
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            letterSpacing: '.1rem',
                            color: 'inherit',
                            textDecoration: 'none',
                        }}
                    >
                        WBH
                    </Typography>

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
                        {user ? (
                            <>
                                <Chip
                                    label={user.email}
                                    color="secondary"
                                    size="small"
                                    sx={{ display: { xs: 'none', sm: 'flex' } }}
                                />
                                <Button
                                    color="inherit"
                                    startIcon={<BattleIcon />}
                                    onClick={() => navigate('/app')}
                                >
                                    {t('navigation.battleArena')}
                                </Button>
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
