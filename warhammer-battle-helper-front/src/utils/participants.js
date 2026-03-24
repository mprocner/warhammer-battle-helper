export const resolveDisplayName = (participant) =>
    participant?.signature || participant?.accountSignature || participant?.email || '';

export const resolveAvatar = (participant) =>
    participant?.avatar || participant?.accountAvatar || null;
