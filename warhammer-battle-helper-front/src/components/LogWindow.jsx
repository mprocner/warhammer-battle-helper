import React, {useEffect, useRef, useState} from 'react';
import { getApiUrl, getApiHeaders } from '../api/axios';
import { useTranslation } from 'react-i18next';
import {
    Paper,
    Box,
    Typography,
    List,
    ListItem,
    ListItemText,
    Button,
    TextField,
    Stack
} from '@mui/material';
import {
    Info as InfoIcon,
    CheckCircle as SuccessIcon,
    Warning as WarningIcon,
    Error as ErrorIcon
} from '@mui/icons-material';

// Component for rendering Wax Seal Token
const WaxSealToken = ({ successLevel, isCritSuccess, isCritFailure, isSuccess }) => {
    return (
        <Box
            className="seal"
            sx={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: '"Cinzel", serif',
                fontWeight: 700,
                fontSize: '18px',
                flexShrink: 0,
                color: '#fff',
                ...(isCritSuccess && {
                    background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.5), transparent 60%), radial-gradient(circle at 50% 50%, #d4af37, #b8941f)',
                    border: '3px solid #8b6914',
                    boxShadow: '0 3px 6px rgba(0,0,0,0.2), inset 0 -2px 4px rgba(0,0,0,0.2), inset 0 2px 4px rgba(255,255,255,0.4), 0 0 15px rgba(212, 175, 55, 0.5)'
                }),
                ...(isCritFailure && {
                    background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.3), transparent 60%), radial-gradient(circle at 50% 50%, #8b2424, #6b1818)',
                    border: '3px solid #4a0f0f',
                    color: '#ffcccc',
                    boxShadow: '0 3px 6px rgba(0,0,0,0.3), inset 0 -2px 4px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.2), 0 0 10px rgba(139, 36, 36, 0.4)'
                }),
                ...(isSuccess && !isCritSuccess && {
                    background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.4), transparent 60%), radial-gradient(circle at 50% 50%, #7a9a6a, #5a7a4a)',
                    border: '3px solid #4a5a3a',
                    boxShadow: '0 3px 6px rgba(0,0,0,0.2), inset 0 -2px 4px rgba(0,0,0,0.2), inset 0 2px 4px rgba(255,255,255,0.4)'
                }),
                ...(!isSuccess && !isCritFailure && {
                    background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.4), transparent 60%), radial-gradient(circle at 50% 50%, #c94444, #a93434)',
                    border: '3px solid #8b2424',
                    boxShadow: '0 3px 6px rgba(0,0,0,0.2), inset 0 -2px 4px rgba(0,0,0,0.2), inset 0 2px 4px rgba(255,255,255,0.4)'
                })
            }}
        >
            {successLevel >= 0 ? '+' : ''}{successLevel}
        </Box>
    );
};

