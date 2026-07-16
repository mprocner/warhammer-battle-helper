import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, ListSubheader, MenuItem, Select, TextField, Typography,
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import { listSystems } from '../../systems/registry';
import { parchmentDialogProps, DISPLAY_FONT, BODY_FONT } from './lobbyStyles';

const DEFAULT_SYSTEM = 'warhammer4e';

// A Select value is either a bare system key (hardcoded Go plugin) or "custom:<templateId>"
// for a system authored in the creator. The prefix keeps both kinds in one grouped list
// while staying unambiguous — a template id can never collide with a system key.
const CUSTOM_PREFIX = 'custom:';
const isCustom = (value) => value.startsWith(CUSTOM_PREFIX);
const templateIdOf = (value) => value.slice(CUSTOM_PREFIX.length);

const subheaderSx = {
  fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '0.75rem',
  letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'primary.main', lineHeight: 2.4, background: 'transparent',
};

// The only place a game gets created. Picking the system and picking a custom template are
// the same act, so they share one dropdown instead of a second "choose template" modal.
function CreateGameDialog({ open, loading, templates, allowedSystems, onClose, onCreate, onOpenCreator }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [selection, setSelection] = useState(DEFAULT_SYSTEM);

  // "custom" is feature-gated like any other system, so the template groups follow it.
  const customAllowed = !allowedSystems || allowedSystems.includes('custom');

  const regularSystems = useMemo(() => listSystems().filter(sys =>
    sys.value !== 'custom' && (!allowedSystems || allowedSystems.includes(sys.value))
  ), [allowedSystems]);

  const myTemplates = useMemo(
    () => (customAllowed ? templates.filter(tpl => tpl.isOwner) : []),
    [templates, customAllowed]
  );
  const communityTemplates = useMemo(
    () => (customAllowed ? templates.filter(tpl => !tpl.isOwner) : []),
    [templates, customAllowed]
  );

  // Every open starts from a clean form — a half-filled name from a cancelled attempt
  // reappearing later reads as a bug.
  useEffect(() => {
    if (open) {
      setName('');
      setSelection(DEFAULT_SYSTEM);
    }
  }, [open]);

  // A template selected here can be deleted from the manager stacked on top of this dialog;
  // fall back to the default system rather than submitting a dangling id.
  useEffect(() => {
    if (isCustom(selection) && !templates.some(tpl => `${CUSTOM_PREFIX}${tpl.id}` === selection)) {
      setSelection(DEFAULT_SYSTEM);
    }
  }, [templates, selection]);

  const labelFor = (value) => {
    if (isCustom(value)) return templates.find(tpl => tpl.id === templateIdOf(value))?.name || '';
    return regularSystems.find(sys => sys.value === value)?.label || value;
  };

  const handleSubmit = () => {
    if (!name.trim() || loading) return;
    onCreate(isCustom(selection)
      ? { name: name.trim(), gameSystem: 'custom', customTemplateId: templateIdOf(selection) }
      : { name: name.trim(), gameSystem: selection });
  };

  // Select needs a flat child list — ListSubheader/MenuItem cannot be wrapped in fragments
  // or it stops matching values.
  const options = [
    <ListSubheader key="group-systems" sx={subheaderSx}>{t('creator.groupSystems')}</ListSubheader>,
    ...regularSystems.map(sys => (
      <MenuItem key={sys.value} value={sys.value} sx={{ fontFamily: BODY_FONT }}>{sys.label}</MenuItem>
    )),
  ];
  if (myTemplates.length > 0) {
    options.push(<ListSubheader key="group-mine" sx={subheaderSx}>{t('creator.groupMyTemplates')}</ListSubheader>);
    myTemplates.forEach(tpl => options.push(
      <MenuItem key={tpl.id} value={`${CUSTOM_PREFIX}${tpl.id}`} sx={{ fontFamily: BODY_FONT }}>{tpl.name}</MenuItem>
    ));
  }
  if (communityTemplates.length > 0) {
    options.push(<ListSubheader key="group-community" sx={subheaderSx}>{t('creator.groupCommunity')}</ListSubheader>);
    communityTemplates.forEach(tpl => options.push(
      <MenuItem key={tpl.id} value={`${CUSTOM_PREFIX}${tpl.id}`} sx={{ fontFamily: BODY_FONT }}>{tpl.name}</MenuItem>
    ));
  }

  return (
    <Dialog open={open} onClose={() => !loading && onClose()} maxWidth="sm" fullWidth
      PaperProps={parchmentDialogProps()}>
      <DialogTitle sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '1.8rem', color: 'primary.main' }}>
        {t('game.createNewGame')}
      </DialogTitle>
      <DialogContent>
        <TextField autoFocus margin="dense" label={t('game.gameName')} fullWidth variant="outlined"
          value={name} onChange={(e) => setName(e.target.value)} disabled={loading}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          sx={{ mt: 2, '& .MuiInputBase-input': { fontFamily: BODY_FONT, fontSize: '1.1rem' }, '& .MuiInputLabel-root': { fontFamily: BODY_FONT, fontSize: '1.1rem' } }} />

        <FormControl fullWidth variant="outlined" sx={{ mt: 2 }} disabled={loading}>
          <InputLabel sx={{ fontFamily: BODY_FONT, fontSize: '1.1rem' }}>{t('game.gameSystem')}</InputLabel>
          <Select
            value={selection}
            onChange={(e) => setSelection(e.target.value)}
            label={t('game.gameSystem')}
            renderValue={labelFor}
            MenuProps={{ PaperProps: { sx: { maxHeight: 380 } } }}
            sx={{ fontFamily: BODY_FONT, fontSize: '1.1rem' }}>
            {options}
          </Select>
        </FormControl>

        {/* Creator CTA — a secondary "soft button". It must NOT read as a second primary
            action next to "Create": gold accent (not the leather primary), sentence case,
            flat fill, no shadow, no hover-lift. The theme's MuiButton.root injects a 2px
            border + shadow + hover transform into every button, so those are overridden
            explicitly here. Token display is configured later from inside the game. */}
        {customAllowed && (
          <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ fontFamily: BODY_FONT, color: 'text.secondary', fontSize: '0.95rem' }}>
              {t('creator.noSystemPrompt')}
            </Typography>
            <Button size="small" variant="outlined" onClick={onOpenCreator}
              startIcon={<TuneIcon sx={{ fontSize: 18 }} />}
              sx={{
                fontFamily: BODY_FONT, textTransform: 'none', fontWeight: 600, fontSize: '0.9rem',
                letterSpacing: 'normal', color: '#7a5c42', px: 1.75, py: 0.5, minWidth: 0,
                borderRadius: '6px', border: '1.5px solid rgba(201, 151, 91, 0.55)',
                backgroundColor: 'rgba(201, 151, 91, 0.12)', boxShadow: 'none',
                transition: 'background-color 0.15s ease, border-color 0.15s ease',
                '& .MuiButton-startIcon': { marginRight: 0.75, marginLeft: -0.25 },
                '&:hover': { backgroundColor: 'rgba(201, 151, 91, 0.22)', borderColor: '#c9975b', boxShadow: 'none', transform: 'none' },
                '&:active': { transform: 'none', boxShadow: 'none' },
              }}>
              {t('creator.designYours')}
            </Button>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2, pt: 0 }}>
        <Button onClick={onClose} disabled={loading} sx={{ fontFamily: BODY_FONT }}>
          {t('common.cancel')}
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading || !name.trim()}
          sx={{ fontFamily: BODY_FONT, fontWeight: 600 }}>
          {loading ? t('common.creating') : t('common.create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default CreateGameDialog;
