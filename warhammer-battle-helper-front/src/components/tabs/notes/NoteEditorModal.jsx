import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import ModalHeader from '../../common/ModalHeader';
import { useManagedWindow, useWindowManager } from '../../../contexts/WindowManagerContext';
import { shouldApplyRemoteNote } from '../../../utils/noteSync';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatStrikethroughIcon from '@mui/icons-material/FormatStrikethrough';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import TitleIcon from '@mui/icons-material/Title';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';

const AUTOSAVE_DELAY = 1500;

const NoteEditorModal = ({ isOpen, note, onClose, onSave, windowKey, index = 0 }) => {
  const { t } = useTranslation();
  const popupRef = useRef(null);

  const [title, setTitle] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 50 });
  const [size, setSize] = useState({ width: 900, height: 700 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [, forceUpdate] = useState(0);

  // Refs for auto-save (avoid stale closures)
  const autoSaveTimerRef = useRef(null);
  const titleRef = useRef('');
  const isPrivateRef = useRef(true);
  const onSaveRef = useRef(onSave);
  const prevNoteIdRef = useRef(null);
  const ownSaveStampRef = useRef(null); // updatedAt ostatniego zapisu z tego edytora
  const isSavingRef = useRef(false);    // lustro isSaving — state bywa stale w domknięciu

  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { isPrivateRef.current = isPrivate; }, [isPrivate]);

  const { toggleHidden } = useWindowManager();
  // Stabilne id okna na cały czas życia edytora (nie zmienia się gdy nowa
  // notatka dostaje realne id po pierwszym zapisie). Fallback dla zgodności.
  const windowId = isOpen ? `note:${windowKey ?? (note ? note.id : 'new')}` : null;
  const { hidden, zIndex, focus } = useManagedWindow({ id: windowId, kind: 'note', title: title || t('notes.newNote'), onClose });

  const editor = useEditor({
    extensions: [
      StarterKit,
    ],
    content: '',
    onUpdate: () => {
      forceUpdate(n => n + 1);
      scheduleAutoSave();
    },
    onSelectionUpdate: () => forceUpdate(n => n + 1),
  });

  const editorRef = useRef(editor);
  useEffect(() => { editorRef.current = editor; }, [editor]);

  // Fire the auto-save
  const doAutoSave = useCallback(async () => {
    autoSaveTimerRef.current = null;
    const currentTitle = titleRef.current;
    if (!currentTitle.trim()) return;
    const content = editorRef.current?.getHTML() || '';
    isSavingRef.current = true;
    setIsSaving(true);
    setSaveError('');
    try {
      const saved = await onSaveRef.current({
        title: currentTitle.trim(),
        content,
        isPrivate: isPrivateRef.current,
      });
      if (saved) {
        // Stempel serwera — po nim rozpoznamy echo własnego zapisu, gdy wróci propem.
        ownSaveStampRef.current = saved.updatedAt;
        // Pierwszy zapis nowej notatki: przypisz id od razu, żeby przyjście propu
        // nie wyglądało na otwarcie nowego dokumentu (reset pozycji okna).
        prevNoteIdRef.current = saved.id;
      }
    } catch {
      setSaveError(t('notes.updateError'));
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [t]);

  // Schedule debounced auto-save (create and edit mode)
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(doAutoSave, AUTOSAVE_DELAY);
  }, [doAutoSave]);

  // „Brudny" = użytkownik pisze właśnie teraz: tyka debounce albo leci request.
  const isDirty = useCallback(() => autoSaveTimerRef.current !== null || isSavingRef.current, []);

  // Clear timer on unmount / close
  useEffect(() => {
    if (!isOpen && autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, [isOpen]);

  // Wgraj treść do edytora, zachowując pozycję karetki. Selekcję odtwarzamy tylko
  // wtedy, gdy edytor miał focus — inaczej ukradlibyśmy kursor z pola tytułu.
  const applyRemoteContent = useCallback((content) => {
    const ed = editorRef.current;
    if (!ed) return;
    const next = content || '';
    if (next === ed.getHTML()) return;
    const hadFocus = ed.isFocused;
    const { from } = ed.state.selection;
    ed.commands.setContent(next, { emitUpdate: false });
    if (hadFocus) {
      // Zdalna wersja bywa krótsza — pozycja musi zmieścić się w nowym dokumencie.
      ed.commands.setTextSelection(Math.min(from, ed.state.doc.content.size));
    }
  }, []);

  // Sync form from note prop (open + WS updates from other users)
  useEffect(() => {
    if (!isOpen) {
      prevNoteIdRef.current = null;
      ownSaveStampRef.current = null;
      return;
    }

    if (note) {
      const isNewNote = note.id !== prevNoteIdRef.current;
      prevNoteIdRef.current = note.id;

      if (isNewNote) {
        setPosition({ x: Math.max(50, window.innerWidth / 2 - 450) + index * 30, y: 50 + index * 30 });
        setIsMinimized(false);
      }

      // Echo własnego zapisu oraz zmiany przychodzące w trakcie pisania nie ruszają formularza.
      const applies = shouldApplyRemoteNote({
        incomingUpdatedAt: note.updatedAt,
        ownSaveStamp: ownSaveStampRef.current,
        isDirty: isDirty(),
      });
      if (!applies) return;

      if (note.title !== titleRef.current) {
        setTitle(note.title || '');
      }
      applyRemoteContent(note.content);

      setIsPrivate(note.isPrivate ?? true);
      setSaveError('');
    } else {
      // Create mode
      prevNoteIdRef.current = null;
      setTitle('');
      setIsPrivate(true);
      applyRemoteContent('');
      setSaveError('');
      setIsMinimized(false);
      setPosition({ x: Math.max(50, window.innerWidth / 2 - 450) + index * 30, y: 50 + index * 30 });
    }
  }, [isOpen, note, editor, applyRemoteContent, index, isDirty]);

  // Drag handlers
  const handleMouseDown = useCallback((e) => {
    focus();
    if (e.target.closest('.modal-header') && !e.target.closest('.modal-header__buttons')) {
      setIsDragging(true);
      const rect = popupRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  }, [focus]);

  const handleResizeMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = popupRef.current.offsetWidth;
    const startH = popupRef.current.offsetHeight;

    const onMove = (ev) => {
      setSize({
        width: Math.max(320, startW + (ev.clientX - startX)),
        height: Math.max(200, startH + (ev.clientY - startY)),
      });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging) {
        setPosition({
          x: Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - 100)),
          y: Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight - 50))
        });
      }
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Title change — user typing
  const handleTitleChange = useCallback((e) => {
    setTitle(e.target.value);
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  // Privacy change — user click
  const handlePrivacyChange = useCallback((value) => {
    setIsPrivate(value);
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  if (!isOpen || hidden) return null;

  const isEdit = !!note;
  const modalTitle = isEdit ? (note.title || t('notes.editNote')) : t('notes.newNote');

  const toolbarButtons = [
    { icon: <FormatBoldIcon fontSize="small" />, action: () => editor?.chain().focus().toggleBold().run(), active: editor?.isActive('bold') },
    { icon: <FormatItalicIcon fontSize="small" />, action: () => editor?.chain().focus().toggleItalic().run(), active: editor?.isActive('italic') },
    { icon: <FormatStrikethroughIcon fontSize="small" />, action: () => editor?.chain().focus().toggleStrike().run(), active: editor?.isActive('strike') },
    { icon: <TitleIcon fontSize="small" />, action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), active: editor?.isActive('heading', { level: 2 }) },
    { icon: <FormatListBulletedIcon fontSize="small" />, action: () => editor?.chain().focus().toggleBulletList().run(), active: editor?.isActive('bulletList') },
    { icon: <FormatListNumberedIcon fontSize="small" />, action: () => editor?.chain().focus().toggleOrderedList().run(), active: editor?.isActive('orderedList') },
    { icon: <FormatQuoteIcon fontSize="small" />, action: () => editor?.chain().focus().toggleBlockquote().run(), active: editor?.isActive('blockquote') },
    { icon: <HorizontalRuleIcon fontSize="small" />, action: () => editor?.chain().focus().setHorizontalRule().run(), active: false },
  ];

  return createPortal(
    <div
      className={`note-editor ${isMinimized ? 'note-editor--minimized' : ''}`}
      ref={popupRef}
      style={{
        left: position.x,
        top: position.y,
        zIndex,
        ...(isMinimized ? {} : { width: size.width, height: size.height }),
      }}
      onMouseDown={handleMouseDown}
    >
      <ModalHeader
        title={modalTitle}
        onClose={onClose}
        isMinimized={isMinimized}
        onToggleMinimize={() => toggleHidden(windowId)}
        isDragging={isDragging}
        draggable
        minimizeTitle={t('common.minimize')}
        expandTitle={t('common.expand')}
      />

      {/* Body */}
      {!isMinimized && (
        <div className="note-editor__body">
          {/* Title field */}
          <div className="note-editor__field">
            <label className="note-editor__label">{t('notes.titleField')}</label>
            <input
              className="note-editor__input"
              type="text"
              value={title}
              onChange={handleTitleChange}
              placeholder={t('notes.titlePlaceholder')}
            />
          </div>

          {/* Privacy toggle */}
          <div className="note-editor__privacy-row">
            <span className="note-editor__label">{t('notes.privacy.label')}</span>
            <label className="note-editor__privacy-option">
              <input
                type="radio"
                name="notePrivacy"
                checked={isPrivate}
                onChange={() => handlePrivacyChange(true)}
              />
              {t('notes.privacy.private')}
            </label>
            <label className="note-editor__privacy-option">
              <input
                type="radio"
                name="notePrivacy"
                checked={!isPrivate}
                onChange={() => handlePrivacyChange(false)}
              />
              {t('notes.privacy.public')}
            </label>
          </div>

          {/* WYSIWYG Toolbar */}
          <div className="note-editor__toolbar">
            {toolbarButtons.map((btn, i) => (
              <button
                key={i}
                className={`note-editor__toolbar-btn ${btn.active ? 'note-editor__toolbar-btn--active' : ''}`}
                onClick={btn.action}
                type="button"
              >
                {btn.icon}
              </button>
            ))}
          </div>

          {/* Editor content */}
          <div className="note-editor__content">
            <EditorContent editor={editor} />
          </div>

          {/* Error */}
          {saveError && <div className="note-editor__error">{saveError}</div>}

          {/* Autosave status */}
          {isSaving && <span className="note-editor__autosave-indicator">{t('common.saving')}</span>}
        </div>
      )}

      {!isMinimized && (
        <div className="note-editor__resize-handle" onMouseDown={handleResizeMouseDown} />
      )}
    </div>,
    document.body
  );
};

export default NoteEditorModal;