// Render simple dice roll (d6, d10, d100, etc.)
const RenderSimpleDiceRoll = ({ data, timestamp }) => {
    const { t } = useTranslation();
    const result = data.result;
    const sides = data.sides;
    const username = data.username;

    // Determine special roll status (for d100 or any dice)
    const isNatural1 = result === 1;
    const isNatural100 = result === sides && sides >= 100;
    const isLowSpecial = result >= 2 && result <= 5;
    const isHighSpecial = result >= 96 && result <= (sides - 1) && sides >= 100;

    // Get seal styling based on roll result
    const getSealStyle = () => {
        if (isNatural1) {
            // Natural 1 - Gold (best possible)
            return {
                background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.5), transparent 60%), radial-gradient(circle at 50% 50%, #d4af37, #b8941f)',
                border: '3px solid #8b6914',
                boxShadow: '0 3px 6px rgba(0,0,0,0.2), inset 0 -2px 4px rgba(0,0,0,0.2), inset 0 2px 4px rgba(255,255,255,0.4), 0 0 15px rgba(212, 175, 55, 0.5)',
                color: '#fff'
            };
        }
        if (isNatural100) {
            // Natural 100 - Dark red (worst possible)
            return {
                background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.3), transparent 60%), radial-gradient(circle at 50% 50%, #8b2424, #6b1818)',
                border: '3px solid #4a0f0f',
                boxShadow: '0 3px 6px rgba(0,0,0,0.3), inset 0 -2px 4px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.2), 0 0 10px rgba(139, 36, 36, 0.4)',
                color: '#ffcccc'
            };
        }
        if (isLowSpecial) {
            // Rolls 2-5 - Green (very good)
            return {
                background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.4), transparent 60%), radial-gradient(circle at 50% 50%, #7a9a6a, #5a7a4a)',
                border: '3px solid #4a5a3a',
                boxShadow: '0 3px 6px rgba(0,0,0,0.2), inset 0 -2px 4px rgba(0,0,0,0.2), inset 0 2px 4px rgba(255,255,255,0.4)',
                color: '#fff'
            };
        }
        if (isHighSpecial) {
            // Rolls 96-99 - Red (bad)
            return {
                background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.4), transparent 60%), radial-gradient(circle at 50% 50%, #c94444, #a93434)',
                border: '3px solid #8b2424',
                boxShadow: '0 3px 6px rgba(0,0,0,0.2), inset 0 -2px 4px rgba(0,0,0,0.2), inset 0 2px 4px rgba(255,255,255,0.4)',
                color: '#fff'
            };
        }
        // Normal rolls - Neutral gray/brown
        return {
            background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.4), transparent 60%), radial-gradient(circle at 50% 50%, #8a7d6a, #6a5d4a)',
            border: '3px solid #5a4d3a',
            boxShadow: '0 3px 6px rgba(0,0,0,0.2), inset 0 -2px 4px rgba(0,0,0,0.2), inset 0 2px 4px rgba(255,255,255,0.4)',
            color: '#fff'
        };
    };

    const sealStyle = getSealStyle();

    return (
        <ListItem
            sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '10px',
                mb: '10px',
                background: 'rgba(255, 255, 255, 0.4)',
                border: '1px solid #c9975b',
                borderRadius: 0
            }}
        >
            {/* Dice result display - circular like Wax Seal Token */}
            <Box
                sx={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: '"Cinzel", serif',
                    fontWeight: 700,
                    fontSize: result >= 100 ? '14px' : '16px',
                    flexShrink: 0,
                    ...sealStyle
                }}
            >
                {result}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: '4px' }}>
                    <Typography sx={{ fontFamily: '"Cinzel", serif', fontWeight: 600, color: '#6b4423', fontSize: '13px' }}>
                        {username || t('log.character')}
                    </Typography>
                    {timestamp && (
                        <Typography sx={{ fontSize: '10px', color: '#7a5c42' }}>
                            {timestamp}
                        </Typography>
                    )}
                </Box>
                <Typography sx={{ fontSize: '12px', color: '#7a5c42' }}>
                    {t('log.rolledDice', { sides, result })}
                </Typography>
            </Box>
        </ListItem>
    );
};

// Render attribute/characteristic roll
const RenderAttributeRoll = ({ data, timestamp }) => {
    const { t } = useTranslation();
    console.log('RenderAttributeRoll data:', data);
    const rollValue = data.result;
    const targetValue = data.attributeValue;
    const successLevel = Math.floor(targetValue / 10) - Math.floor(rollValue / 10);
    const isSuccess = rollValue <= targetValue;
    const isCritSuccess = rollValue <= 5 && isSuccess;
    const isCritFailure = rollValue >= 96 && !isSuccess;

    // Translate attribute short name (WS -> WW in Polish, etc.)
    const attributeName = t(`attributeShort.${data.attribute}`, { defaultValue: data.attribute });

    const getColor = () => {
        if (isCritSuccess) return '#b8941f';
        if (isCritFailure) return '#8b2424';
        return isSuccess ? '#4a7c59' : '#c94444';
    };

    return (
        <ListItem
            sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '10px',
                mb: '10px',
                background: 'rgba(255, 255, 255, 0.4)',
                border: '1px solid #c9975b',
                borderRadius: 0
            }}
        >
            <WaxSealToken
                successLevel={successLevel}
                isCritSuccess={isCritSuccess}
                isCritFailure={isCritFailure}
                isSuccess={isSuccess}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: '4px' }}>
                    <Typography sx={{ fontFamily: '"Cinzel", serif', fontWeight: 600, color: '#6b4423', fontSize: '13px' }}>
                        {data.characterName || t('log.character')}
                    </Typography>
                    {timestamp && (
                        <Typography sx={{ fontSize: '10px', color: '#7a5c42' }}>
                            {timestamp}
                        </Typography>
                    )}
                </Box>
                <Typography sx={{ fontSize: '12px', color: '#7a5c42', mb: '6px' }}>
                    <strong style={{ fontFamily: '"Cinzel", serif', color: '#6b4423' }}>{attributeName}</strong> {t('log.test')}: {t('log.rolled')}{' '}
                    <strong style={{ fontFamily: '"Cinzel", serif', fontSize: '14px', color: getColor() }}>{rollValue}</strong> {t('log.vs')}{' '}
                    <strong style={{ fontFamily: '"Cinzel", serif', fontSize: '14px', color: getColor() }}>{targetValue}</strong>
                    {data.attributeModifier !== 0 && (
                        <span style={{ fontSize: '11px', color: '#8a7355' }}>
                            {' '}({t('log.modifier')}: {data.attributeModifier >= 0 ? '+' : ''}{data.attributeModifier})
                        </span>
                    )}
                </Typography>
                <Typography sx={{
                    mt: '6px',
                    pt: '6px',
                    borderTop: '1px dashed #c9975b',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: getColor()
                }}>
                    {isCritSuccess ? t('log.criticalSuccess') :
                     isCritFailure ? t('log.fumble') :
                     isSuccess ? t('log.success') : t('log.failure')}
                </Typography>
            </Box>
        </ListItem>
    );
};

