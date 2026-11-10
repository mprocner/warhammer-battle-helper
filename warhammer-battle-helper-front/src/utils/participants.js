export const resolveDisplayName = (participant) =>
    participant?.signature || participant?.accountSignature || participant?.email || '';

export const resolveAvatar = (participant) => {
    const type = participant?.avatarType || 'upload';
    if (type === 'account') return participant?.accountAvatar || null;
    if (type === 'character') return participant?.avatarCharacterUrl || null;
    return participant?.avatar || null;
};

// Copy of models.ParticipantPalette (Go), used only as picker suggestions: the backend assigns
// default colours, so drift here never changes what anyone gets.
export const PARTICIPANT_PALETTE = [
    '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4',
    '#f032e6', '#bfef45', '#ffe119', '#469990', '#9a6324', '#dcbeff',
];

// Neutral brown for an author no longer in the game (their log entries stay) or a participant of
// a game the colour migration has not reached yet.
export const FALLBACK_PARTICIPANT_COLOR = '#8a7d6a';

export const participantColor = (participants, userId) =>
    (participants || []).find(p => p.userId === userId)?.color || FALLBACK_PARTICIPANT_COLOR;
