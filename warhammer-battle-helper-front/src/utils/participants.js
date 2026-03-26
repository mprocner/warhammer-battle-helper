export const resolveDisplayName = (participant) =>
    participant?.signature || participant?.accountSignature || participant?.email || '';

export const resolveAvatar = (participant) => {
    const type = participant?.avatarType || 'upload';
    if (type === 'account') return participant?.accountAvatar || null;
    if (type === 'character') return participant?.avatarCharacterUrl || null;
    return participant?.avatar || null;
};
