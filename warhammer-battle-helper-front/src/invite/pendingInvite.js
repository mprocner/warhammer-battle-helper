// A game invite token parked while the visitor logs in or registers (PLAYRPG-303).
//
// localStorage, not sessionStorage or React state: the "no account yet" path leaves the tab —
// register, open the verification e-mail (often in a new tab), log in there. Only storage shared
// across tabs of the same browser survives that. Every access is wrapped: storage can throw
// (private mode, blocked site data) and the invite must then degrade to "just log in", not crash.

export const PENDING_INVITE_KEY = 'pendingInviteToken';

export const storePendingInvite = (token) => {
  try {
    localStorage.setItem(PENDING_INVITE_KEY, token);
  } catch (e) {
    // Storage unavailable: the logged-out invite is lost, the logged-in one does not need it.
  }
};

export const hasPendingInvite = () => {
  try {
    return Boolean(localStorage.getItem(PENDING_INVITE_KEY));
  } catch (e) {
    return false;
  }
};

// Read and clear in one step, so a second caller (StrictMode double effect, a second tab) finds
// nothing and the join request goes out once.
export const takePendingInvite = () => {
  try {
    const token = localStorage.getItem(PENDING_INVITE_KEY);
    localStorage.removeItem(PENDING_INVITE_KEY);
    return token || null;
  } catch (e) {
    return null;
  }
};
