import React from 'react';
import { useNavigate } from 'react-router-dom';
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
    SportsKabaddi as BattleIcon
} from '@mui/icons-material';

const Navigation = ({ user, onLogout }) => {
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.removeItem('token');
        onLogout();
        navigate('/login');
    };

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
                        WARHAMMER BATTLE HELPER
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
                                    Battle Arena
                                </Button>
                                <Button
                                    color="inherit"
                                    startIcon={<LogoutIcon />}
                                    onClick={handleLogout}
                                >
                                    Logout
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    color="inherit"
                                    startIcon={<LoginIcon />}
                                    onClick={() => navigate('/login')}
                                >
                                    Login
                                </Button>
                                <Button
                                    variant="outlined"
                                    color="inherit"
                                    startIcon={<PersonAddIcon />}
                                    onClick={() => navigate('/register')}
                                    sx={{ display: { xs: 'none', sm: 'flex' } }}
                                >
                                    Register
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