// Render skill roll
const RenderSkillRoll = ({ data, timestamp }) => {
    const { t } = useTranslation();
    const { success, SL, rollValue, targetValue, modifier, characterName, skillKey } = data;
    const isCritSuccess = rollValue <= 5 && success;
    const isCritFailure = rollValue >= 96 && !success;

    // Translate skill name - handle compound keys like MELEE_BASIC
    const getSkillName = () => {
        if (!skillKey) return t('log.skill');

        // Try full key first (e.g., MELEE_BASIC)
        const fullTranslation = t(`skills.${skillKey}`, { defaultValue: '' });
        if (fullTranslation) return fullTranslation;

        // Try parent key (e.g., MELEE from MELEE_BASIC)
        const parts = skillKey.split('_');
        const parentKey = parts[0];
        const parentTranslation = t(`skills.${parentKey}`, { defaultValue: '' });

        if (parentTranslation && parts.length > 1) {
            // Format suffix (e.g., BASIC -> Basic)
            const suffix = parts.slice(1).map(p => p.charAt(0) + p.slice(1).toLowerCase()).join(' ');
            return `${parentTranslation} (${suffix})`;
        }

        if (parentTranslation) return parentTranslation;

        // Fallback: format the key nicely
        return skillKey.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ');
    };

    const skillName = getSkillName();

    const getColor = () => {
        if (isCritSuccess) return '#b8941f';
        if (isCritFailure) return '#8b2424';
        return success ? '#4a7c59' : '#c94444';
    };

    return (
        <ListItem
            sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '10px',
                mb: '10px',
                background: 'rgba(255, 255, 255, 0.4)',
                border: '1px solid #c9975b',
                borderRadius: 0
            }}
        >
            <WaxSealToken
                successLevel={SL}
                isCritSuccess={isCritSuccess}
                isCritFailure={isCritFailure}
                isSuccess={success}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: '4px' }}>
                    <Typography sx={{ fontFamily: '"Cinzel", serif', fontWeight: 600, color: '#6b4423', fontSize: '13px' }}>
                        {characterName || t('log.character')}
                    </Typography>
                    {timestamp && (
                        <Typography sx={{ fontSize: '10px', color: '#7a5c42' }}>
                            {timestamp}
                        </Typography>
                    )}
                </Box>
                <Typography sx={{ fontSize: '12px', color: '#7a5c42', mb: '6px' }}>
                    <strong style={{ fontFamily: '"Cinzel", serif', color: '#6b4423' }}>{skillName}</strong> {t('log.test')}: {t('log.rolled')}{' '}
                    <strong style={{ fontFamily: '"Cinzel", serif', fontSize: '14px', color: getColor() }}>{rollValue}</strong> {t('log.vs')}{' '}
                    <strong style={{ fontFamily: '"Cinzel", serif', fontSize: '14px', color: getColor() }}>{targetValue}</strong>
                    {modifier !== 0 && (
                        <span style={{ fontSize: '11px', color: '#8a7355' }}>
                            {' '}({t('log.modifier')}: {modifier >= 0 ? '+' : ''}{modifier})
                        </span>
                    )}
                </Typography>
                <Typography sx={{
                    mt: '6px',
                    pt: '6px',
                    borderTop: '1px dashed #c9975b',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: getColor()
                }}>
                    {isCritSuccess ? t('log.criticalSuccess') :
                     isCritFailure ? t('log.fumble') :
                     success ? t('log.success') : t('log.failure')}
                </Typography>
            </Box>
        </ListItem>
    );
};

