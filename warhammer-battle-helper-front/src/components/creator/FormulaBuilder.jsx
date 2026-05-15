import React, { useState } from 'react';

// ── helpers ───────────────────────────────────────────────────────────────────

const OP_DISPLAY = { '+': '+', '-': '−', '*': '×', '/': '÷' };
const DICE_VALUES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

function makeId() {
  return `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

const BLOCK_IS_VALUE = b => b.type !== 'op';

// ── exports ───────────────────────────────────────────────────────────────────

export function validateFormula(blocks, numberFields) {
  if (!blocks || blocks.length === 0) return { valid: false, error: 'Formuła jest pusta' };

  const knownKeys = new Set((numberFields || []).map(f => f.key));

  if (!BLOCK_IS_VALUE(blocks[0]))
    return { valid: false, error: 'Formuła nie może zaczynać się od operatora' };
  if (!BLOCK_IS_VALUE(blocks[blocks.length - 1]))
    return { valid: false, error: 'Formuła nie może kończyć się operatorem' };

  for (let i = 0; i < blocks.length - 1; i++) {
    const a = blocks[i], b = blocks[i + 1];
    if (!BLOCK_IS_VALUE(a) && !BLOCK_IS_VALUE(b))
      return { valid: false, error: 'Dwa operatory pod rząd' };
    if (BLOCK_IS_VALUE(a) && BLOCK_IS_VALUE(b))
      return { valid: false, error: 'Brak operatora między wartościami' };
  }

  for (const b of blocks) {
    if ((b.type === 'attr' || b.type === 'dice_attr') && !knownKeys.has(b.key))
      return { valid: false, error: `Atrybut "${b.label || b.key}" nie istnieje w szablonie` };
  }

  return { valid: true, error: null };
}

export function formulaToString(blocks) {
  if (!blocks || blocks.length === 0) return '—';
  return blocks.map(b => {
    if (b.type === 'dice')           return `⚄${b.value}`;
    if (b.type === 'dice_attr')      return `⚄(${b.label || b.key})`;
    if (b.type === 'dice_skill_attr') return '⚄(attr+umiej.)';
    if (b.type === 'op')             return ` ${OP_DISPLAY[b.value] || b.value} `;
    if (b.type === 'attr')           return b.label || b.key;
    if (b.type === 'skill')          return 'umiej.';
    if (b.type === 'attr_linked')    return 'attr.pow.';
    if (b.type === 'const')          return String(b.num ?? b.value ?? '?');
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

function blockLabel(b) {
  if (b.type === 'dice')           return `⚄ ${b.value}`;
  if (b.type === 'dice_attr')      return `⚄ ${b.label || b.key}`;
  if (b.type === 'dice_skill_attr') return '⚄ Attr+Umiej.';
  if (b.type === 'op')             return OP_DISPLAY[b.value] || b.value;
  if (b.type === 'attr')           return b.label || b.key;
  if (b.type === 'skill')          return 'Umiej.';
  if (b.type === 'attr_linked')    return 'Attr. pow.';
  if (b.type === 'const')          return String(b.num ?? b.value ?? '?');
  return '?';
}

// ── FormulaBuilder ────────────────────────────────────────────────────────────

function FormulaBuilder({ formula, onChange, numberFields }) {
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

  return (
    <div className="fb__root">

      {/* ── Tor formuły ───────────────────────────────────────────────────── */}
      <div className="fb__track">
        <div className="fb__track-header">
          <span className="fb__track-label">Formuła rzutu</span>
          {blocks.length > 0 && (
            <button className="fb__track-clear" onClick={clear}>✕ Wyczyść</button>
          )}
        </div>

        <div className="fb__track-body">
          {blocks.length === 0 ? (
            <span className="fb__track-empty">Kliknij bloki poniżej, aby zbudować formułę…</span>
          ) : blocks.map(b => (
            <div key={b.id} className={`fb__block ${BLOCK_CLASS[b.type] || ''}`}>
              <span className="fb__block-label">{blockLabel(b)}</span>
              <button className="fb__block-remove" onClick={() => remove(b.id)} title="Usuń blok">✕</button>
            </div>
          ))}
        </div>

        <div className={`fb__track-preview${blocks.length > 0 && !validation.valid ? ' fb__track-preview--err' : ''}`}>
          {blocks.length === 0 ? (
            <span className="fb__preview-hint">Wynik = —</span>
          ) : validation.valid ? (
            <><span className="fb__preview-ok">✓</span> Wynik = <em>{formulaToString(blocks)}</em></>
          ) : (
            <><span className="fb__preview-err">⚠</span> {validation.error}</>
          )}
        </div>
      </div>

      {/* ── Kości ─────────────────────────────────────────────────────────── */}
      <div className="fb__section">
        <div className="fb__section-header">
          <span className="fb__section-title">Kości</span>
          <span className="fb__section-hint">kliknij, aby dodać</span>
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
                <span className="fb__dice-icon">⚄</span>=Atrybut
              </button>
            )}
            <button
              className="fb__dice-btn fb__dice-btn--skill-attr"
              onClick={() => add({ type: 'dice_skill_attr' })}
              title="Kość o liczbie ścian = wartość atrybutu + wartość umiejętności"
            >
              <span className="fb__dice-icon">⚄</span>Attr+Umiej.
            </button>
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

      {/* ── Operatory i wartości ──────────────────────────────────────────── */}
      <div className="fb__section">
        <div className="fb__section-header">
          <span className="fb__section-title">Operatory i wartości</span>
        </div>
        <div className="fb__section-body">

          <div className="fb__subsection-label">Operatory</div>
          <div className="fb__op-row">
            {['+', '-', '*', '/'].map(op => (
              <button key={op} className="fb__op-btn" onClick={() => addOp(op)}>
                {OP_DISPLAY[op]}
              </button>
            ))}
          </div>

          {numberFields.length > 0 && (
            <>
              <div className="fb__subsection-label">Atrybuty postaci</div>
              <div className="fb__attr-chips">
                {numberFields.map(f => (
                  <button key={f.key} className="fb__attr-chip" onClick={() => addAttr(f)}>
                    {f.abbr || f.label || f.key}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="fb__subsection-label">Tokeny umiejętności</div>
          <div className="fb__attr-chips">
            <button
              className="fb__attr-chip fb__attr-chip--skill"
              onClick={() => add({ type: 'skill' })}
              title="Wartość aktualnie rzucanej umiejętności"
            >
              Wartość umiejętności
            </button>
            <button
              className="fb__attr-chip fb__attr-chip--attr-linked"
              onClick={() => add({ type: 'attr_linked' })}
              title="Wartość atrybutu przypisanego do tej umiejętności"
            >
              Powiązany atrybut
            </button>
          </div>

          <div className="fb__subsection-label">Stała wartość</div>
          <div className="fb__const-row">
            <input
              type="number"
              className="fb__const-input"
              value={constDraft}
              onChange={e => setConstDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addConst(); }}
              placeholder="0"
            />
            <button className="fb__const-add" onClick={addConst}>+ Dodaj</button>
          </div>

        </div>
      </div>

    </div>
  );
}

export default FormulaBuilder;
