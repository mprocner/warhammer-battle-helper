/**
 * Removes a user id from the visibleTo list of every character.
 *
 * CharacterVisibilityModal seeds its checkboxes from character.visibleTo and submits the
 * whole set on save, including ids it never rendered. Left stale after a player leaves, a
 * GM opening that modal would write the departed player's id straight back into the
 * database. PARTICIPANT_LEFT only trimmed the participants list, so this closes the gap.
 *
 * @param {Array<{visibleTo?: string[]}>|null|undefined} characters
 * @param {string|null|undefined} userId
 * @returns {Array} the original list when nothing changed, otherwise a new array
 */
export const stripUserFromCharacters = (characters, userId) => {
  if (!userId) return characters || [];
  return (characters || []).map((character) => {
    const visibleTo = character.visibleTo || [];
    if (!visibleTo.includes(userId)) return character;
    return { ...character, visibleTo: visibleTo.filter((id) => id !== userId) };
  });
};

export default stripUserFromCharacters;
