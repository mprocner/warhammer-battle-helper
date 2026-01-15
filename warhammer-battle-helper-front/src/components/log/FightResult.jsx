import React from 'react';
import { useTranslation } from 'react-i18next';
import WaxSealToken from './WaxSealToken';
import '../LogWindow.css';

const CombatantRoll = ({ combatant, role, t }) => {
    return (
        <li className="log-list-item" style={{ marginBottom: '5px' }}>
            <WaxSealToken
                successLevel={combatant.successLevel}
                isCritSuccess={combatant.isCritSuccess}
                isCritFailure={combatant.isCritFailure}
                isSuccess={combatant.successLevel >= 0}
            />
            <div className="log-list-item__content">
                <span className="log-list-item__character-name">
                    {combatant.characterName} ({role})
                </span>
                <div className="log-list-item__description">
                    {t('log.rolled')} <strong>{combatant.roll}</strong> {t('log.vs')} <strong>{combatant.targetValue}</strong>
                    {combatant.modifier !== 0 && (
                        <span className="log-modifier">
                            {' '}({t('log.modifier')}: {combatant.modifier >= 0 ? '+' : ''}{combatant.modifier})
                        </span>
                    )}
                </div>
            </div>
        </li>
    );
};

const FightResult = ({ data }) => {
    const { t } = useTranslation();
    const { result } = data;

    if (!result || !result.attacker || !result.defender || !result.winner) {
        return null;
    }

    const { attacker, defender, winner } = result;

    const winnerBoxClass = winner.attackerWins
        ? 'log-fight-result__winner log-fight-result__winner--attacker'
        : 'log-fight-result__winner log-fight-result__winner--defender';

    return (
        <div className="log-fight-result">
            <CombatantRoll
                combatant={attacker}
                role={t('log.attacker')}
                t={t}
            />
            <CombatantRoll
                combatant={defender}
                role={t('log.defender')}
                t={t}
            />

            <div className={winnerBoxClass}>
                <div className="log-fight-result__winner-name">
                    {winner.characterName} {t('log.wins')}
                </div>
                {winner.attackerWins ? (
                    <div className="log-fight-result__damage">
                        {t('log.hitsWith')} <strong>{winner.weaponName}</strong> {t('log.for')}{' '}
                        <strong className="log-fight-result__damage-value">{winner.damage}</strong> {t('log.damage')}
                        <br/>
                        <span className="log-fight-result__details">
                            ({t('log.sl')}: {winner.netSuccessLevel}, {t('log.sb')}: {winner.strengthBonus}, {t('log.weapon')}: {winner.weaponDamage})
                        </span>
                    </div>
                ) : (
                    <div className="log-fight-result__damage">
                        {t('log.successfullyDefends')}
                    </div>
                )}
            </div>
        </div>
    );
};

export default FightResult;
