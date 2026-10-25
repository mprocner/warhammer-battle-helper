import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import axiosInstance from '../../api/axios';
import {
  Autocomplete, Box, Button, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, ListSubheader, TextField, Typography,
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import { listSystems } from '../../systems/registry';
import { parchmentDialogProps, DISPLAY_FONT, BODY_FONT } from './lobbyStyles';
import { CUSTOM_PREFIX, buildSystemOptions, filterByLanguages, filterSystemOptions, findMatch } from './systemOptions';
import LanguageFilter, { loadLanguageFilter, saveLanguageFilter } from './LanguageFilter';
import TemplateDescriptionDialog from './TemplateDescriptionDialog';
import RichTextEditor from '../common/richText/RichTextEditor';

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
function CreateGameDialog({ open, loading, templates, onClose, onCreate, onOpenCreator }) {
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
  // Hardcoded systems this user may create games in; null until /features answers. Fetched on
  // every open so an access change made in the admin panel shows without a page reload.
  const [allowedSystems, setAllowedSystems] = useState(null);
  const [languages, setLanguages] = useState(loadLanguageFilter);
  // The option whose description is open in the popup; null = closed.
  const [describing, setDescribing] = useState(null);

  // Until /features answers (or if it fails) no hardcoded system is offered; the backend
  // enforces access on create anyway. Custom templates are never gated.
  const regularSystems = useMemo(() => listSystems()
    .filter(sys => sys.value !== 'custom' && (allowedSystems ?? []).includes(sys.value))
    .map(sys => ({ ...sys, label: t(`gameSystems.${sys.value}`) })),
  [allowedSystems, t]);

  const options = useMemo(
    () => filterByLanguages(buildSystemOptions(regularSystems, templates), languages),
    [regularSystems, templates, languages]
  );
  const handleLanguagesChange = (langs) => {
    setLanguages(langs);
    saveLanguageFilter(langs);
  };
  const selectedOption = options.find(opt => opt.value === selection) ?? null;

  // Every open starts from a clean form — a half-filled name from a cancelled attempt
  // reappearing later reads as a bug — and with a fresh access list.
  useEffect(() => {
    if (!open) return undefined;
    setName('');
    setSelection(null);
    setPickerOpen(false);
    setQuery('');
    setAllowedSystems(null);
    // A reply from an earlier open must not overwrite the current one.
    let cancelled = false;
    axiosInstance.get('/features')
      .then(res => { if (!cancelled) setAllowedSystems(res.data.allowedSystems); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  // A template selected here can be deleted from the manager stacked on top of this dialog, or
  // hidden by the language filter; clear the choice rather than submit something not on the list.
  useEffect(() => {
    if (isCustom(selection) && !options.some(opt => opt.value === selection)) {
      setSelection(null);
    }
  }, [options, selection]);

  const handleSubmit = () => {
    if (!name.trim() || !selection || loading) return;
    onCreate(isCustom(selection)
      ? { name: name.trim(), gameSystem: 'custom', customTemplateId: templateIdOf(selection) }
      : { name: name.trim(), gameSystem: selection });
  };

  return (
    <>
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

        <LanguageFilter value={languages} onChange={handleLanguagesChange} disabled={loading} />

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
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', fontFamily: BODY_FONT, flex: 1, minWidth: 0 }}>
                    <span><HighlightedLabel label={opt.label} query={query} /></span>
                    {opt.ownerEmail && (
                      <Typography component="span" variant="caption"
                        sx={{ fontFamily: BODY_FONT, color: 'text.secondary' }}>
                        {opt.ownerEmail}
                      </Typography>
                    )}
                  </Box>
                  {opt.description && (
                    // mousedown would otherwise select the row before click ever fires.
                    <IconButton size="small" aria-label={t('creator.about.showDescription')}
                      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                      onClick={e => { e.stopPropagation(); setDescribing(opt); }}
                      sx={{ color: 'primary.main' }}>
                      <InfoOutlinedIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              </li>
            );
          }}
          // Capped by the viewport too: the list opens below a field in the middle of the dialog,
          // so a fixed 380px ran off the bottom of a laptop screen and hid the lower groups.
          slotProps={{ listbox: { sx: { maxHeight: 'min(380px, 40vh)' } } }}
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

        {selectedOption?.description && (
          <Box className="create-game__selected-about"
            sx={{ mt: 1.5, p: 1.5, borderRadius: 1, border: '1px solid', borderColor: 'primary.light', background: 'rgba(255,255,255,0.4)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography sx={{ fontFamily: DISPLAY_FONT, fontWeight: 600, color: 'primary.main' }}>{selectedOption.label}</Typography>
              {selectedOption.language && (
                <Chip size="small" variant="outlined" label={t(`languages.${selectedOption.language}`)} sx={{ fontFamily: BODY_FONT }} />
              )}
            </Box>
            <Box sx={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              <RichTextEditor value={selectedOption.description} editable={false} toolbar={false} />
            </Box>
            <Button size="small" onClick={() => setDescribing(selectedOption)} sx={{ fontFamily: BODY_FONT, textTransform: 'none', mt: 0.5, px: 0 }}>
              {t('creator.about.more')}
            </Button>
          </Box>
        )}

        {/* Creator CTA — a secondary "soft button". It must NOT read as a second primary
            action next to "Create": gold accent (not the leather primary), sentence case,
            flat fill, no shadow, no hover-lift. The theme's MuiButton.root injects a 2px
            border + shadow + hover transform into every button, so those are overridden
            explicitly here. Token display is configured later from inside the game. */}
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
    <TemplateDescriptionDialog
      template={describing && { name: describing.label, description: describing.description, language: describing.language }}
      onClose={() => setDescribing(null)} />
    </>
  );
}

export default CreateGameDialog;
