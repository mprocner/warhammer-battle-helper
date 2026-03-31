export function getCharacterSaveUrl(charId, gameId) {
    if (gameId) return `/games/${gameId}/characters/${charId}`;
    return `/characters/${charId}`;
}
