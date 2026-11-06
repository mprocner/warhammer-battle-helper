import { useSyncExternalStore } from 'react';
import { LATEST_VERSION } from './releases';

const STORAGE_KEY = 'changelog.lastSeenVersion';
// Same-tab signal; the native `storage` event covers the other tabs.
const SEEN_EVENT = 'changelog-seen';

const readLastSeen = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const markLatestSeen = () => {
  try {
    window.localStorage.setItem(STORAGE_KEY, LATEST_VERSION);
  } catch {
    // Blocked storage only means the dot keeps showing.
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
};

const subscribe = (onChange) => {
  window.addEventListener(SEEN_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(SEEN_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
};

const isUnseen = () => readLastSeen() !== LATEST_VERSION;

export const useChangelogUnseen = () => useSyncExternalStore(subscribe, isUnseen);
