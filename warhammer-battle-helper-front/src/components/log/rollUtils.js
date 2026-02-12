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
    if (isCritFailure) return 'var(--log-red-dark)';
    return isSuccess ? 'var(--log-success)' : 'var(--log-red-light)';
};

/**
 * Calculate success level from roll and target values
 */
export const calculateSuccessLevel = (rollValue, targetValue) => {
    return Math.floor(targetValue / 10) - Math.floor(rollValue / 10);
};

/**
 * Determine if roll is a critical success
 */
export const isCriticalSuccess = (rollValue, isSuccess) => {
    return rollValue <= 5 && isSuccess;
};

/**
 * Determine if roll is a critical failure (fumble)
 */
export const isCriticalFailure = (rollValue, isSuccess) => {
    return rollValue >= 96 && !isSuccess;
};

/**
 * Translate skill name - handles compound keys like MELEE_BASIC
 * @param {Function} t - i18next translation function
 * @param {string} skillKey - The skill key to translate
 * @param {string} fallbackLabel - Fallback label if no translation found
 * @returns {string} Translated skill name
 */
export const getTranslatedSkillName = (t, skillKey, fallbackLabel = 'Skill') => {
    if (!skillKey) return t(`log.${fallbackLabel.toLowerCase()}`, { defaultValue: fallbackLabel });

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
