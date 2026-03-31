export function buildPayload(char) {
    if (!char || !char.stats) return char;
    const { combat: _c, ...statsRest } = char.stats;
    const { hpMax: _hpMax, mpMax: _mpMax, sanityMax: _sanityMax, ...resources } = char.stats.resources || {};
    return { ...char, stats: { ...statsRest, resources } };
}
