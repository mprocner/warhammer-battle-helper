import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, Chip, ListSubheader, MenuItem, TextField } from '@mui/material';
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
  // A multiple select stays open after each pick, so the menu is controlled and closes on Confirm
  // (or a click outside / Escape, as before).
  const [open, setOpen] = useState(false);
  return (
    <TextField select fullWidth size="small" disabled={disabled}
      label={t('creator.about.filterLabel')} value={value}
      onChange={e => onChange(e.target.value)}
      InputLabelProps={{ shrink: true }}
      SelectProps={{
        multiple: true,
        displayEmpty: true,
        open,
        onOpen: () => setOpen(true),
        onClose: () => setOpen(false),
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
      {/* Select ignores clicks on a child without tabindex, so this footer never toggles a value. */}
      <ListSubheader sx={{ position: 'sticky', top: 'auto', bottom: 0, display: 'flex', justifyContent: 'flex-end', py: 0.5, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button size="small" variant="contained" onClick={() => setOpen(false)} sx={{ fontFamily: BODY_FONT }}>
          {t('common.confirm')}
        </Button>
      </ListSubheader>
    </TextField>
  );
}

export default LanguageFilter;
