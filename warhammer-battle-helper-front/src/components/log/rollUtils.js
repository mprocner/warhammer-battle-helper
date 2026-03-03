/**
 * Get the CSS class for roll result text color
 */
export const getResultColorClass = (isCritSuccess, isCritFailure, isSuccess) => {
    if (isCritSuccess) return 'log-text--crit-success';
    if (isCritFailure) return 'log-text--crit-failure';
    return isSuccess ? 'log-text--success' : 'log-text--failure';
};

/**
 * Get the inline color value for roll result (for elements that need inline styles)
 */
export const getResultColor = (isCritSuccess, isCritFailure, isSuccess) => {
    if (isCritSuccess) return 'var(--log-gold-medium)';
    if (isCritFailure) return 'var(--log-purple)';
    return isSuccess ? 'var(--log-success)' : 'var(--log-red-light)';
};

/**
 * Calculate success level from roll and target values
 */
export const calculateSuccessLevel = (rollValue, targetValue) => {
    return Math.floor(targetValue / 10) - Math.floor(rollValue / 10);
};

/**
 * Check if a d100 roll is a doublet (both dice show the same number)
 * Doublets: 11, 22, 33, 44, 55, 66, 77, 88, 99, and 100 (00 on real dice)
 */
export const isDoublet = (rollValue) => {
    return rollValue === 100 || (rollValue >= 11 && rollValue <= 99 && rollValue % 11 === 0);
};

/**
 * Determine if roll is a critical success (success + doublet)
 */
export const isCriticalSuccess = (rollValue, isSuccess) => {
    return isSuccess && isDoublet(rollValue);
};

/**
 * Determine if roll is a critical failure/fumble (failure + doublet)
 */
export const isCriticalFailure = (rollValue, isSuccess) => {
    return !isSuccess && isDoublet(rollValue);
};

/**
 * Translate skill name - handles compound keys like MELEE_BASIC
 * @param {Function} t - i18next translation function
 * @param {string} skillKey - The skill key to translate
 * @param {string} fallbackLabel - Fallback label if no translation found
 * @returns {string} Translated skill name
 */
const ATTR_SHORT_TO_FULL = {
    WS: 'WEAPON_SKILL', BS: 'BALLISTIC_SKILL', S: 'STRENGTH',
    T: 'TOUGHNESS', I: 'INITIATIVE', Ag: 'AGILITY',
    Dex: 'DEXTERITY', Int: 'INTELLIGENCE', WP: 'WILLPOWER', Fel: 'FELLOWSHIP',
};

export const getTranslatedSkillName = (t, skillKey, fallbackLabel = 'Skill') => {
    if (!skillKey) return t(`log.${fallbackLabel.toLowerCase()}`, { defaultValue: fallbackLabel });

    // Characteristic test keys: attr_WS, attr_BS, etc.
    if (skillKey.startsWith('attr_')) {
        const shortName = skillKey.slice(5);
        const fullKey = ATTR_SHORT_TO_FULL[shortName];
        return fullKey
            ? t(`characteristics.${fullKey}`, { defaultValue: shortName })
            : shortName;
    }

    // Try full key from skills namespace (e.g., STEALTH_RURAL.name or OUTDOOR_SURVIVAL.name)
    const fullTranslation = t(`${skillKey}.name`, { ns: 'skills', defaultValue: '' });
    if (fullTranslation) return fullTranslation;

    // Try parent + specialisation lookup (e.g., MELEE_FENCING → MELEE.name + MELEE.specialisations.FENCING)
    const underscoreIdx = skillKey.indexOf('_');
    if (underscoreIdx > 0) {
        const parent = skillKey.substring(0, underscoreIdx);
        const suffix = skillKey.substring(underscoreIdx + 1);

        const parentName = t(`${parent}.name`, { ns: 'skills', defaultValue: '' });
        if (parentName) {
            const specName = t(`${parent}.specialisations.${suffix}`, { ns: 'skills', defaultValue: '' });
            const formattedSuffix = specName || suffix.charAt(0) + suffix.slice(1).toLowerCase();
            return `${parentName} (${formattedSuffix})`;
        }
    }

    // Final fallback: format the key nicely
    return skillKey.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ');
};
