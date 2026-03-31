const TOP_LEVEL_KEYS = new Set([
    'id', 'gameId', 'gameSystem', 'createdBy', 'visibleTo',
    'isNPC', 'name', 'avatar', 'states', 'createdAt', 'updatedAt', 'stats'
]);

/**
 * Builds the correct API payload for a Warhammer 4e character save.
 * Re-wraps root-level stats fields back into `stats` before sending.
 */
export function buildPayload(charToSave) {
    const topLevel = {};
    const statsFields = {};
    for (const [k, v] of Object.entries(charToSave)) {
        if (TOP_LEVEL_KEYS.has(k)) topLevel[k] = v;
        else statsFields[k] = v;
    }
    // Strip derived/computed fields that should not be persisted
    const { sb: _sb, tb: _tb, wpb: _wpb, hardy: _hardy, total: _total, ...woundsRest } = statsFields.wounds ?? {};
    const { walk: _walk, run: _run, ...movementRest } = statsFields.movement ?? {};
    // Keep top-level name in sync with basicInfo.name (authoritative for Warhammer display)
    if (statsFields.basicInfo?.name) topLevel.name = statsFields.basicInfo.name;
    return { ...topLevel, stats: { ...statsFields, wounds: woundsRest, movement: movementRest } };
}
