import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, ListItemIcon, Menu, MenuItem } from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
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

// A filter of the system picker, so it reads as one: a compact text button above the picker, not
// a form field of its own. Each pick and Clear apply at once; Confirm (or a click outside) only closes.
function LanguageFilter({ value, onChange, disabled }) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState(null);
  const toggle = (code) => onChange(value.includes(code) ? value.filter(c => c !== code) : [...value, code]);
  const summary = value.length === 0
    ? t('creator.about.filterAll')
    : value.map(code => code.toUpperCase()).join(', ');

  return (
    <>
      <Button size="small" disabled={disabled} onClick={e => setAnchor(e.currentTarget)}
        endIcon={<ArrowDropDownIcon />}
        sx={{ fontFamily: BODY_FONT, textTransform: 'none', color: '#7a5c42', px: 1, minWidth: 0 }}>
        {t('creator.about.filterButton', { list: summary })}
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}
        MenuListProps={{ 'aria-label': t('creator.about.filterLabel'), dense: true }}
        slotProps={{ paper: { sx: { maxHeight: 'min(420px, 60vh)' } } }}>
        {TEMPLATE_LANGUAGES.map(code => {
          const checked = value.includes(code);
          return (
            <MenuItem key={code} role="menuitemcheckbox" aria-checked={checked} onClick={() => toggle(code)}
              sx={{ fontFamily: BODY_FONT }}>
              <ListItemIcon sx={{ color: '#c9975b' }}>
                {checked ? <CheckBoxIcon fontSize="small" /> : <CheckBoxOutlineBlankIcon fontSize="small" />}
              </ListItemIcon>
              {t(`languages.${code}`)}
            </MenuItem>
          );
        })}
        <Box sx={{ position: 'sticky', bottom: 0, display: 'flex', justifyContent: 'flex-end', gap: 1, px: 1.5, py: 0.75,
          borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Button size="small" disabled={value.length === 0} onClick={() => onChange([])}
            sx={{ fontFamily: BODY_FONT, textTransform: 'none' }}>
            {t('creator.about.clearFilter')}
          </Button>
          <Button size="small" variant="contained" onClick={() => setAnchor(null)} sx={{ fontFamily: BODY_FONT }}>
            {t('common.confirm')}
          </Button>
        </Box>
      </Menu>
    </>
  );
}

export default LanguageFilter;
