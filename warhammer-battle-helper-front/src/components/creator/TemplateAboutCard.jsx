import React from 'react';
import { useTranslation } from 'react-i18next';
import { MenuItem, TextField, Typography } from '@mui/material';
import RichTextEditor from '../common/richText/RichTextEditor';
import { TEMPLATE_LANGUAGES } from '../../utils/templateLanguages';

// The template's lobby face: what players read before picking it, and the language the
// create-game filter matches on.
function TemplateAboutCard({ description, language, onChange }) {
  const { t } = useTranslation();
  return (
    <div className="creator__settings-card creator__settings-card--about">
      <div className="creator__settings-card-header">
        <span className="creator__settings-card-title">{t('creator.about.title')}</span>
        <span className="creator__settings-card-hint">{t('creator.about.hint')}</span>
      </div>
      <div className="creator__settings-card-body">
        <TextField select size="small" label={t('creator.about.language')} value={language}
          onChange={e => onChange({ language: e.target.value })}
          SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 240, mb: 1 }}>
          <MenuItem value="">{t('languages.unspecified')}</MenuItem>
          {TEMPLATE_LANGUAGES.map(code => <MenuItem key={code} value={code}>{t(`languages.${code}`)}</MenuItem>)}
        </TextField>
        {!language && (
          <Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.85rem', color: 'text.secondary', mb: 1 }}>
            {t('creator.about.languageMissing')}
          </Typography>
        )}
        <Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.9rem', color: '#7a5c42', mb: 0.5 }}>
          {t('creator.about.description')}
        </Typography>
        <RichTextEditor className="creator__about-editor" value={description} onChange={html => onChange({ description: html })} />
      </div>
    </div>
  );
}

export default TemplateAboutCard;
