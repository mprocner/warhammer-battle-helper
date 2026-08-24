/**
 * Decides whether an incoming note revision should be applied to an open editor.
 *
 * The `note` prop of NoteEditorModal carries two kinds of events that look identical:
 * the echo of our own autosave (the HTTP response, sanitized server-side so its HTML
 * never matches the editor byte for byte) and a genuine remote edit broadcast over
 * WebSocket. Applying the echo replaces the ProseMirror document and throws the caret
 * to the end of the note, which is the bug this guard exists to prevent.
 *
 * Revisions arriving while the user is still typing are dropped too: our own pending
 * save is about to overwrite the server anyway, so applying them would only destroy
 * characters typed in the last second.
 *
 * @param {object} params
 * @param {string|undefined} params.incomingUpdatedAt server stamp of the incoming revision
 * @param {string|null} params.ownSaveStamp server stamp returned by our last save
 * @param {boolean} params.isDirty true while an autosave is pending or in flight
 * @returns {boolean} true when the revision is a genuine remote change worth showing
 */
export const shouldApplyRemoteNote = ({ incomingUpdatedAt, ownSaveStamp, isDirty }) => {
  if (ownSaveStamp && incomingUpdatedAt === ownSaveStamp) return false;
  if (isDirty) return false;
  return true;
};
