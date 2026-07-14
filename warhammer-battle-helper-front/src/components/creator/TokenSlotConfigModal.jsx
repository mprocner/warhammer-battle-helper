import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, MenuItem, Box, Typography, IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/CloseOutlined';
import { TOKEN_ICONS, resolveIcon } from '../../utils/tokenIcons';

// Stable slug for a homebrew (non-preset) icon condition. Generated once when the GM
// picks a custom icon/label, kept on the slot so relabeling never orphans stored states.
function makeConditionKey() {
  return 'cond_' + Math.random().toString(36).slice(2, 10);
}

// TokenSlotConfigModal edits one ring slot or one square (FEATURE-102). The same modal
// serves both via allowedTypes: ring slots allow empty/icon/number/field/select; squares
// allow number/field/select and always show a caption input.
export default function TokenSlotConfigModal({
  open, slot, allowedTypes, isSquare, fields, presetConditions = [], positionLabel, onSave, onCancel,
}) {
  const { t } = useTranslation();
  const [type, setType] = useState(slot?.type || allowedTypes[0]);
  const [icon, setIcon] = useState(slot?.icon || '');
  const [conditionKey, setConditionKey] = useState(slot?.conditionKey || '');
  const [conditionLabel, setConditionLabel] = useState(slot?.conditionLabel || '');
  const [numberLabel, setNumberLabel] = useState(slot?.numberLabel || '');
  const [fieldKey, setFieldKey] = useState(slot?.field?.key || '');
  const [selectOptions, setSelectOptions] = useState((slot?.selectOptions || []).join(','));
  const [caption, setCaption] = useState(slot?.caption || '');

  // Fields available for the "field" type, grouped by category (attribute/number).
  const fieldOptions = useMemo(
    () => (fields || []).filter(f => f.category === 'attribute' || f.category === 'number'),
    [fields],
  );

  const selectedField = fieldOptions.find(f => f.key === fieldKey);

  const parsedOptions = selectOptions.split(',').map(o => o.trim()).filter(Boolean);

  // Save validity per type (mirrors the plan's validation rules).
  const canSave = (() => {
    if (isSquare && !caption.trim()) return false;
    switch (type) {
      case 'empty': return true;
      case 'icon': return !!icon;
      case 'number': return !!numberLabel.trim();
      case 'field': return !!selectedField;
      case 'select': return parsedOptions.length >= 2;
      default: return false;
    }
  })();

  const handleSave = () => {
    const base = { id: slot?.id, type };
    if (isSquare) base.caption = caption.trim();
    if (type === 'icon') {
      base.icon = icon;
      base.conditionKey = conditionKey || makeConditionKey();
      base.conditionLabel = conditionLabel.trim();
    } else if (type === 'number') {
      base.numberLabel = numberLabel.trim();
    } else if (type === 'field') {
      base.field = {
        key: selectedField.key,
        maxKey: selectedField.progressMaxKey || undefined,
        label: selectedField.label,
      };
    } else if (type === 'select') {
      base.selectOptions = parsedOptions;
    }
    onSave(base);
  };

  // When a preset condition is chosen, its icon + stable key + label lock together.
  const pickPreset = (preset) => {
    setIcon(preset.icon);
    setConditionKey(preset.key);
    setConditionLabel(t(preset.labelKey));
  };

  const pickCustomIcon = (name) => {
    setIcon(name);
    // A preset key would tie this to the sheet's condition catalog; a browse pick is
    // homebrew, so mint a fresh key unless one already exists on this slot.
    if (!conditionKey || presetConditions.some(p => p.key === conditionKey)) {
      setConditionKey(makeConditionKey());
    }
  };

  const titleLabel = isSquare
    ? t('creator.tokenDisplay.squares.configTitle')
    : t('creator.tokenDisplay.slot.configTitle', { position: positionLabel });

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth
      PaperProps={{ sx: { background: 'linear-gradient(135deg, #f4e8d8 0%, #e8dcc4 100%)', border: '1.5px solid #7a5c42' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#3a2f1f', fontFamily: 'Cinzel, serif' }}>
        {titleLabel}
        <IconButton onClick={onCancel} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <TextField
          select fullWidth variant="outlined" size="small" margin="dense"
          label={t('creator.tokenDisplay.slot.typeLabel')}
          value={type}
          onChange={e => setType(e.target.value)}
          sx={{ mb: 2 }}
        >
          {allowedTypes.map(tp => (
            <MenuItem key={tp} value={tp}>{t(`creator.tokenDisplay.slot.type_${tp}`)}</MenuItem>
          ))}
        </TextField>

        {isSquare && (
          <TextField
            fullWidth variant="outlined" size="small" margin="dense"
            label={t('creator.tokenDisplay.squares.captionLabel')}
            value={caption}
            onChange={e => setCaption(e.target.value)}
            sx={{ mb: 2 }}
          />
        )}

        {type === 'icon' && (
          <Box>
            {presetConditions.length > 0 && (
              <>
                <Typography sx={{ fontSize: '0.8rem', color: '#7a5c42', mb: 0.5 }}>
                  {t('creator.tokenDisplay.slot.iconPresets')}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
                  {presetConditions.map(p => {
                    const Ico = resolveIcon(p.icon);
                    const active = icon === p.icon && conditionKey === p.key;
                    return (
                      <IconButton key={p.key} size="small" onClick={() => pickPreset(p)}
                        title={t(p.labelKey)}
                        sx={{ border: active ? '2px solid #c9975b' : '1px solid #c4a882', background: active ? 'rgba(201,151,91,0.2)' : '#fff9f0', color: '#3a2f1f' }}>
                        {Ico ? <Ico sx={{ fontSize: 18 }} /> : null}
                      </IconButton>
                    );
                  })}
                </Box>
              </>
            )}
            <Typography sx={{ fontSize: '0.8rem', color: '#7a5c42', mb: 0.5 }}>
              {t('creator.tokenDisplay.slot.iconBrowseAll')}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxHeight: 140, overflowY: 'auto', mb: 1.5 }}>
              {Object.keys(TOKEN_ICONS).map(name => {
                const Ico = TOKEN_ICONS[name];
                const active = icon === name;
                return (
                  <IconButton key={name} size="small" onClick={() => pickCustomIcon(name)}
                    title={name}
                    sx={{ border: active ? '2px solid #c9975b' : '1px solid #c4a882', background: active ? 'rgba(201,151,91,0.2)' : '#fff9f0', color: '#3a2f1f' }}>
                    <Ico sx={{ fontSize: 18 }} />
                  </IconButton>
                );
              })}
            </Box>
            <TextField
              fullWidth variant="outlined" size="small" margin="dense"
              label={t('creator.tokenDisplay.slot.iconLabel')}
              value={conditionLabel}
              onChange={e => setConditionLabel(e.target.value)}
            />
          </Box>
        )}

        {type === 'number' && (
          <TextField
            fullWidth variant="outlined" size="small" margin="dense"
            label={t('creator.tokenDisplay.slot.numberLabel')}
            value={numberLabel}
            onChange={e => setNumberLabel(e.target.value)}
            placeholder="AP"
          />
        )}

        {type === 'field' && (
          <TextField
            select fullWidth variant="outlined" size="small" margin="dense"
            label={t('creator.tokenDisplay.slot.fieldLabel')}
            value={fieldKey}
            onChange={e => setFieldKey(e.target.value)}
          >
            <MenuItem disabled value=""><em>{t('creator.tokenDisplay.slot.fieldGroupAttributes')}</em></MenuItem>
            {fieldOptions.filter(f => f.category === 'attribute').map(f => (
              <MenuItem key={f.key} value={f.key}>{f.label}</MenuItem>
            ))}
            <MenuItem disabled value=""><em>{t('creator.tokenDisplay.slot.fieldGroupNumbers')}</em></MenuItem>
            {fieldOptions.filter(f => f.category === 'number').map(f => (
              <MenuItem key={f.key} value={f.key}>{f.label}</MenuItem>
            ))}
          </TextField>
        )}

        {type === 'select' && (
          <Box>
            <TextField
              fullWidth variant="outlined" size="small" margin="dense"
              label={t('creator.tokenDisplay.slot.selectOptionsLabel')}
              helperText={t('creator.tokenDisplay.slot.selectOptionsHint')}
              value={selectOptions}
              onChange={e => setSelectOptions(e.target.value)}
              placeholder="opt1,opt2,opt3"
            />
            {parsedOptions.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                {parsedOptions.map((o, i) => (
                  <Box key={i} sx={{ px: 1, py: 0.25, border: '1px solid #c4a882', borderRadius: 1, background: '#fff9f0', fontSize: '0.8rem', color: '#3a2f1f' }}>{o}</Box>
                ))}
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} sx={{ color: '#7a5c42' }}>{t('common.cancel')}</Button>
        <Button onClick={handleSave} disabled={!canSave} variant="contained"
          sx={{ background: '#7a5c42', '&:hover': { background: '#5a4230' } }}>
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
