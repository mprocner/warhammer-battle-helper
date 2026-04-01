---
name: Inline Rename Patterns
description: Design decisions and implementation notes for inline rename on file and music items in the tab panels
type: project
---

Folders already support inline rename in both tabs (DroppableFolderItem, DroppableMusicFolderItem) via EditIcon button triggering a controlled `<input>` inside a `<form>`. The pattern uses lifted state in the parent tab (renamingFolder, renameValue). Files do not yet support rename.

**Pattern to reuse for file rename:**
- Trigger: EditIcon (`@mui/icons-material/Edit`) button shown in `.files-tab__item-actions` / `.music-tab__track-actions` on hover (same reveal pattern as delete)
- Input replaces `.files-tab__item-name` / `.music-tab__track-name` — swap span for input inline, no modal
- Confirm: Enter key (form submit) or blur; Cancel: Escape key sets renaming state back to null
- Optimistic update: update local state immediately, revert on API error
- Error: set error string in parent error state (already exists in both tabs)
- GM-only: FilesTab is already GM-only; MusicTab is also GM-only (both tabs don't render for players)

**Why:** Folder rename already uses this pattern successfully. Consistency demands files follow the same model. Modal would be too disruptive during live sessions.

**How to apply:** When implementing, mirror DroppableFolderItem's rename form pattern into DraggableFileItem and DraggableMusicItem. State lives in parent (renamingFile, renameValue). API call needs a new `renameFile` / `renameMusicFile` endpoint.

**CSS:** Reuse `.files-tab__rename-form` for files (it already exists). For music, use `.music-tab__input--inline` (already styled). Add `--saving` modifier for loading state cursor.
