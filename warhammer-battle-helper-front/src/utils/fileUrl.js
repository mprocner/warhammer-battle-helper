import { getApiUrl } from '../api/axios';

const ABSOLUTE_URL_RE = /^https?:\/\//i;

/**
 * Resolves a backend-relative file path ("/user-files/x.png") into an absolute URL.
 * Absolute http(s) URLs are returned unchanged — MusicState.trackUrl is persisted
 * already-resolved, so this must be idempotent.
 *
 * Blocklist, not an allowlist of known prefixes: the backend serves files under
 * several hardcoded prefixes (/avatars, /user-files, /music-files — main.go) and a
 * new one must not silently fall through unresolved, which is exactly how the lobby
 * image broke.
 *
 * NOT a security control: a non-http(s) scheme lands in the "prepend origin" branch,
 * which mangles it into an inert string — incidental, not a guarantee. Do not rely on
 * this to gate an <iframe src>; see isSafeIframeUrl in HandoutViewerModal.jsx.
 *
 * @param {string|null|undefined} fileUrl
 * @returns {string} absolute URL, or '' when fileUrl is falsy
 */
export function resolveFileUrl(fileUrl) {
  if (!fileUrl) return '';
  return ABSOLUTE_URL_RE.test(fileUrl) ? fileUrl : `${getApiUrl()}${fileUrl}`;
}
