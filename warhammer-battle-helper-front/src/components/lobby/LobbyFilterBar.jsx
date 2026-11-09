import React from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, Card, Chip, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff';
import { BODY_FONT, DISPLAY_FONT } from './lobbyStyles';

// null stands for "all games"; the order is the order of the chips.
const ROLE_CHIPS = [
  { value: null, labelKey: 'game.filterAll' },
  { value: 'gm', labelKey: 'game.filterRunning' },
  { value: 'player', labelKey: 'game.filterPlaying' },
];

// The row above the lobby grid. Each control is shown only when it can narrow the list
// (see lobbyFilterVisibility); with neither, the row is not rendered at all.
function LobbyFilterBar({ role, query, showRoles, showSearch, onRoleChange, onQueryChange }) {
  const { t } = useTranslation();
  if (!showRoles && !showSearch) return null;

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
      {showRoles && (
        <Box role="group" aria-label={t('game.filterRolesLabel')} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {ROLE_CHIPS.map(chip => {
            const selected = role === chip.value;
            return (
              <Chip key={chip.labelKey} label={t(chip.labelKey)} clickable
                color="primary" variant={selected ? 'filled' : 'outlined'}
                aria-pressed={selected}
                onClick={() => onRoleChange(chip.value)}
                sx={{ fontFamily: BODY_FONT, fontSize: '1rem', fontWeight: 600 }} />
            );
          })}
        </Box>
      )}
      {showSearch && (
        <TextField size="small" value={query} onChange={e => onQueryChange(e.target.value)}
          placeholder={t('game.searchGames')}
          sx={{ ml: 'auto', minWidth: 240, flex: { xs: '1 1 100%', sm: '0 1 320px' } }}
          slotProps={{
            htmlInput: { 'aria-label': t('game.searchGames') },
            input: {
              startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
              endAdornment: query ? (
                <InputAdornment position="end">
                  <IconButton size="small" aria-label={t('game.clearSearch')} onClick={() => onQueryChange('')}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            },
          }} />
      )}
    </Box>
  );
}

// Shown in place of the grid content when the user has games but the filter leaves none.
export function NoMatchingGames({ query, onClear }) {
  const { t } = useTranslation();
  const trimmed = query.trim();
  return (
    <Card sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 5, px: 3, background: 'rgba(244, 232, 216, 0.6)', border: '2px solid', borderColor: 'primary.main' }}>
      <Typography variant="h6" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, color: 'primary.dark' }}>
        {trimmed ? t('game.noMatchingGamesQuery', { query: trimmed }) : t('game.noMatchingGamesRole')}
      </Typography>
      <Button variant="outlined" startIcon={<FilterAltOffIcon />} onClick={onClear}
        sx={{ fontFamily: BODY_FONT, fontWeight: 600, mt: 2 }}>
        {t('game.clearFilters')}
      </Button>
    </Card>
  );
}

export default LobbyFilterBar;
