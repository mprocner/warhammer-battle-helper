import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import NoteItem from './notes/NoteItem';
import NoteEditorModal from './notes/NoteEditorModal';
import ConfirmModal from '../common/ConfirmModal';
import { getNotes, createNote, updateNote, deleteNote } from '../../api/notes';
import './NotesTab.css';

const NotesTab = ({ gameId, token, gameState, isConnected }) => {
  const { t } = useTranslation();
  const [notes, setNotes] = useState([]);
  const [filterText, setFilterText] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  // Initial fetch
  useEffect(() => {
    const fetchNotes = async () => {
      try {
        setIsLoading(true);
        const data = await getNotes(gameId);
        setNotes(data || []);
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
  // Merge instead of overwrite: keep local version if it's newer (the sender is excluded
  // from WS echoes, so gameState.notes permanently lags behind local saves).
  useEffect(() => {
    if (gameState?.notes === undefined) return;
    setNotes(prev => {
      const incoming = gameState.notes || [];
      const prevById = new Map(prev.map(n => [n.id, n]));
      const incomingIds = new Set(incoming.map(n => n.id));

      const merged = incoming.map(n => {
        const local = prevById.get(n.id);
        if (local && new Date(local.updatedAt) >= new Date(n.updatedAt)) {
          return local; // keep locally-saved version — it's newer
        }
        return n;
      });

      // Keep notes that exist locally but aren't in incoming yet
      // (e.g. just created, gameState snapshot predates the create)
      for (const [id, note] of prevById) {
        if (!incomingIds.has(id)) merged.push(note);
      }

      return merged;
    });
  }, [gameState?.notes]);

  // Auto-refresh editing note from WS updates (changes by other users).
  // Only replace editingNote if the incoming version is strictly newer.
  useEffect(() => {
    if (editingNote && gameState?.notes) {
      const updated = gameState.notes.find(n => n.id === editingNote.id);
      if (updated && new Date(updated.updatedAt) > new Date(editingNote.updatedAt)) {
        setEditingNote(updated);
      }
      // If the note was deleted while editing
      if (editingNote.id && !gameState.notes.find(n => n.id === editingNote.id)) {
        setIsEditorOpen(false);
        setEditingNote(null);
      }
    }
  }, [gameState?.notes, editingNote]);

  // Filter and sort
  const filteredNotes = useMemo(() => {
    const lower = filterText.toLowerCase();
    return [...notes]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .filter(n => !filterText || n.title.toLowerCase().includes(lower));
  }, [notes, filterText]);

  // CRUD handlers
  const handleCreate = useCallback(() => {
    setEditingNote(null);
    setIsEditorOpen(true);
  }, []);

  const handleEdit = useCallback((note) => {
    setEditingNote(note);
    setIsEditorOpen(true);
  }, []);

  const handleEditorClose = useCallback(() => {
    setIsEditorOpen(false);
    setEditingNote(null);
  }, []);

  const handleSave = useCallback(async (data) => {
    try {
      if (editingNote) {
        const updated = await updateNote(gameId, editingNote.id, data);
        setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
      } else {
        // Create mode — transition to edit mode with the new note
        const created = await createNote(gameId, data);
        setEditingNote(created);
        setNotes(prev => [...prev, created]);
      }
    } catch (err) {
      console.error('Failed to save note:', err);
      throw err;
    }
  }, [gameId, editingNote]);

  const handleDeleteClick = useCallback((note) => {
    setDeleteTarget(note);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      await deleteNote(gameId, deleteTarget.id);
      // Update local state (sender doesn't receive own WS echo)
      setNotes(prev => prev.filter(n => n.id !== deleteTarget.id));
      // If deleting the note we're editing, close editor
      if (editingNote?.id === deleteTarget.id) {
        setIsEditorOpen(false);
        setEditingNote(null);
      }
    } catch (err) {
      console.error('Failed to delete note:', err);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }, [gameId, deleteTarget, editingNote]);

  if (isLoading) {
    return <div className="notes-tab notes-tab--loading">{t('common.loading')}</div>;
  }

  if (error) {
    return <div className="notes-tab notes-tab--error">{error}</div>;
  }

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
      <div className="notes-tab__list">
        {filteredNotes.length === 0 ? (
          <div className="notes-tab__empty">
            <EditNoteOutlinedIcon className="notes-tab__empty-icon" />
            <p className="notes-tab__empty-text">{t('notes.noNotes')}</p>
            <p className="notes-tab__empty-hint">{t('notes.noNotesHint')}</p>
          </div>
        ) : (
          filteredNotes.map(note => (
            <NoteItem
              key={note.id}
              note={note}
              isOwner={note.creatorId === userId}
              onEdit={() => handleEdit(note)}
              onDelete={() => handleDeleteClick(note)}
            />
          ))
        )}
      </div>

      {/* Editor Modal */}
      <NoteEditorModal
        isOpen={isEditorOpen}
        note={editingNote}
        onClose={handleEditorClose}
        onSave={handleSave}
      />

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
