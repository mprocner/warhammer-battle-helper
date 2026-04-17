---
name: Notes Tab Design
description: Design decisions for the Notes tab feature — privacy model, list layout, WYSIWYG popup, real-time conflict handling (2026-04-15)
type: project
---

## Key design decisions

- Notes tab visible to ALL users (GM and players), positioned after Handouts in the tab nav
- Privacy model: private notes are shown only to their creator; public notes visible to all in the game
- Privacy badge on list items: lock icon (LockOutlined) for private, globe icon (PublicOutlined) for public — icon only, colored differently
- List items: title only (no content preview) — WYSIWYG content is too unpredictable to truncate safely
- Filter input lives inside the list area (sticky below header, not inline with header buttons)
- Single popup for both create and edit (same component, mode determined by whether `note` prop is set)
- WYSIWYG toolbar placed BELOW the title/privacy fields, ABOVE the editor content area — not in the popup header
- Real-time conflict: if a note you're editing is modified by someone else, show a non-blocking banner inside the popup ("This note was updated by another user") with a "Reload" button — never auto-close the editor
- Delete uses ConfirmModal (not window.confirm) — existing pattern
- NoteEditorPopup is a custom draggable portal (same pattern as HandoutCreateModal, NOT using DraggablePopup component which has the character sheet CSS class baked in)
- Notes tab always mounted like HandoutsTab (to preserve filter input state), rendered via display:none trick in RightPanel
- Recommended WYSIWYG: Tiptap (headless, no bundled CSS, composable toolbar) — fits project's custom-styled approach better than Quill or Slate

**Why:** Notes are personal — private-by-default prevents accidental session spoilers. WYSIWYG content can be arbitrarily long/complex so list previews are unreliable. Single popup for create/edit reduces component surface.
**How to apply:** When extending or modifying Notes, preserve private-by-default. Do not show content snippets in the list. Stale-edit banner is non-blocking (never auto-discard user work).
