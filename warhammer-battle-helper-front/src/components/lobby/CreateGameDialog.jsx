import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Autocomplete, Box, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  ListSubheader, TextField, Typography,
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import { listSystems } from '../../systems/registry';
import { parchmentDialogProps, DISPLAY_FONT, BODY_FONT } from './lobbyStyles';
import { CUSTOM_PREFIX, buildSystemOptions, filterSystemOptions, findMatch } from './systemOptions';

const isCustom = (value) => Boolean(value) && value.startsWith(CUSTOM_PREFIX);
const templateIdOf = (value) => value.slice(CUSTOM_PREFIX.length);

const subheaderSx = {
  fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '0.75rem',
  letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'primary.main', lineHeight: 2.4, background: 'transparent',
};

const GROUP_LABEL_KEYS = {
  systems: 'creator.groupSystems',
  mine: 'creator.groupMyTemplates',
  shared: 'creator.groupSharedWithMe',
  public: 'creator.groupPublic',
};

// Bolds the first matched fragment of the label; a hit only on the owner email leaves it plain.
function HighlightedLabel({ label, query }) {
  const match = findMatch(label, query);
  if (!match) return label;
  const chars = Array.from(label);
  return (
    <>
      {chars.slice(0, match[0]).join('')}
      <strong>{chars.slice(match[0], match[1]).join('')}</strong>
      {chars.slice(match[1]).join('')}
    </>
  );
}

// The only place a game gets created. Picking the system and picking a custom template are
// the same act, so they share one searchable picker instead of a second "choose template" modal.
function CreateGameDialog({ open, loading, templates, allowedSystems, onClose, onCreate, onOpenCreator }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  // No preselected system: the field opens empty with its placeholder, so it reads as a search
  // box, and "Create" stays disabled until the user picks something.
  const [selection, setSelection] = useState(null);
  // The input shows the chosen label only while the list is closed. Opening it empties the
  // input down to the placeholder, so the field reads as a search box and the whole list shows;
  // `query` is what the user typed since, and it drives both filtering and highlighting.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');

  // "custom" is feature-gated like any other system, so the template groups follow it.
  const customAllowed = !allowedSystems || allowedSystems.includes('custom');

  const regularSystems = useMemo(() => listSystems().filter(sys =>
    sys.value !== 'custom' && (!allowedSystems || allowedSystems.includes(sys.value))
  ), [allowedSystems]);

  const options = useMemo(
    () => buildSystemOptions(regularSystems, customAllowed ? templates : []),
    [regularSystems, templates, customAllowed]
  );
  const selectedOption = options.find(opt => opt.value === selection) ?? null;

  // Every open starts from a clean form — a half-filled name from a cancelled attempt
  // reappearing later reads as a bug.
  useEffect(() => {
    if (open) {
      setName('');
      setSelection(null);
      setPickerOpen(false);
      setQuery('');
    }
  }, [open]);

  // A template selected here can be deleted from the manager stacked on top of this dialog;
  // clear the choice rather than submitting a dangling id.
  useEffect(() => {
    if (isCustom(selection) && !templates.some(tpl => `${CUSTOM_PREFIX}${tpl.id}` === selection)) {
      setSelection(null);
    }
  }, [templates, selection]);

  const handleSubmit = () => {
    if (!name.trim() || !selection || loading) return;
    onCreate(isCustom(selection)
      ? { name: name.trim(), gameSystem: 'custom', customTemplateId: templateIdOf(selection) }
      : { name: name.trim(), gameSystem: selection });
  };

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

        <Autocomplete
          disableClearable
          autoHighlight
          disabled={loading}
          options={options}
          value={selectedOption}
          onChange={(e, opt) => setSelection(opt.value)}
          open={pickerOpen}
          onOpen={() => setPickerOpen(true)}
          // The query is cleared on close, not on open: MUI fires onInputChange for the first
          // typed character BEFORE onOpen, so clearing on open would swallow that character.
          onClose={() => { setPickerOpen(false); setQuery(''); }}
          inputValue={pickerOpen ? query : (selectedOption?.label ?? '')}
          onInputChange={(e, value, reason) => { if (reason === 'input') setQuery(value); }}
          filterOptions={(opts) => filterSystemOptions(opts, query)}
          groupBy={(opt) => opt.group}
          getOptionLabel={(opt) => opt.label}
          // Labels are not unique (two templates may share a name); MUI would key options by label.
          getOptionKey={(opt) => opt.value}
          isOptionEqualToValue={(opt, val) => opt.value === val.value}
          noOptionsText={t('creator.noSystemMatch')}
          renderGroup={(params) => (
            <li key={params.key}>
              <ListSubheader component="div" sx={subheaderSx}>{t(GROUP_LABEL_KEYS[params.group])}</ListSubheader>
              <ul style={{ padding: 0 }}>{params.children}</ul>
            </li>
          )}
          renderOption={(props, opt) => {
            const { key, ...optionProps } = props;
            return (
              <li key={key} {...optionProps}>
                <Box sx={{ display: 'flex', flexDirection: 'column', fontFamily: BODY_FONT }}>
                  <span><HighlightedLabel label={opt.label} query={query} /></span>
                  {opt.ownerEmail && (
                    <Typography component="span" variant="caption"
                      sx={{ fontFamily: BODY_FONT, color: 'text.secondary' }}>
                      {opt.ownerEmail}
                    </Typography>
                  )}
                </Box>
              </li>
            );
          }}
          slotProps={{ listbox: { sx: { maxHeight: 380 } } }}
          sx={{ mt: 2 }}
          renderInput={(params) => (
            <TextField {...params} label={t('game.gameSystem')} placeholder={t('creator.searchSystem')}
              // Keep the label raised so the placeholder shows on an empty, unfocused field.
              InputLabelProps={{ ...params.InputLabelProps, shrink: true }}
              sx={{
                '& .MuiInputBase-input': { fontFamily: BODY_FONT, fontSize: '1.1rem' },
                '& .MuiInputLabel-root': { fontFamily: BODY_FONT, fontSize: '1.1rem' },
              }} />
          )}
        />

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
        <Button onClick={handleSubmit} variant="contained" disabled={loading || !name.trim() || !selection}
          sx={{ fontFamily: BODY_FONT, fontWeight: 600 }}>
          {loading ? t('common.creating') : t('common.create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default CreateGameDialog;
