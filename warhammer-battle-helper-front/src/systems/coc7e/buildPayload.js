export function buildPayload(char) {
    if (!char || !char.stats) return char;
    const { damageBonus: _db, build: _b, ...statsWithoutComputed } = char.stats;
    return { ...char, stats: statsWithoutComputed };
}
