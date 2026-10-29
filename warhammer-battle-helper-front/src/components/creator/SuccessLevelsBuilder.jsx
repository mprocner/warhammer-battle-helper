import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { genId } from '../../utils/surrogateKeys';
import {
  SL_MODE_OFF, SL_MODE_TENS, SL_MODE_TIERS, DEFAULT_SL_STEP, MAX_SL_STEP, MAX_TIER_LABEL,
  MIN_TIER_DIVISOR, MAX_TIER_DIVISOR, SL_COLORS,
  tensLevel, defaultTiers, sortTiers, freeDivisor, isDivisorValid,
} from '../../systems/custom/successLevels';

const MODES = [SL_MODE_OFF, SL_MODE_TENS, SL_MODE_TIERS];
const MODE_KEYS = { [SL_MODE_OFF]: 'off', [SL_MODE_TENS]: 'tens', [SL_MODE_TIERS]: 'tiers' };
const EXAMPLE = { target: 45, roll: 38 };
// '' reads as 0 through Number(), so the range check rejects it.
const isStepValid = raw => Number.isInteger(Number(raw)) && Number(raw) >= 1 && Number(raw) <= MAX_SL_STEP;
const EMPTY_ROW = { label: '', color: '' };

function SuccessLevelsBuilder({ value, onChange }) {
  const { t } = useTranslation();
  const cfg = { mode: SL_MODE_OFF, step: 0, success: EMPTY_ROW, failure: EMPTY_ROW, tiers: [], ...(value || {}) };
  const up = patch => onChange({ ...cfg, ...patch });

  // Numeric inputs edit a draft (same reason as ModifierConfigBuilder): the creator autosaves, so
  // an out-of-range or duplicate value must stay local until it is valid. Blur drops a bad draft.
  const [draft, setDraft] = useState(null); // { id: 'step' | tierId, raw: string } | null
  const draftOf = (id, stored) => (draft && draft.id === id ? draft.raw : String(stored));

  const setMode = mode => {
    // Re-clicking the active mode must not write a config (it would bump the template version).
    if (mode === cfg.mode) return;
    setDraft(null);
    // The fixed rows get a colour only from seeding, so a missing colour means "never seeded" —
    // a GM who cleared every name keeps their empty table instead of getting the defaults back.
    if (mode === SL_MODE_TIERS && !cfg.success.color) {
      up({ mode, ...defaultTiers(t) });
      return;
    }
    up({ mode });
  };

  const handleStepChange = raw => {
    setDraft({ id: 'step', raw });
    if (isStepValid(raw)) up({ step: Number(raw) });
  };

  const updateTier = (id, patch) => up({ tiers: cfg.tiers.map(x => (x.id === id ? { ...x, ...patch } : x)) });

  const handleDivisorChange = (id, raw) => {
    setDraft({ id, raw });
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && isDivisorValid(parsed, cfg.tiers, id)) updateTier(id, { divisor: parsed });
  };

  // Rows re-sort on blur, not per keystroke: moving the row being typed into would steal focus.
  const handleDivisorBlur = () => {
    setDraft(null);
    const sorted = sortTiers(cfg.tiers);
    if (sorted.some((x, i) => x.id !== cfg.tiers[i].id)) up({ tiers: sorted });
  };

  const addTier = () => {
    const divisor = freeDivisor(cfg.tiers);
    if (divisor === null) return;
    up({ tiers: sortTiers([...cfg.tiers, { id: genId('tier'), divisor, label: '', color: SL_COLORS.hard }]) });
  };

  const divisorDraftInvalid = draft && draft.id !== 'step'
    && !(Number.isInteger(Number(draft.raw)) && isDivisorValid(Number(draft.raw), cfg.tiers, draft.id));
  const stepDraftInvalid = draft?.id === 'step' && !isStepValid(draft.raw);

  const step = cfg.step || DEFAULT_SL_STEP;
  const exampleLevel = tensLevel(EXAMPLE.roll, EXAMPLE.target, step);

  const renderNameAndColor = (testKey, row, fallbackColor, onRowChange) => (
    <>
      <input
        type="text"
        className="slb__label"
        data-testid={`slb-label-${testKey}`}
        value={row.label || ''}
        maxLength={MAX_TIER_LABEL}
        placeholder={t('creator.successLevels.labelPlaceholder')}
        aria-label={t('creator.successLevels.label')}
        onChange={e => onRowChange({ label: e.target.value })}
      />
      <input
        type="color"
        className="slb__color"
        data-testid={`slb-color-${testKey}`}
        value={row.color || fallbackColor}
        aria-label={t('creator.successLevels.color')}
        onChange={e => onRowChange({ color: e.target.value })}
      />
    </>
  );

  return (
    <div className="slb__root">
      <div className="slb__modes" role="group" aria-label={t('creator.general.successLevelsTitle')}>
        {MODES.map(mode => (
          <button
            key={MODE_KEYS[mode]}
            type="button"
            className={`slb__mode${cfg.mode === mode ? ' slb__mode--active' : ''}`}
            data-testid={`slb-mode-${MODE_KEYS[mode]}`}
            aria-pressed={cfg.mode === mode}
            onClick={() => setMode(mode)}
          >
            {t(`creator.successLevels.mode.${MODE_KEYS[mode]}`)}
          </button>
        ))}
      </div>

      {cfg.mode === SL_MODE_OFF && <div className="slb__hint">{t('creator.successLevels.offHint')}</div>}

      {cfg.mode === SL_MODE_TENS && (
        <>
          <div className="slb__field">
            <label className="slb__field-label" htmlFor="slb-step">{t('creator.successLevels.step')}</label>
            <input
              id="slb-step"
              data-testid="slb-step"
              className={`slb__step${stepDraftInvalid ? ' slb__step--invalid' : ''}`}
              type="number"
              min={1}
              max={MAX_SL_STEP}
              value={draftOf('step', step)}
              onChange={e => handleStepChange(e.target.value)}
              onBlur={() => setDraft(null)}
            />
          </div>
          <div className="slb__hint">{t('creator.successLevels.tensHint')}</div>
          <div className="slb__example" data-testid="slb-example">
            {t('creator.successLevels.tensExample', {
              target: EXAMPLE.target,
              roll: EXAMPLE.roll,
              level: `${exampleLevel < 0 ? '−' : '+'}${Math.abs(exampleLevel)}`,
              abbr: t('customRoll.slAbbr'),
            })}
          </div>
        </>
      )}

      {cfg.mode === SL_MODE_TIERS && (
        <>
          <div className="slb__rows">
            {cfg.tiers.map(tier => (
              <div className="slb__row" key={tier.id}>
                <span className="slb__fraction">1/</span>
                <input
                  type="number"
                  className={`slb__divisor${draft?.id === tier.id && divisorDraftInvalid ? ' slb__divisor--invalid' : ''}`}
                  data-testid={`slb-divisor-${tier.id}`}
                  min={MIN_TIER_DIVISOR}
                  max={MAX_TIER_DIVISOR}
                  value={draftOf(tier.id, tier.divisor)}
                  aria-label={t('creator.successLevels.divisor')}
                  onChange={e => handleDivisorChange(tier.id, e.target.value)}
                  onBlur={handleDivisorBlur}
                />
                {renderNameAndColor(tier.id, tier, SL_COLORS.hard, patch => updateTier(tier.id, patch))}
                <button
                  type="button"
                  className="slb__remove"
                  data-testid={`slb-remove-${tier.id}`}
                  title={t('creator.successLevels.remove')}
                  aria-label={t('creator.successLevels.remove')}
                  onClick={() => up({ tiers: cfg.tiers.filter(x => x.id !== tier.id) })}
                >
                  <DeleteOutlineIcon style={{ fontSize: 16 }} />
                </button>
              </div>
            ))}
            <div className="slb__row slb__row--fixed">
              <span className="slb__fraction slb__fraction--fixed">1/1</span>
              {renderNameAndColor('success', cfg.success, SL_COLORS.success, patch => up({ success: { ...cfg.success, ...patch } }))}
              <span className="slb__remove-spacer" />
            </div>
            <div className="slb__row slb__row--fixed">
              <span className="slb__fraction slb__fraction--fixed">{t('creator.successLevels.failureRow')}</span>
              {renderNameAndColor('failure', cfg.failure, SL_COLORS.failure, patch => up({ failure: { ...cfg.failure, ...patch } }))}
              <span className="slb__remove-spacer" />
            </div>
          </div>
          {divisorDraftInvalid && <div className="slb__error">{t('creator.successLevels.divisorError')}</div>}
          <button
            type="button"
            className="slb__add"
            data-testid="slb-add"
            disabled={freeDivisor(cfg.tiers) === null}
            onClick={addTier}
          >
            <AddIcon style={{ fontSize: 15 }} /> {t('creator.successLevels.add')}
          </button>
          <div className="slb__hint">{t('creator.successLevels.tiersHint')}</div>
        </>
      )}
    </div>
  );
}

export default SuccessLevelsBuilder;
