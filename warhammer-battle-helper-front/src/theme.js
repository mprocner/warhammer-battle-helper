import { createTheme } from '@mui/material/styles';

const theme = createTheme({
    palette: {
        primary: {
            main: '#1976d2',
            dark: '#115293',
            light: '#4791db',
        },
        secondary: {
            main: '#dc004e',
            dark: '#9a0036',
            light: '#e33371',
        },
        success: {
            main: '#2e7d32',
            dark: '#1b5e20',
            light: '#4caf50',
        },
        error: {
            main: '#d32f2f',
            dark: '#c62828',
            light: '#ef5350',
        },
        warning: {
            main: '#ed6c02',
            dark: '#e65100',
            light: '#ff9800',
        },
        info: {
            main: '#0288d1',
            dark: '#01579b',
            light: '#03a9f4',
        },
        background: {
            default: '#f5f5f5',
            paper: '#ffffff',
        },
    },
    typography: {
        fontFamily: [
            '-apple-system',
            'BlinkMacSystemFont',
            '"Segoe UI"',
            'Roboto',
            '"Helvetica Neue"',
            'Arial',
            'sans-serif',
        ].join(','),
        h1: {
            fontWeight: 700,
        },
        h2: {
            fontWeight: 700,
        },
        h3: {
            fontWeight: 600,
        },
        h4: {
            fontWeight: 600,
        },
        h5: {
            fontWeight: 600,
        },
        h6: {
            fontWeight: 600,
        },
    },
    shape: {
        borderRadius: 8,
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    textTransform: 'none',
                    fontWeight: 600,
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                },
            },
        },
    },
});

export default theme;
