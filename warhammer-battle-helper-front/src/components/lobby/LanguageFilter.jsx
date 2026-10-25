import React from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Chip, MenuItem, TextField } from '@mui/material';
import { TEMPLATE_LANGUAGES } from '../../utils/templateLanguages';
import { BODY_FONT } from './lobbyStyles';

const STORAGE_KEY = 'createGame.languageFilter';

// The filter is a per-viewer convenience: someone who plays in two languages should not
// re-pick them for every game. Unknown codes from an older list are dropped on read.
export function loadLanguageFilter() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(code => TEMPLATE_LANGUAGES.includes(code)) : [];
  } catch {
    return [];
  }
}

export function saveLanguageFilter(langs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(langs)); } catch { /* storage unavailable */ }
}

// Empty selection means "all languages", so the field shows that instead of a blank box.
function LanguageFilter({ value, onChange, disabled }) {
  const { t } = useTranslation();
  return (
    <TextField select fullWidth size="small" disabled={disabled}
      label={t('creator.about.filterLabel')} value={value}
      onChange={e => onChange(e.target.value)}
      InputLabelProps={{ shrink: true }}
      SelectProps={{
        multiple: true,
        displayEmpty: true,
        renderValue: (selected) => (selected.length === 0
          ? t('creator.about.filterAll')
          : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {selected.map(code => <Chip key={code} size="small" label={t(`languages.${code}`)} />)}
            </Box>
          )),
      }}
      sx={{ mt: 2, '& .MuiInputBase-input': { fontFamily: BODY_FONT }, '& .MuiInputLabel-root': { fontFamily: BODY_FONT } }}>
      {TEMPLATE_LANGUAGES.map(code => (
        <MenuItem key={code} value={code} sx={{ fontFamily: BODY_FONT }}>{t(`languages.${code}`)}</MenuItem>
      ))}
    </TextField>
  );
}

export default LanguageFilter;
