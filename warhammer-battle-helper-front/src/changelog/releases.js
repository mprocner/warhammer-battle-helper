// Release history shown on /changelog. Structure only — texts live in the `changelog`
// i18n namespace under releases.<releaseKey(version)>.<sectionId>.<itemId>.
// Newest release first. Area sections describe the first release; later releases use
// `added`, `changed` and `fixed`.
export const RELEASES = [
  {
    version: '1.0.0',
    date: '2026-11-06',
    sections: [
      { id: 'scene', items: ['scenes', 'grid', 'tools', 'tokens', 'overlays', 'controls'] },
      { id: 'characters', items: ['sheet', 'manage', 'conditions', 'rolls', 'favourites'] },
      { id: 'creator', items: ['fields', 'dice', 'presets', 'token', 'sharing', 'preview'] },
      { id: 'dice', items: ['chat', 'visibility', 'myRolls'] },
      { id: 'materials', items: ['handouts', 'files', 'music', 'notes'] },
      { id: 'games', items: ['lobby', 'players', 'inviteLink', 'participant', 'online'] },
      { id: 'systems', items: ['builtIn', 'custom'] },
      { id: 'minigames', items: ['dice'] },
      { id: 'tutorials', items: ['tours', 'help', 'links'] },
      { id: 'accounts', items: ['register', 'profile', 'stats', 'language', 'legal', 'contact'] },
    ],
  },
];

export const LATEST_VERSION = RELEASES[0].version;

// i18next treats dots as nesting separators, so a version cannot be a key as-is.
export const releaseKey = (version) => version.replaceAll('.', '_');
