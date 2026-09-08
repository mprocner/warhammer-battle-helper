import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ModifierPresetEditor from './ModifierPresetEditor';
import {
  DEFAULT_MODIFIER_CONFIG,
  MOD_TARGET_ROLL,
  MOD_TARGET_THRESHOLD,
  MOD_TARGET_DICE_COUNT,
  MOD_TARGET_SUCCESS_THRESHOLD,
} from '../../systems/custom/modifierConfig';

// Podpowiedzi mówią wprost, co się stanie z liczbami — zamiast normalizować znak modyfikatora
// tak, żeby "+" zawsze znaczyło "łatwiej". Normalizacja jest niewykonalna spójnie: przy targecie
// "threshold" plus ułatwia rzut roll-under i utrudnia roll-over, a successType jest ustawiany per
// pole, nie tutaj (patrz D4 w spec).
const TRADITIONAL_HINTS = {
  [MOD_TARGET_ROLL]: 'creator.modifier.hintRoll',
  [MOD_TARGET_THRESHOLD]: 'creator.modifier.hintThreshold',
};
const POOL_HINTS = {
  [MOD_TARGET_DICE_COUNT]: 'creator.modifier.hintDiceCount',
  [MOD_TARGET_SUCCESS_THRESHOLD]: 'creator.modifier.hintSuccessThreshold',
};

function ModifierConfigBuilder({ value, onChange }) {
  const { t } = useTranslation();
  // Pusta konfiguracja czytana jest jako domyślna, wyłączona — kreator nie musi jej zawczasu
  // tworzyć w settings, a onChange zawsze oddaje pełny obiekt.
  const cfg = { ...DEFAULT_MODIFIER_CONFIG, ...(value || {}) };
  const up = patch => onChange({ ...cfg, ...patch });

  // min/max naprawdę przyjmują wartości ujemne (GM ustawia np. min: -60), więc te dwa pola nie
  // mogą robić `parseInt(...) || 0` na każde naciśnięcie klawisza — to dokładnie bug z Tasku 11
  // (ModifierPresetEditor): jsdom/przeglądarka dostarcza wartość liczbowego inputu znak po znaku,
  // a sam "-" nie parsuje się do liczby, więc `|| 0` kasowałby minus, zanim GM zdąży dopisać
  // cyfry. Draft trzyma nieparsowalny string, dopóki pole jest edytowane; onChange leci tylko dla
  // parsowalnych wartości, a blur domyka to, co zostało nieparsowalne, jako 0.
  // `step` dostaje ten sam mechanizm mimo że ujemny krok nie ma sensu — defekt nie jest tylko o
  // znaku minusa: `parseInt('') || 1` też odpala się na pustym stringu, więc czyszczenie pola do
  // przepisania go od nowa zatrzaskiwało wartość na 1 w połowie edycji.
  const [draft, setDraft] = useState(null); // { field: 'step'|'min'|'max', raw: string } | null

  // step wraca do 1, a nie do 0: input ze step === 0 nie reaguje na strzałki, i to samo 1
  // podstawia readModifierConfig po stronie karty.
  const LIMIT_FALLBACK = { step: 1, min: 0, max: 0 };

  const limitValue = field => (draft && draft.field === field ? draft.raw : String(cfg[field]));

  const handleLimitChange = (field, raw) => {
    setDraft({ field, raw });
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed)) up({ [field]: parsed });
  };

  const handleLimitBlur = field => {
    if (draft && draft.field === field && Number.isNaN(parseInt(draft.raw, 10))) {
      up({ [field]: LIMIT_FALLBACK[field] });
    }
    setDraft(null);
  };

  return (
    <div className="mcb__root">
      <label className="mcb__enable">
        <input
          type="checkbox"
          data-testid="mcb-enable"
          checked={cfg.enabled}
          onChange={e => { setDraft(null); up({ enabled: e.target.checked }); }}
        />
        <span>{t('creator.modifier.enable')}</span>
      </label>

      {!cfg.enabled ? (
        <div className="mcb__disabled-hint">{t('creator.modifier.disabledHint')}</div>
      ) : (
        <>
          <div className="mcb__field">
            <label className="mcb__label" htmlFor="mcb-traditional-target">
              {t('creator.modifier.traditionalTarget')}
            </label>
            <select
              id="mcb-traditional-target"
              data-testid="mcb-traditional-target"
              className="mcb__select"
              value={cfg.traditionalTarget}
              onChange={e => up({ traditionalTarget: e.target.value })}
            >
              <option value={MOD_TARGET_ROLL}>{t('creator.modifier.targetRoll')}</option>
              <option value={MOD_TARGET_THRESHOLD}>{t('creator.modifier.targetThreshold')}</option>
            </select>
            <div className="mcb__hint" data-testid="mcb-traditional-hint">
              {t(TRADITIONAL_HINTS[cfg.traditionalTarget] || TRADITIONAL_HINTS[MOD_TARGET_ROLL])}
            </div>
          </div>

          <div className="mcb__field">
            <label className="mcb__label" htmlFor="mcb-pool-target">
              {t('creator.modifier.poolTarget')}
            </label>
            <select
              id="mcb-pool-target"
              data-testid="mcb-pool-target"
              className="mcb__select"
              value={cfg.poolTarget}
              onChange={e => up({ poolTarget: e.target.value })}
            >
              <option value={MOD_TARGET_DICE_COUNT}>{t('creator.modifier.targetDiceCount')}</option>
              <option value={MOD_TARGET_SUCCESS_THRESHOLD}>{t('creator.modifier.targetSuccessThreshold')}</option>
            </select>
            <div className="mcb__hint" data-testid="mcb-pool-hint">
              {t(POOL_HINTS[cfg.poolTarget] || POOL_HINTS[MOD_TARGET_DICE_COUNT])}
            </div>
          </div>

          <div className="mcb__limits">
            <div className="mcb__limit">
              <label className="mcb__label" htmlFor="mcb-step">{t('creator.modifier.step')}</label>
              <input id="mcb-step" data-testid="mcb-step" type="number" min={1}
                     value={limitValue('step')}
                     onChange={e => handleLimitChange('step', e.target.value)}
                     onBlur={() => handleLimitBlur('step')} />
            </div>
            <div className="mcb__limit">
              <label className="mcb__label" htmlFor="mcb-min">{t('creator.modifier.min')}</label>
              <input id="mcb-min" data-testid="mcb-min" type="number" value={limitValue('min')}
                     onChange={e => handleLimitChange('min', e.target.value)}
                     onBlur={() => handleLimitBlur('min')} />
            </div>
            <div className="mcb__limit">
              <label className="mcb__label" htmlFor="mcb-max">{t('creator.modifier.max')}</label>
              <input id="mcb-max" data-testid="mcb-max" type="number" value={limitValue('max')}
                     onChange={e => handleLimitChange('max', e.target.value)}
                     onBlur={() => handleLimitBlur('max')} />
            </div>
          </div>
          <div className="mcb__hint">{t('creator.modifier.limitsHint')}</div>

          <div className="mcb__field">
            <span className="mcb__label">{t('creator.modifier.presetsTitle')}</span>
            <ModifierPresetEditor presets={cfg.presets} onChange={presets => up({ presets })} />
          </div>
        </>
      )}
    </div>
  );
}

export default ModifierConfigBuilder;
