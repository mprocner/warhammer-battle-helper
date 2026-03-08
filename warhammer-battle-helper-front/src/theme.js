import { createTheme } from '@mui/material/styles';

// Warhammer Fantasy RPG - Aged Parchment & Leather Theme
const theme = createTheme({
    palette: {
        mode: 'light',
        primary: {
            main: '#7a5c42', // Burnt umber leather
            dark: '#6b4423', // Dark leather
            light: '#8b6a4d', // Light leather
            contrastText: '#f4e8d8',
        },
        secondary: {
            main: '#8b2f2f', // Burgundy
            dark: '#6b1f1f', // Dark burgundy
            light: '#a64545', // Light burgundy
            contrastText: '#fff',
        },
        success: {
            main: '#5a7a4a', // Forest green
            dark: '#4a5a3a', // Dark forest
            light: '#7a9a6a', // Light green
        },
        error: {
            main: '#a93434', // Deep crimson
            dark: '#8b2424', // Dark crimson
            light: '#c94444', // Light crimson
        },
        warning: {
            main: '#c9975b', // Antique gold
            dark: '#b8864a', // Dark gold
            light: '#d4a574', // Light gold
            contrastText: '#3a2f1f',
        },
        info: {
            main: '#7a8a9a', // Slate blue
            dark: '#5a6a7a', // Dark slate
            light: '#9aaaба', // Light slate
        },
        background: {
            default: '#e8dcc4', // Aged parchment
            paper: '#f4e8d8', // Light parchment
        },
        text: {
            primary: '#3a2f1f', // Dark sepia
            secondary: '#5a4a3a', // Medium sepia
            disabled: '#8a7d6a',
        },
        divider: '#c9975b',
    },
    typography: {
        fontFamily: [
            '"Cinzel"',
            '"IM Fell DW Pica"',
            'Georgia',
            'serif',
        ].join(','),
        h1: {
            fontWeight: 700,
            letterSpacing: '0.02em',
            textShadow: '2px 2px 4px rgba(0,0,0,0.7)',
        },
        h2: {
            fontWeight: 700,
            letterSpacing: '0.02em',
            textShadow: '2px 2px 4px rgba(0,0,0,0.7)',
        },
        h3: {
            fontWeight: 600,
            letterSpacing: '0.01em',
            textShadow: '1px 1px 3px rgba(0,0,0,0.6)',
        },
        h4: {
            fontWeight: 600,
            letterSpacing: '0.01em',
        },
        h5: {
            fontWeight: 600,
            letterSpacing: '0.01em',
        },
        h6: {
            fontWeight: 600,
            letterSpacing: '0.01em',
        },
        body1: {
            fontFamily: '"Crimson Text", Georgia, serif',
            fontSize: '1rem',
            lineHeight: 1.6,
        },
        body2: {
            fontFamily: '"Crimson Text", Georgia, serif',
            fontSize: '0.875rem',
            lineHeight: 1.5,
        },
        button: {
            fontFamily: '"Cinzel", serif',
            fontWeight: 600,
            letterSpacing: '0.05em',
        },
    },
    shape: {
        borderRadius: 2, // Sharper, more medieval
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    borderRadius: 2,
                    boxShadow: '0 4px 8px rgba(107, 68, 35, 0.2)',
                    border: '2px solid #7a5c42',
                    '&:hover': {
                        boxShadow: '0 6px 12px rgba(107, 68, 35, 0.3)',
                        transform: 'translateY(-1px)',
                    },
                    '&:active': {
                        transform: 'translateY(1px)',
                        boxShadow: '0 2px 4px rgba(107, 68, 35, 0.2)',
                    },
                },
                contained: {
                    background: 'linear-gradient(180deg, #8b6a4d 0%, #7a5c42 100%)',
                    color: '#f4e8d8',
                    '&:hover': {
                        background: 'linear-gradient(180deg, #9a7a5d 0%, #8b6a4d 100%)',
                    },
                },
                containedSecondary: {
                    background: 'linear-gradient(180deg, #a64545 0%, #8b2f2f 100%)',
                    '&:hover': {
                        background: 'linear-gradient(180deg, #b65555 0%, #a64545 100%)',
                    },
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence baseFrequency=\'0.9\' numOctaves=\'4\' /%3E%3CfeColorMatrix values=\'0 0 0 0 0.96, 0 0 0 0 0.91, 0 0 0 0 0.82, 0 0 0 0.03 0\'/%3E%3C/filter%3E%3Crect width=\'100\' height=\'100\' filter=\'url(%23noise)\' opacity=\'1\'/%3E%3C/svg%3E")',
                    border: '3px solid #7a5c42',
                    boxShadow: '0 8px 24px rgba(107, 68, 35, 0.15)',
                },
                elevation3: {
                    boxShadow: '0 12px 32px rgba(107, 68, 35, 0.2)',
                },
            },
        },
        MuiTextField: {
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-root': {
                        backgroundColor: 'rgba(255, 255, 255, 0.5)',
                        '& fieldset': {
                            borderColor: '#c9975b',
                            borderWidth: 2,
                        },
                        '&:hover fieldset': {
                            borderColor: '#b8864a',
                        },
                        '&.Mui-focused fieldset': {
                            borderColor: '#7a5c42',
                        },
                    },
                },
            },
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    borderRadius: 2,
                    border: '1px solid #c9975b',
                    fontFamily: '"Cinzel", serif',
                    fontSize: '0.75rem',
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: '#e8dcc4',
                    backgroundImage: 'linear-gradient(135deg, #f4e8d8 0%, #e8dcc4 100%)',
                    color: '#493119',
                    boxShadow: 'none',
                    border: 'none',
                    '--Paper-overlay': 'none',
                },
            },
        },
        MuiListItem: {
            styleOverrides: {
                root: {
                    borderRadius: 0,
                },
            },
        },
    },
});

export default theme;
