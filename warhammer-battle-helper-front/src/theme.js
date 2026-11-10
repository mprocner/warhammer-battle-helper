import { createTheme } from '@mui/material/styles';

// Warhammer Fantasy RPG - Aged Parchment & Leather Theme
// Colours, fonts and shadows in the overrides below are theme tokens (src/theme/tokens.css),
// so MUI components follow the game theme. The palette itself stays hex: MUI derives
// channels and contrast from it in JS, which a var() string would break. cssVariables
// publishes the palette as --mui-palette-* on :root, where a theme block can override it.
// Faint paper grain on every MUI paper surface.
const PAPER_NOISE = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence baseFrequency=\'0.9\' numOctaves=\'4\' /%3E%3CfeColorMatrix values=\'0 0 0 0 0.96, 0 0 0 0 0.91, 0 0 0 0 0.82, 0 0 0 0.03 0\'/%3E%3C/filter%3E%3Crect width=\'100\' height=\'100\' filter=\'url(%23noise)\' opacity=\'1\'/%3E%3C/svg%3E")';

const theme = createTheme({
    cssVariables: true,
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
        fontFamily: 'var(--font-display)',
        h1: {
            fontWeight: 700,
            letterSpacing: 'calc(0.02em * var(--tracking-k))',
            textShadow: '2px 2px 4px rgb(var(--c-shadow-rgb) / calc(0.7 * var(--shadow-k)))',
        },
        h2: {
            fontWeight: 700,
            letterSpacing: 'calc(0.02em * var(--tracking-k))',
            textShadow: '2px 2px 4px rgb(var(--c-shadow-rgb) / calc(0.7 * var(--shadow-k)))',
        },
        h3: {
            fontWeight: 600,
            letterSpacing: 'calc(0.01em * var(--tracking-k))',
            textShadow: '1px 1px 3px rgb(var(--c-shadow-rgb) / calc(0.6 * var(--shadow-k)))',
        },
        h4: {
            fontWeight: 600,
            letterSpacing: 'calc(0.01em * var(--tracking-k))',
        },
        h5: {
            fontWeight: 600,
            letterSpacing: 'calc(0.01em * var(--tracking-k))',
        },
        h6: {
            fontWeight: 600,
            letterSpacing: 'calc(0.01em * var(--tracking-k))',
        },
        body1: {
            fontFamily: 'var(--font-body)',
            fontSize: '1rem',
            lineHeight: 1.6,
        },
        body2: {
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
            lineHeight: 1.5,
        },
        button: {
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            letterSpacing: 'calc(0.05em * var(--tracking-k))',
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
                    boxShadow: '0 4px 8px rgb(var(--c-leather-dark-rgb) / calc(0.2 * var(--shadow-k)))',
                    border: '2px solid var(--c-border-strong)',
                    '&:hover': {
                        boxShadow: '0 6px 12px rgb(var(--c-leather-dark-rgb) / calc(0.3 * var(--shadow-k)))',
                        transform: 'translateY(-1px)',
                    },
                    '&:active': {
                        transform: 'translateY(1px)',
                        boxShadow: '0 2px 4px rgb(var(--c-leather-dark-rgb) / calc(0.2 * var(--shadow-k)))',
                    },
                },
                contained: {
                    background: 'linear-gradient(180deg, var(--c-leather-bg) 0%, var(--c-leather-bg) 100%)',
                    color: 'var(--c-text-on-dark)',
                    '&:hover': {
                        background: 'linear-gradient(180deg, var(--c-accent-bg-dark) 0%, var(--c-leather-bg) 100%)',
                    },
                    // Disabled contained CTAs must stay legible on parchment. Without this,
                    // MUI falls back to a washed-out grey fill + grey text that vanishes
                    // against the dialog background. Keep the button's mass, just dim it:
                    // a flat tan fill with dark-leather text (~4.2:1 contrast, AA for the
                    // bold uppercase label), so activation reads as a colour shift.
                    '&.Mui-disabled': {
                        background: 'linear-gradient(180deg, var(--c-surface-alt) 0%, var(--c-surface-alt) 100%)',
                        color: 'var(--c-heading)',
                        borderColor: 'var(--c-border)',
                        boxShadow: 'none',
                        opacity: 1,
                    },
                },
                containedSecondary: {
                    background: 'linear-gradient(180deg, var(--c-danger-bg) 0%, var(--c-danger-bg-dark) 100%)',
                    '&:hover': {
                        background: 'linear-gradient(180deg, var(--c-danger-bg-light) 0%, var(--c-danger-bg) 100%)',
                    },
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: PAPER_NOISE,
                    border: '3px solid var(--c-border-strong)',
                    boxShadow: '0 8px 24px rgb(var(--c-leather-dark-rgb) / calc(0.15 * var(--shadow-k)))',
                },
                elevation3: {
                    boxShadow: '0 12px 32px rgb(var(--c-leather-dark-rgb) / calc(0.2 * var(--shadow-k)))',
                },
            },
        },
        MuiDialog: {
            styleOverrides: {
                // Dialogs are framed surfaces: the theme's corner ornaments go over the paper
                // noise (tokens.css, --frame-ornament). Menus and popovers stay plain.
                paper: {
                    backgroundImage: `var(--frame-ornament), ${PAPER_NOISE}`,
                },
            },
        },
        MuiTextField: {
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-root': {
                        backgroundColor: 'rgb(var(--c-highlight-rgb) / 0.5)',
                        '& fieldset': {
                            borderColor: 'var(--c-border-accent)',
                            borderWidth: 2,
                        },
                        '&:hover fieldset': {
                            borderColor: 'var(--c-border-accent)',
                        },
                        '&.Mui-focused fieldset': {
                            borderColor: 'var(--c-border-strong)',
                        },
                    },
                },
            },
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    borderRadius: 2,
                    border: '1px solid var(--c-border-accent)',
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.75rem',
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: 'var(--c-surface-alt)',
                    backgroundImage: 'linear-gradient(135deg, var(--c-surface) 0%, var(--c-surface-alt) 100%)',
                    color: 'var(--c-text-deep)',
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
