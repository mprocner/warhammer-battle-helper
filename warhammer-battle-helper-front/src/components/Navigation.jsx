import React, { useState } from 'react';
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
    Menu,
    MenuItem,
    ListItemIcon,
    ListItemText,
    Divider
} from '@mui/material';
import {
    Login as LoginIcon,
    PersonAdd as PersonAddIcon,
    Logout as LogoutIcon,
    Language as LanguageIcon,
    Settings as SettingsIcon,
    HelpOutline as HelpOutlineIcon,
    NewReleases as NewReleasesIcon,
    AccountCircle as AccountCircleIcon,
    ExpandMore as ExpandMoreIcon,
    MoreVert as MoreVertIcon
} from '@mui/icons-material';
import ChangelogDot from '../changelog/ChangelogDot';

// Every control carries a visible label on wide screens: icons alone left users guessing.
// Legal pages and contact live in SiteFooter only; on phones the labelled links fold
// into one overflow menu, since a touch screen has no hover to reveal a hint.
const WIDE = { xs: 'none', md: 'flex' };
const NARROW = { xs: 'flex', md: 'none' };

const Navigation = ({ user, onLogout, inGame }) => {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const [accountAnchor, setAccountAnchor] = useState(null);
    const [moreAnchor, setMoreAnchor] = useState(null);

    const closeMenus = () => {
        setAccountAnchor(null);
        setMoreAnchor(null);
    };

    const go = (path) => {
        closeMenus();
        navigate(path);
    };

    const handleLogout = () => {
        closeMenus();
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

    const languageLabel = t('navigation.languageTitle', { lang: i18n.language.toUpperCase() });

    const accountItems = [
        <MenuItem key="settings" onClick={() => go('/settings')}>
            <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('navigation.settings')}</ListItemText>
        </MenuItem>,
        <MenuItem key="logout" onClick={handleLogout}>
            <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('navigation.logout')}</ListItemText>
        </MenuItem>,
    ];

    return (
        <AppBar position="static" elevation={0}>
            <Container maxWidth="xl">
                <Toolbar disableGutters>
                    <Box component="a" href={user ? '/games' : '/'} sx={{ display: 'flex', alignItems: 'center', flexGrow: 1, mr: 2 }}>
                        <img src="/img/logo.png" alt="PlayRPG" style={{height: 100, objectFit: 'contain' }} />
                    </Box>

                    <Box sx={{ flexGrow: 0, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <IconButton
                            color="inherit"
                            onClick={toggleLanguage}
                            title={languageLabel}
                            aria-label={languageLabel}
                        >
                            <LanguageIcon />
                            <Typography variant="caption" sx={{ ml: 0.5 }}>
                                {i18n.language.toUpperCase()}
                            </Typography>
                        </IconButton>
                        <Button
                            color="inherit"
                            startIcon={<NewReleasesIcon />}
                            onClick={() => navigate('/changelog')}
                            sx={{ display: WIDE }}
                        >
                            {t('navigation.changelog')}
                            <ChangelogDot />
                        </Button>
                        {/* I2: Navigation renders for anonymous visitors too (user may be
                            null), so help stays reachable before logging in. */}
                        <Button
                            color="inherit"
                            startIcon={<HelpOutlineIcon />}
                            onClick={() => navigate('/help')}
                            sx={{ display: WIDE }}
                        >
                            {t('navigation.help')}
                        </Button>
                        {user ? (
                            <>
                                {/* Same frame as the links beside it; the address keeps its own case. */}
                                <Button
                                    color="inherit"
                                    startIcon={<AccountCircleIcon />}
                                    endIcon={<ExpandMoreIcon />}
                                    onClick={(e) => setAccountAnchor(e.currentTarget)}
                                    aria-haspopup="menu"
                                    aria-expanded={Boolean(accountAnchor)}
                                    sx={{ display: WIDE, textTransform: 'none' }}
                                >
                                    {user.email}
                                </Button>
                                <Menu
                                    anchorEl={accountAnchor}
                                    open={Boolean(accountAnchor)}
                                    onClose={closeMenus}
                                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                                    transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                                >
                                    {accountItems}
                                </Menu>
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
                                    sx={{ display: WIDE }}
                                >
                                    {t('navigation.register')}
                                </Button>
                            </>
                        )}
                        <IconButton
                            color="inherit"
                            onClick={(e) => setMoreAnchor(e.currentTarget)}
                            title={t('navigation.menu')}
                            aria-label={t('navigation.menu')}
                            aria-haspopup="menu"
                            aria-expanded={Boolean(moreAnchor)}
                            sx={{ display: NARROW }}
                        >
                            <MoreVertIcon />
                            <ChangelogDot />
                        </IconButton>
                        <Menu
                            anchorEl={moreAnchor}
                            open={Boolean(moreAnchor)}
                            onClose={closeMenus}
                            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                        >
                            <MenuItem onClick={() => go('/changelog')}>
                                <ListItemIcon><NewReleasesIcon fontSize="small" /></ListItemIcon>
                                <ListItemText>{t('navigation.changelog')}</ListItemText>
                                <ChangelogDot inline />
                            </MenuItem>
                            <MenuItem onClick={() => go('/help')}>
                                <ListItemIcon><HelpOutlineIcon fontSize="small" /></ListItemIcon>
                                <ListItemText>{t('navigation.help')}</ListItemText>
                            </MenuItem>
                            <Divider />
                            {user ? accountItems : (
                                <MenuItem onClick={() => go('/register')}>
                                    <ListItemIcon><PersonAddIcon fontSize="small" /></ListItemIcon>
                                    <ListItemText>{t('navigation.register')}</ListItemText>
                                </MenuItem>
                            )}
                        </Menu>
                    </Box>
                </Toolbar>
            </Container>
        </AppBar>
    );
};

export default Navigation;
