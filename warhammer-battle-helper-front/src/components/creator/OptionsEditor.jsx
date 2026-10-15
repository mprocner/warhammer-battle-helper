import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';

// Plain-string options editor for "select" fields and table select-columns. The stored value IS
// the label (no stable id needed — a select stores the chosen text verbatim).
function OptionsEditor({ label, options, onChange }) {
  const { t } = useTranslation();
  const [draftLabel, setDraftLabel] = useState('');

  const commit = () => {
    if (!draftLabel.trim()) return;
    onChange([...(options || []), draftLabel.trim()]);
    setDraftLabel('');
  };

  return (
    <div className="creator__options-editor">
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>{label}</Typography>
      <div className="creator__options-list">
        {(options || []).map((opt, i) => (
          <div key={i} className="creator__option-row">
            <input className="creator__option-input" value={opt} onChange={e => {
              const n = [...options];
              n[i] = e.target.value;
              onChange(n);
            }} />
            <button className="creator__option-del" onClick={() => onChange((options || []).filter((_, j) => j !== i))}><DeleteIcon style={{ fontSize: 13 }} /></button>
          </div>
        ))}
      </div>
      <div className="creator__options-add">
        <input
          className="creator__option-input"
          value={draftLabel}
          onChange={e => setDraftLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); }}
          placeholder={t('creator.optionsAddPlaceholder')}
        />
        <button className="creator__option-add-btn" onClick={commit}>
          <AddIcon style={{ fontSize: 13 }} />
        </button>
      </div>
    </div>
  );
}

export default OptionsEditor;
