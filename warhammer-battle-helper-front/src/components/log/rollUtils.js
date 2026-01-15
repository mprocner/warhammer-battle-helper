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
