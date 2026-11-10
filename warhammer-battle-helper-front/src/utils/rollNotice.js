// Who gets a live notice (toast, 3D dice) for a fresh roll event. The server already routes
// each roll only to the people allowed to see it (RollPublisher); this is the client's second
// gate, and both notices share it so the dice never show a roll the toast hides.
export const showsRollNotice = (visibility, { isGM, userId }) =>
  !visibility || visibility === 'all' || isGM || visibility === userId;
