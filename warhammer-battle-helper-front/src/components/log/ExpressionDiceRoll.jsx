import React from 'react';
import { useTranslation } from 'react-i18next';
import DiceResultToken from './DiceResultToken';
import TruncatedLabel from './TruncatedLabel';
import '../LogWindow.css';

const dieClass = (die, isPool) => [
    'expression-roll__die',
    !die.kept && 'expression-roll__die--dropped',
    isPool && die.success && 'expression-roll__die--success',
].filter(Boolean).join(' ');

// Rebuilds one term's notation for its row label: "4d6kh3", "3d10>=7" or a bare constant.
const termNotation = (term) => {
    if (!term.dice) return String(term.constant);
    let notation = `${term.count}d${term.sides}`;
    if (term.keep) notation += `${term.keep.highest ? 'kh' : 'kl'}${term.keep.count}`;
    if (term.threshold != null) notation += `>=${term.threshold}`;
    return notation;
};

// The first term never shows "+"; a negative sign is always shown (e.g. a leading constant).
const signPrefix = (term, index) => {
    if (term.sign < 0) return '−';
    return index > 0 ? '+' : '';
};

// Renders a chat dice expression the same way in every game system.
const ExpressionDiceRoll = ({ data, timestamp }) => {
    const { t } = useTranslation();
    const { expression, mode, terms = [], total, check, username } = data;
    const isPool = mode === 'pool';

    return (
        <div className="log-list-item__content">
            <div className="log-list-item__header">
                <TruncatedLabel text={username || t('log.character')} />
                {timestamp && <span className="log-list-item__timestamp">{timestamp}</span>}
            </div>
            <div className="log-list-item__description">{expression}</div>
            <div className="expression-roll__terms">
                {terms.map((term, i) => (
                    <div key={i} className="expression-roll__term">
                        <span className="expression-roll__head">
                            <span className="expression-roll__label">{signPrefix(term, i)}{termNotation(term)}</span>
                            {term.dice && <span className="expression-roll__subtotal">= {term.subtotal}</span>}
                        </span>
                        {term.dice && (
                            <span className="expression-roll__dice">
                                {term.dice.map((die, j) => (
                                    <span key={j} className={dieClass(die, isPool)}>
                                        <DiceResultToken result={die.value} sides={term.sides} colored={false} />
                                    </span>
                                ))}
                            </span>
                        )}
                    </div>
                ))}
            </div>
            <div className="log-list-item__result">
                <span className="expression-roll__total-label">{isPool ? t('log.successes') : t('log.sum')}</span>
                {': '}
                <strong className="expression-roll__total">{total}</strong>
            </div>
            {check && (
                <div className={`expression-roll__check expression-roll__check--${check.success ? 'success' : 'failure'}`}>
                    {check.success ? t('log.success') : t('log.failure')}
                    {' ('}{t('log.target')}: {check.target}{')'}
                </div>
            )}
        </div>
    );
};

export default ExpressionDiceRoll;
