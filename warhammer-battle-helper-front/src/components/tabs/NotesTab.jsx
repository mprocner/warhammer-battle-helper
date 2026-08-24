import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import NoteItem from './notes/NoteItem';
import SortableNoteItem from './notes/SortableNoteItem';
import NoteEditorModal from './notes/NoteEditorModal';
import ConfirmModal from '../common/ConfirmModal';
import { getNotes, createNote, updateNote, deleteNote, reorderNotes } from '../../api/notes';
import { useWindowManager } from '../../contexts/WindowManagerContext';
import './NotesTab.css';

const NotesTab = ({ gameId, token, gameState, isConnected }) => {
  const { t } = useTranslation();
  const [notes, setNotes] = useState([]);
  const [filterText, setFilterText] = useState('');
  // Otwarte edytory (multi-open) — { key, noteId }. noteId=null = nowa notatka.
  const [openEditors, setOpenEditors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const { focusWindow } = useWindowManager();
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeDragNote, setActiveDragNote] = useState(null);
  const confirmedNoteIdsRef = useRef(new Set());
  const deletedNoteIdsRef = useRef(new Set());

  // Get current user ID from token
  const userId = useMemo(() => {
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.user_id;
    } catch {
      return null;
    }
  }, [token]);

  const isFilterActive = filterText.trim().length > 0;

  // Initial fetch — backend returns notes pre-sorted by user's stored order
  useEffect(() => {
    const fetchNotes = async () => {
      try {
        setIsLoading(true);
        const data = await getNotes(gameId);
        setNotes(data || []);
        for (const n of (data || [])) {
          confirmedNoteIdsRef.current.add(n.id);
        }
        setError('');
      } catch (err) {
        console.error('Failed to fetch notes:', err);
        setError(t('notes.loadError'));
      } finally {
        setIsLoading(false);
      }
    };
    if (gameId) fetchNotes();
  }, [gameId, t]);

  // Sync from gameState (WS updates from other users).
  // Build from prev as base to preserve local drag order.
  // Only update note content from incoming; never reset positions.
  useEffect(() => {
    if (gameState?.notes === undefined) return;
    setNotes(prev => {
      const incoming = (gameState.notes || []).filter(n => !n.isPrivate || n.creatorId === userId);
      const prevById = new Map(prev.map(n => [n.id, n]));
      const incomingById = new Map(incoming.map(n => [n.id, n]));

      // Mark all incoming notes as confirmed by server
      for (const n of incoming) {
        confirmedNoteIdsRef.current.add(n.id);
      }

      // Update existing notes content; remove notes deleted remotely
      const merged = prev
        .map(n => {
          const remote = incomingById.get(n.id);
          if (!remote) {
            // Only remove if previously confirmed by server — it was deleted remotely.
            // If never confirmed, it's a pending optimistic update — keep it.
            if (confirmedNoteIdsRef.current.has(n.id)) return null;
            return n;
          }
          if (new Date(n.updatedAt) >= new Date(remote.updatedAt)) return n; // local is newer
          return remote; // remote is newer (updated by another user)
        })
        .filter(Boolean);

      // Append notes that appeared remotely but aren't in local state yet.
      // Skip notes locally deleted — gameState.notes may be stale (sender excluded from own broadcast).
      for (const n of incoming) {
        if (!prevById.has(n.id) && !deletedNoteIdsRef.current.has(n.id)) merged.push(n);
      }

      return merged;
    });
  }, [gameState?.notes, userId]);

  // Zamknij edytory notatek, które zniknęły (usunięte zdalnie). Edytory
  // żywej notatki dostają aktualizacje przez prop `note` (resolveNote).
  useEffect(() => {
    setOpenEditors(prev => {
      const filtered = prev.filter(e =>
        !e.noteId
        || notes.some(n => n.id === e.noteId)
        || !confirmedNoteIdsRef.current.has(e.noteId)
      );
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [notes]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = useCallback((event) => {
    setActiveDragNote(notes.find(n => n.id === event.active.id) || null);
  }, [notes]);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    setActiveDragNote(null);

    if (!over || active.id === over.id) return;

    setNotes(prev => {
      const oldIndex = prev.findIndex(n => n.id === active.id);
      const newIndex = prev.findIndex(n => n.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const reordered = arrayMove(prev, oldIndex, newIndex);

      // Fire-and-forget inside updater to avoid stale closure over `notes`
      reorderNotes(gameId, reordered.map(n => n.id)).catch(err => {
        console.error('Failed to save note order:', err);
      });

      return reordered;
    });
  }, [gameId]);

  // Filtered list — only used when filter is active (drag disabled in that mode)
  const filteredNotes = useMemo(() => {
    if (!isFilterActive) return notes;
    const lower = filterText.toLowerCase();
    return notes.filter(n => n.title.toLowerCase().includes(lower));
  }, [notes, filterText, isFilterActive]);

  const sortableIds = useMemo(() => notes.map(n => n.id), [notes]);

  // CRUD handlers
  const handleCreate = useCallback(() => {
    setOpenEditors(prev => [...prev, { key: `new-${Date.now()}`, noteId: null }]);
  }, []);

  const handleEdit = useCallback((note) => {
    setOpenEditors(prev => {
      const existing = prev.find(e => e.noteId === note.id);
      if (existing) {
        // Już otwarta — tylko podnieś okno na wierzch
        focusWindow(`note:${existing.key}`);
        return prev;
      }
      return [...prev, { key: `note-${note.id}`, noteId: note.id }];
    });
  }, [focusWindow]);

  const handleEditorClose = useCallback((key) => {
    setOpenEditors(prev => prev.filter(e => e.key !== key));
  }, []);

  const handleSave = useCallback(async (editor, data) => {
    try {
      if (editor.noteId) {
        const updated = await updateNote(gameId, editor.noteId, data);
        setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
        return updated;
      }
      const created = await createNote(gameId, data);
      // Powiąż edytor z utworzoną notatką (kolejne zapisy = update)
      setOpenEditors(prev => prev.map(e => e.key === editor.key ? { ...e, noteId: created.id } : e));
      // Prepend locally — consistent with backend AddNoteToOrder ($position: 0)
      setNotes(prev => [created, ...prev]);
      return created;
    } catch (err) {
      console.error('Failed to save note:', err);
      throw err;
    }
  }, [gameId]);

  const handleDeleteClick = useCallback((note) => {
    setDeleteTarget(note);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      await deleteNote(gameId, deleteTarget.id);
      deletedNoteIdsRef.current.add(deleteTarget.id);
      setNotes(prev => prev.filter(n => n.id !== deleteTarget.id));
      setOpenEditors(prev => prev.filter(e => e.noteId !== deleteTarget.id));
    } catch (err) {
      console.error('Failed to delete note:', err);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }, [gameId, deleteTarget]);

  if (isLoading) {
    return <div className="notes-tab notes-tab--loading">{t('common.loading')}</div>;
  }

  if (error) {
    return <div className="notes-tab notes-tab--error">{error}</div>;
  }

  const emptyState = (
    <div className="notes-tab__empty">
      <EditNoteOutlinedIcon className="notes-tab__empty-icon" />
      <p className="notes-tab__empty-text">{t('notes.noNotes')}</p>
      <p className="notes-tab__empty-hint">{t('notes.noNotesHint')}</p>
    </div>
  );

  return (
    <div className="notes-tab">
      {/* Header */}
      <div className="notes-tab__header">
        <h3 className="notes-tab__title">{t('notes.title')}</h3>
        <button className="notes-tab__add-btn" onClick={handleCreate}>
          <AddIcon fontSize="small" />
          {t('notes.addNote')}
        </button>
      </div>

      {/* Filter */}
      {notes.length > 0 && (
        <div className="notes-tab__filter-row">
          <SearchIcon className="notes-tab__filter-icon" fontSize="small" />
          <input
            className="notes-tab__filter-input"
            type="text"
            placeholder={t('notes.filterPlaceholder')}
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
          />
        </div>
      )}

      {/* List */}
      {isFilterActive ? (
        /* Filter active: plain list, drag disabled */
        <div className="notes-tab__list">
          {filteredNotes.length === 0 ? emptyState : filteredNotes.map(note => (
            <NoteItem
              key={note.id}
              note={note}
              isOwner={note.creatorId === userId}
              onEdit={() => handleEdit(note)}
              onDelete={() => handleDeleteClick(note)}
              isFilterActive={true}
            />
          ))}
        </div>
      ) : (
        /* No filter: sortable drag list */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <div className="notes-tab__list">
              {notes.length === 0 ? emptyState : notes.map(note => (
                <SortableNoteItem
                  key={note.id}
                  note={note}
                  isOwner={note.creatorId === userId}
                  onEdit={() => handleEdit(note)}
                  onDelete={() => handleDeleteClick(note)}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeDragNote ? (
              <NoteItem
                note={activeDragNote}
                isOwner={activeDragNote.creatorId === userId}
                onEdit={() => {}}
                onDelete={() => {}}
                isFilterActive={false}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Editor Modals — one per open note */}
      {openEditors.map((editor, index) => (
        <NoteEditorModal
          key={editor.key}
          windowKey={editor.key}
          index={index}
          isOpen={true}
          note={editor.noteId ? (notes.find(n => n.id === editor.noteId) || null) : null}
          onClose={() => handleEditorClose(editor.key)}
          onSave={(data) => handleSave(editor, data)}
        />
      ))}

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        message={t('notes.confirmDelete', { title: deleteTarget?.title })}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        isLoading={isDeleting}
      />
    </div>
  );
};

export default NotesTab;