// Render fight result
const RenderFightResult = ({ data, timestamp }) => {
    const { t } = useTranslation();
    console.log('RenderFightResult data:', data);
    const { result } = data;
    console.log('RenderFightResult result:', result);

    if (!result || !result.attacker || !result.defender || !result.winner) {
        console.log('RenderFightResult: Missing data', { result, hasAttacker: !!result?.attacker, hasDefender: !!result?.defender, hasWinner: !!result?.winner });
        return null;
    }

    const { attacker, defender, winner } = result;
    console.log('RenderFightResult attacker:', attacker);

    return (
        <Box sx={{ mb: '10px' }}>
            {/* Attacker Roll */}
            <ListItem sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '10px',
                mb: '5px',
                background: 'rgba(255, 255, 255, 0.4)',
                border: '1px solid #c9975b',
                borderRadius: 0
            }}>
                <WaxSealToken
                    successLevel={attacker.successLevel}
                    isCritSuccess={attacker.isCritSuccess}
                    isCritFailure={attacker.isCritFailure}
                    isSuccess={attacker.successLevel >= 0}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontFamily: '"Cinzel", serif', fontWeight: 600, color: '#6b4423', fontSize: '13px' }}>
                        {attacker.characterName} ({t('log.attacker')})
                    </Typography>
                    <Typography sx={{ fontSize: '12px', color: '#7a5c42' }}>
                        {t('log.rolled')} <strong>{attacker.roll}</strong> {t('log.vs')} <strong>{attacker.targetValue}</strong>
                        {attacker.modifier !== 0 && ` (${t('log.modifier')}: ${attacker.modifier >= 0 ? '+' : ''}${attacker.modifier})`}
                    </Typography>
                </Box>
            </ListItem>

            {/* Defender Roll */}
            <ListItem sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '10px',
                mb: '5px',
                background: 'rgba(255, 255, 255, 0.4)',
                border: '1px solid #c9975b',
                borderRadius: 0
            }}>
                <WaxSealToken
                    successLevel={defender.successLevel}
                    isCritSuccess={defender.isCritSuccess}
                    isCritFailure={defender.isCritFailure}
                    isSuccess={defender.successLevel >= 0}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontFamily: '"Cinzel", serif', fontWeight: 600, color: '#6b4423', fontSize: '13px' }}>
                        {defender.characterName} ({t('log.defender')})
                    </Typography>
                    <Typography sx={{ fontSize: '12px', color: '#7a5c42' }}>
                        {t('log.rolled')} <strong>{defender.roll}</strong> {t('log.vs')} <strong>{defender.targetValue}</strong>
                        {defender.modifier !== 0 && ` (${t('log.modifier')}: ${defender.modifier >= 0 ? '+' : ''}${defender.modifier})`}
                    </Typography>
                </Box>
            </ListItem>

            {/* Winner Result */}
            <Box sx={{
                padding: '10px',
                background: winner.attackerWins
                    ? 'linear-gradient(135deg, rgba(212, 175, 55, 0.2), rgba(184, 148, 31, 0.1))'
                    : 'linear-gradient(135deg, rgba(122, 154, 106, 0.2), rgba(90, 122, 74, 0.1))',
                border: '2px solid #c9975b',
                borderRadius: 0,
                textAlign: 'center'
            }}>
                <Typography sx={{
                    fontFamily: '"Cinzel", serif',
                    fontWeight: 700,
                    fontSize: '14px',
                    color: '#6b4423',
                    mb: '6px'
                }}>
                    {winner.characterName} {t('log.wins')}
                </Typography>
                {winner.attackerWins && (
                    <Typography sx={{ fontSize: '12px', color: '#7a5c42' }}>
                        {t('log.hitsWith')} <strong>{winner.weaponName}</strong> {t('log.for')}{' '}
                        <strong style={{ color: '#c94444' }}>{winner.damage}</strong> {t('log.damage')}
                        <br/>
                        <span style={{ fontSize: '10px' }}>
                            ({t('log.sl')}: {winner.netSuccessLevel}, {t('log.sb')}: {winner.strengthBonus}, {t('log.weapon')}: {winner.weaponDamage})
                        </span>
                    </Typography>
                )}
                {!winner.attackerWins && (
                    <Typography sx={{ fontSize: '12px', color: '#7a5c42' }}>
                        {t('log.successfullyDefends')}
                    </Typography>
                )}
            </Box>
        </Box>
    );
};

