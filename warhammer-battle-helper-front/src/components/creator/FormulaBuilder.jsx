import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

// ── helpers ───────────────────────────────────────────────────────────────────

const OP_DISPLAY = { '+': '+', '-': '−', '*': '×', '/': '÷' };
const DICE_VALUES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

function makeId() {
  return `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

const BLOCK_IS_VALUE = b => b.type !== 'op';

// ── exports ───────────────────────────────────────────────────────────────────

// Returns { valid, errorKey, errorParams } — translate errorKey with t(errorKey, errorParams)
export function validateFormula(blocks, numberFields) {
  if (!blocks || blocks.length === 0)
    return { valid: false, errorKey: 'creator.formula.errorEmpty' };

  const knownKeys = new Set((numberFields || []).map(f => f.key));

  if (!BLOCK_IS_VALUE(blocks[0]))
    return { valid: false, errorKey: 'creator.formula.errorStartsWithOp' };
  if (!BLOCK_IS_VALUE(blocks[blocks.length - 1]))
    return { valid: false, errorKey: 'creator.formula.errorEndsWithOp' };

  for (let i = 0; i < blocks.length - 1; i++) {
    const a = blocks[i], b = blocks[i + 1];
    if (!BLOCK_IS_VALUE(a) && !BLOCK_IS_VALUE(b))
      return { valid: false, errorKey: 'creator.formula.errorTwoOps' };
    if (BLOCK_IS_VALUE(a) && BLOCK_IS_VALUE(b))
      return { valid: false, errorKey: 'creator.formula.errorNoOp' };
  }

  for (const b of blocks) {
    if ((b.type === 'attr' || b.type === 'dice_attr') && !knownKeys.has(b.key))
      return { valid: false, errorKey: 'creator.formula.errorAttrNotFound', errorParams: { label: b.label || b.key } };
  }

  return { valid: true, errorKey: null };
}

export function formulaToString(blocks, t) {
  const sk  = t ? t('creator.formula.skillAbbr')      : 'skill';
  const la  = t ? t('creator.formula.linkedAttrAbbr') : 'l.attr';
  const ask = t ? t('creator.formula.attrSkillAbbr')  : 'attr+skill';

  if (!blocks || blocks.length === 0) return '—';
  return blocks.map(b => {
    if (b.type === 'dice')            return `⚄${b.value}`;
    if (b.type === 'dice_attr')       return `⚄(${b.label || b.key})`;
    if (b.type === 'dice_skill_attr') return `⚄(${ask})`;
    if (b.type === 'op')              return ` ${OP_DISPLAY[b.value] || b.value} `;
    if (b.type === 'attr')            return b.label || b.key;
    if (b.type === 'skill')           return sk;
    if (b.type === 'attr_linked')     return la;
    if (b.type === 'const')           return String(b.num ?? b.value ?? '?');
    return '?';
  }).join('');
}

const BLOCK_CLASS = {
  dice:           'fb__block--dice',
  dice_attr:      'fb__block--dice-attr',
  dice_skill_attr:'fb__block--dice-skill-attr',
  op:             'fb__block--op',
  attr:           'fb__block--attr',
  skill:          'fb__block--skill',
  attr_linked:    'fb__block--attr-linked',
  const:          'fb__block--const',
};

// ── FormulaBuilder ────────────────────────────────────────────────────────────

function FormulaBuilder({ formula, onChange, numberFields, fieldType }) {
  const { t } = useTranslation();
  const [constDraft,   setConstDraft]   = useState('');
  const [diceAttrOpen, setDiceAttrOpen] = useState(false);
  const [diceAttrKey,  setDiceAttrKey]  = useState('');

  const blocks     = formula || [];
  const validation = validateFormula(blocks, numberFields);

  const add    = block => onChange([...blocks, { ...block, id: makeId() }]);
  const remove = id    => onChange(blocks.filter(b => b.id !== id));
  const clear  = ()   => onChange([]);

  const addDice = val => add({ type: 'dice', value: val });
  const addOp   = val => add({ type: 'op', value: val });
  const addAttr = f   => add({ type: 'attr', key: f.key, label: f.label || f.abbr || f.key });
  const addConst = () => {
    const v = parseFloat(constDraft);
    if (!isNaN(v) && constDraft !== '') { add({ type: 'const', num: v }); setConstDraft(''); }
  };
  const addDiceAttr = () => {
    const f = numberFields.find(f => f.key === diceAttrKey);
    if (f) {
      add({ type: 'dice_attr', key: f.key, label: f.label || f.abbr || f.key });
      setDiceAttrOpen(false);
      setDiceAttrKey('');
    }
  };

  const openDiceAttr = () => {
    setDiceAttrOpen(o => !o);
    if (!diceAttrKey && numberFields.length > 0) setDiceAttrKey(numberFields[0].key);
  };

  const selectedAttrLabel = (() => {
    const f = numberFields.find(f => f.key === diceAttrKey);
    return f ? (f.abbr || f.label || f.key) : '?';
  })();

  const blockLabel = (b) => {
    if (b.type === 'dice')            return `⚄ ${b.value}`;
    if (b.type === 'dice_attr')       return `⚄ ${b.label || b.key}`;
    if (b.type === 'dice_skill_attr') return `⚄ ${t('creator.formula.diceAttrSkillBtn')}`;
    if (b.type === 'op')              return OP_DISPLAY[b.value] || b.value;
    if (b.type === 'attr')            return b.label || b.key;
    if (b.type === 'skill')           return t('creator.formula.skillAbbr');
    if (b.type === 'attr_linked')     return t('creator.formula.linkedAttrAbbr');
    if (b.type === 'const')           return String(b.num ?? b.value ?? '?');
    return '?';
  };

  return (
    <div className="fb__root">

      {/* ── Formula track ─────────────────────────────────────────────────── */}
      <div className="fb__track">
        <div className="fb__track-header">
          <span className="fb__track-label">{t('creator.formula.track')}</span>
          {blocks.length > 0 && (
            <button className="fb__track-clear" onClick={clear}>{t('creator.formula.clear')}</button>
          )}
        </div>

        <div className="fb__track-body">
          {blocks.length === 0 ? (
            <span className="fb__track-empty">{t('creator.formula.empty')}</span>
          ) : blocks.map(b => (
            <div key={b.id} className={`fb__block ${BLOCK_CLASS[b.type] || ''}`}>
              <span className="fb__block-label">{blockLabel(b)}</span>
              <button className="fb__block-remove" onClick={() => remove(b.id)} title={t('creator.formula.removeBlock')}>✕</button>
            </div>
          ))}
        </div>

        <div className={`fb__track-preview${blocks.length > 0 && !validation.valid ? ' fb__track-preview--err' : ''}`}>
          {blocks.length === 0 ? (
            <span className="fb__preview-hint">{t('creator.formula.resultEmpty')}</span>
          ) : validation.valid ? (
            <><span className="fb__preview-ok">✓</span> {t('creator.formula.result')}<em>{formulaToString(blocks, t)}</em></>
          ) : (
            <><span className="fb__preview-err">⚠</span> {t(validation.errorKey, validation.errorParams)}</>
          )}
        </div>
      </div>

      {/* ── Dice ──────────────────────────────────────────────────────────── */}
      <div className="fb__section">
        <div className="fb__section-header">
          <span className="fb__section-title">{t('creator.formula.sectionDice')}</span>
          <span className="fb__section-hint">{t('creator.formula.sectionDiceHint')}</span>
        </div>
        <div className="fb__section-body">
          <div className="fb__dice-row">
            {DICE_VALUES.map(d => (
              <button key={d} className="fb__dice-btn" onClick={() => addDice(d)}>
                <span className="fb__dice-icon">⚄</span>{d}
              </button>
            ))}
            {numberFields.length > 0 && (
              <button
                className={`fb__dice-btn fb__dice-btn--attr${diceAttrOpen ? ' fb__dice-btn--attr-open' : ''}`}
                onClick={openDiceAttr}
              >
                <span className="fb__dice-icon">⚄</span>{t('creator.formula.diceAttrBtn')}
              </button>
            )}
            {fieldType !== 'attr' && (
              <button
                className="fb__dice-btn fb__dice-btn--skill-attr"
                onClick={() => add({ type: 'dice_skill_attr' })}
                title={t('creator.formula.diceAttrSkillTitle')}
              >
                <span className="fb__dice-icon">⚄</span>{t('creator.formula.diceAttrSkillBtn')}
              </button>
            )}
          </div>

          {diceAttrOpen && (
            <div className="fb__dice-attr-picker">
              <select
                className="fb__dice-attr-select"
                value={diceAttrKey}
                onChange={e => setDiceAttrKey(e.target.value)}
              >
                {numberFields.map(f => (
                  <option key={f.key} value={f.key}>
                    {f.label || f.key}{f.abbr ? ` (${f.abbr})` : ''}
                  </option>
                ))}
              </select>
              <button className="fb__dice-attr-add" onClick={addDiceAttr}>
                + ⚄={selectedAttrLabel}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Operators & values ────────────────────────────────────────────── */}
      <div className="fb__section">
        <div className="fb__section-header">
          <span className="fb__section-title">{t('creator.formula.sectionOpsValues')}</span>
        </div>
        <div className="fb__section-body">

          <div className="fb__subsection-label">{t('creator.formula.subsectionOps')}</div>
          <div className="fb__op-row">
            {['+', '-', '*', '/'].map(op => (
              <button key={op} className="fb__op-btn" onClick={() => addOp(op)}>
                {OP_DISPLAY[op]}
              </button>
            ))}
          </div>

          {numberFields.length > 0 && (
            <>
              <div className="fb__subsection-label">{t('creator.formula.subsectionAttrs')}</div>
              <div className="fb__attr-chips">
                {numberFields.map(f => (
                  <button key={f.key} className="fb__attr-chip" onClick={() => addAttr(f)}>
                    {f.abbr || f.label || f.key}
                  </button>
                ))}
              </div>
            </>
          )}

          {fieldType !== 'attr' && (
            <>
              <div className="fb__subsection-label">{t('creator.formula.subsectionSkillTokens')}</div>
              <div className="fb__attr-chips">
                <button
                  className="fb__attr-chip fb__attr-chip--skill"
                  onClick={() => add({ type: 'skill' })}
                  title={t('creator.formula.skillValueTitle')}
                >
                  {t('creator.formula.skillValueBtn')}
                </button>
                <button
                  className="fb__attr-chip fb__attr-chip--attr-linked"
                  onClick={() => add({ type: 'attr_linked' })}
                  title={t('creator.formula.linkedAttrTitle')}
                >
                  {t('creator.formula.linkedAttrBtn')}
                </button>
              </div>
            </>
          )}

          <div className="fb__subsection-label">{t('creator.formula.subsectionConst')}</div>
          <div className="fb__const-row">
            <input
              type="number"
              className="fb__const-input"
              value={constDraft}
              onChange={e => setConstDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addConst(); }}
              placeholder="0"
            />
            <button className="fb__const-add" onClick={addConst}>{t('creator.formula.addConst')}</button>
          </div>

        </div>
      </div>

    </div>
  );
}

export default FormulaBuilder;
