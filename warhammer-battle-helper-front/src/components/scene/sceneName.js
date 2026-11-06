// The server creates a game's first scene without a name, because it has no locale to name
// it in. Every place that shows a scene name goes through here, so that scene reads in the
// viewer's language.
export const sceneDisplayName = (scene, t) => scene?.name || t('scenes.defaultName');