const LogWindow = ({
    messages = [],
    logs = [],
    maxMessages = 100,
    autoScroll = true,
    addLogMessage,
    gameId = null,
    token = null
}) => {
    const logEndRef = useRef(null);
    const [customSides, setCustomSides] = useState('');

    // Support both 'messages' and 'logs' props
    const allMessages = logs.length > 0
        ? logs.map(log => ({
            text: log.message,
            type: log.type || 'info',
            timestamp: log.timestamp,
            data: log.data
          }))
        : messages;

    const trimmedMessages = allMessages.slice(-maxMessages);

    useEffect(() => {
        if (autoScroll && logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [trimmedMessages, autoScroll]);

    const rollDice = async (sides) => {
        try {
            if (gameId && token) {
                const response = await fetch(`${getApiUrl()}/games/${gameId}/roll`, {
                    method: 'POST',
                    headers: getApiHeaders({
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }),
                    body: JSON.stringify({ sides })
                });

                if (!response.ok) {
                    throw new Error('Failed to roll dice');
                }
            } else {
                const result = Math.floor(Math.random() * sides) + 1;
                addLogMessage(`Rolled d${sides}: ${result}`, 'success');
            }
        } catch (error) {
            console.error('Error rolling dice:', error);
            addLogMessage('Failed to roll dice', 'error');
        }
    };

    const getMessageIcon = (type) => {
        switch(type) {
            case 'success':
                return <SuccessIcon sx={{ color: '#5a7a4a', fontSize: '1.2rem' }} />;
            case 'error':
                return <ErrorIcon sx={{ color: '#a93434', fontSize: '1.2rem' }} />;
            case 'warning':
                return <WarningIcon sx={{ color: '#c9975b', fontSize: '1.2rem' }} />;
            default:
                return <InfoIcon sx={{ color: '#7a8a9a', fontSize: '1.2rem' }} />;
        }
    };

    return (
        <Paper sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: 'linear-gradient(135deg, #f9f3e8 0%, #ece3d4 100%)',
            boxShadow: 'inset 0 0 20px rgba(107, 68, 35, 0.08)'
        }}>
            {/* Header */}
            <Box sx={{
                p: 2,
                borderBottom: '3px solid',
                borderColor: 'primary.main',
                background: 'linear-gradient(135deg, #c9975b 0%, #a67c52 100%)',
                boxShadow: '0 2px 8px rgba(107, 68, 35, 0.2)'
            }}>
                <Typography
                    variant="h6"
                    sx={{
                        fontFamily: '"Cinzel", serif',
                        fontWeight: 700,
                        color: '#f9f3e8',
                        textAlign: 'center',
                        letterSpacing: '1px',
                        textShadow: '2px 2px 4px rgba(0,0,0,0.3)'
                    }}
                >
                    Battle Chronicle
                </Typography>
            </Box>

            {/* Messages */}
            <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
                {trimmedMessages.length === 0 ? (
                    <Box sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        p: 4
                    }}>
                        <Typography
                            sx={{
                                color: '#8a7d6a',
                                fontFamily: '"Crimson Text", serif',
                                fontStyle: 'italic',
                                fontSize: '1rem'
                            }}
                        >
                            The chronicle awaits...
                        </Typography>
                    </Box>
                ) : (
                    <List dense sx={{ p: 2 }}>
                        {trimmedMessages.map((msg, index) => {
                            // Check if message has structured data
                            if (msg.data && msg.data.rollType) {
                                if (msg.data.rollType === 'simple') {
                                    return <RenderSimpleDiceRoll key={index} data={msg.data} timestamp={msg.timestamp} />;
                                } else if (msg.data.rollType === 'attribute') {
                                    return <RenderAttributeRoll key={index} data={msg.data} timestamp={msg.timestamp} />;
                                } else if (msg.data.rollType === 'skill') {
                                    return <RenderSkillRoll key={index} data={msg.data} timestamp={msg.timestamp} />;
                                } else if (msg.data.rollType === 'fight') {
                                    return <RenderFightResult key={index} data={msg.data} timestamp={msg.timestamp} />;
                                }
                            }

                            // Fallback for simple text messages
                            return (
                                <ListItem
                                    key={index}
                                    sx={{
                                        borderLeft: '4px solid',
                                        borderColor: msg.type === 'error' ? '#a93434' :
                                                     msg.type === 'success' ? '#5a7a4a' :
                                                     msg.type === 'warning' ? '#c9975b' :
                                                     '#7a8a9a',
                                        mb: 1,
                                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(253, 248, 236, 0.8) 100%)',
                                        borderRadius: 0,
                                        padding: '10px 12px',
                                        boxShadow: '0 2px 6px rgba(107, 68, 35, 0.12)',
                                        border: '1px solid #d4a574',
                                        borderLeftWidth: '4px'
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'flex-start', width: '100%', gap: 1 }}>
                                        {getMessageIcon(msg.type)}
                                        <ListItemText
                                            primary={msg.text}
                                            secondary={
                                                msg.timestamp && (
                                                    <Typography
                                                        variant="caption"
                                                        sx={{
                                                            color: '#8a7d6a',
                                                            fontFamily: '"Crimson Text", serif',
                                                            fontSize: '0.75rem',
                                                            fontStyle: 'italic'
                                                        }}
                                                    >
                                                        {msg.timestamp}
                                                    </Typography>
                                                )
                                            }
                                            primaryTypographyProps={{
                                                sx: {
                                                    fontFamily: '"Crimson Text", serif',
                                                    fontSize: '0.95rem',
                                                    lineHeight: 1.5,
                                                    color: '#3a2f1f'
                                                }
                                            }}
                                        />
                                    </Box>
                                </ListItem>
                            );
                        })}
                        <div ref={logEndRef} />
                    </List>
                )}
            </Box>

            {/* Dice Roll Controls */}
            <Box sx={{ p: 2, borderTop: '2px solid #d4a574' }}>
                <Stack direction="row" spacing={1}>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => rollDice(6)}
                        sx={{
                            minWidth: '50px',
                            borderColor: '#c9975b',
                            color: '#6b4423',
                            '&:hover': { borderColor: '#a67c52', background: 'rgba(201, 151, 91, 0.1)' }
                        }}
                    >
                        d6
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => rollDice(10)}
                        sx={{
                            minWidth: '50px',
                            borderColor: '#c9975b',
                            color: '#6b4423',
                            '&:hover': { borderColor: '#a67c52', background: 'rgba(201, 151, 91, 0.1)' }
                        }}
                    >
                        d10
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => rollDice(100)}
                        sx={{
                            minWidth: '50px',
                            borderColor: '#c9975b',
                            color: '#6b4423',
                            '&:hover': { borderColor: '#a67c52', background: 'rgba(201, 151, 91, 0.1)' }
                        }}
                    >
                        d100
                    </Button>
                    <TextField
                        size="small"
                        value={customSides}
                        onChange={(e) => setCustomSides(e.target.value)}
                        placeholder="Custom"
                        sx={{
                            flexGrow: 1,
                            '& .MuiOutlinedInput-root': {
                                '& fieldset': { borderColor: '#c9975b' },
                                '&:hover fieldset': { borderColor: '#a67c52' }
                            }
                        }}
                    />
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => {
                            const sides = parseInt(customSides);
                            if (sides > 0) {
                                rollDice(sides);
                                setCustomSides('');
                            }
                        }}
                        disabled={!customSides || parseInt(customSides) <= 0}
                        sx={{
                            borderColor: '#c9975b',
                            color: '#6b4423',
                            '&:hover': { borderColor: '#a67c52', background: 'rgba(201, 151, 91, 0.1)' }
                        }}
                    >
                        Roll
                    </Button>
                </Stack>
            </Box>
        </Paper>
    );
};

export default LogWindow;
