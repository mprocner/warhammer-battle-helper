// A custom game shows its template's name; hardcoded systems show their i18n display name.
export const systemLabel = (game, t) => game.gameSystem === 'custom' && game.customSystemTemplate
  ? game.customSystemTemplate.name
  : t(`gameSystems.${game.gameSystem}`, { defaultValue: game.gameSystem });
