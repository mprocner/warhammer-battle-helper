// Game themes (PLAYRPG-270). A theme is a CSS block overriding the tokens of tokens.css under
// :root[data-theme="<id>"] plus, optionally, its own fonts. The ids must match the backend
// whitelist (models.GameThemes); names live in i18n under theme.names.<id>.
//
// `swatch` colours draw the GM's picker tile. They are content of the tile, not chrome: the
// tile shows what a theme looks like while another theme is active, so they cannot be tokens.
// `loadFonts` fetches the theme's @fontsource files on demand, keeping them off the landing
// page and the lobby (privacy and weight: fonts are self-hosted, see index.js).

export const DEFAULT_THEME = 'default';

export const THEMES = [
  {
    id: 'default',
    swatch: { bg: '#f4e8d8', panel: '#e8dcc4', accent: '#c9975b', text: '#3a2f1f', border: '#7a5c42' },
    displayFont: "'Cinzel', serif",
    loadFonts: null,
  },
  {
    id: 'scifi',
    swatch: { bg: '#0f1724', panel: '#1c3550', accent: '#38d6e8', text: '#d6e4f0', border: '#2bb8c9' },
    displayFont: "'Exo 2', sans-serif",
    loadFonts: () => Promise.all([
      import('@fontsource/exo-2/400.css'),
      import('@fontsource/exo-2/600.css'),
      import('@fontsource/exo-2/700.css'),
      import('@fontsource/inter/400.css'),
      import('@fontsource/inter/500.css'),
      import('@fontsource/inter/600.css'),
      import('@fontsource/inter/700.css'),
    ]),
  },
  {
    id: 'twenties',
    swatch: { bg: '#f6f0e1', panel: '#ece2cc', accent: '#a8843a', text: '#1d1a16', border: '#1f4d3a' },
    displayFont: 'serif',
    loadFonts: null,
  },
];

const byId = Object.fromEntries(THEMES.map(t => [t.id, t]));

export const findTheme = (id) => byId[id] || byId[DEFAULT_THEME];

/** The theme a client shows: the game's, unless the player opted out or the id is unknown. */
export const resolveTheme = (gameTheme, ignoreGameTheme) =>
  !ignoreGameTheme && byId[gameTheme] ? gameTheme : DEFAULT_THEME;
