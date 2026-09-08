import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

// Edytor listy presetów modyfikatora (wartość + etykieta MG). Klucz to indeks: preset nie ma id
// w modelu (models.ModifierPreset trzyma value i label), a lista nie jest tu przestawiana —
// wiersze przychodzą i odchodzą tylko z końca albo pojedynczo.
function ModifierPresetEditor({ presets, onChange }) {
  const { t } = useTranslation();
  const list = presets || [];

  // Numer w polu żyje jako surowy string, dopóki wiersz jest edytowany. Bez tego `parseInt || 0`
  // przy każdym znaku kasuje minus, zanim GM zdąży dopisać cyfry — a ujemne presety (kary) są
  // głównym powodem, dla którego ten edytor istnieje. Ta sama zasada co draft w
  // RollModifierOverlay.jsx: string podczas pisania, liczba przy zatwierdzeniu.
  const [draft, setDraft] = useState(null); // { idx, raw } | null

  const valueOf = (idx, preset) => (draft && draft.idx === idx ? draft.raw : String(preset.value));

  const update = (idx, patch) => onChange(list.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  const remove = (idx) => {
    setDraft(null);
    onChange(list.filter((_, i) => i !== idx));
  };
  const add = () => {
    setDraft(null);
    onChange([...list, { value: 0, label: '' }]);
  };

  const handleValueChange = (idx, raw) => {
    setDraft({ idx, raw });
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed)) update(idx, { value: parsed });
  };

  // Wyjście z pola domyka wartość: to, co się nie parsuje (pusty string, sam minus), staje się 0.
  const handleValueBlur = (idx) => {
    if (draft && draft.idx === idx && Number.isNaN(parseInt(draft.raw, 10))) {
      update(idx, { value: 0 });
    }
    setDraft(null);
  };

  return (
    <div className="mpe__root">
      {list.length === 0 ? (
        <div className="mpe__empty" data-testid="mpe-empty">{t('creator.modifier.presetsEmpty')}</div>
      ) : (
        <div className="mpe__rows">
          {list.map((preset, idx) => (
            <div className="mpe__row" key={idx}>
              <input
                type="number"
                className="mpe__value"
                data-testid={`mpe-value-${idx}`}
                value={valueOf(idx, preset)}
                onChange={e => handleValueChange(idx, e.target.value)}
                onBlur={() => handleValueBlur(idx)}
                aria-label={t('creator.modifier.presetValue')}
              />
              <input
                type="text"
                className="mpe__label"
                data-testid={`mpe-label-${idx}`}
                value={preset.label || ''}
                onChange={e => update(idx, { label: e.target.value })}
                placeholder={t('creator.modifier.presetLabelPlaceholder')}
                aria-label={t('creator.modifier.presetLabel')}
              />
              <button
                type="button"
                className="mpe__remove"
                data-testid={`mpe-remove-${idx}`}
                onClick={() => remove(idx)}
                title={t('creator.modifier.presetRemove')}
                aria-label={t('creator.modifier.presetRemove')}
              >
                <DeleteOutlineIcon style={{ fontSize: 16 }} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="mpe__add" data-testid="mpe-add" onClick={add}>
        <AddIcon style={{ fontSize: 15 }} /> {t('creator.modifier.presetAdd')}
      </button>
    </div>
  );
}

export default ModifierPresetEditor;
