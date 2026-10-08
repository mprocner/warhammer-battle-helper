// Field types that render as a single tile on the short character card. Collections
// (skill_table, skill_tree) reach the card only through the player's stars
// (stats.favoriteSkills). The creator offers the showOnShortCard switch for exactly these types
// and CharacterDetails renders exactly these, so both read this one list: a type added to only
// one side is either a switch that does nothing or a tile the GM cannot turn on.
export const SHORT_CARD_TYPES = ['attr', 'number', 'computed', 'progress'];
