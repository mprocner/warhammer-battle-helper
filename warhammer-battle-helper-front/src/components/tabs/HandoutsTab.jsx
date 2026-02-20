import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  closestCenter,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  getHandouts,
  createHandout,
  updateHandout,
  deleteHandout,
  reorderHandouts,
  createHandoutFolder,
  renameHandoutFolder,
  deleteHandoutFolder,
  moveHandout,
  reorderHandoutFolders,
} from '../../api/handouts';
import HandoutItem from './handouts/HandoutItem';
import HandoutItemPhantom from './handouts/HandoutItemPhantom';
import HandoutFolderSection from './handouts/HandoutFolderSection';
import HandoutCreateModal from './handouts/HandoutCreateModal';
import HandoutViewerModal from './handouts/HandoutViewerModal';
import './HandoutsTab.css';

const HandoutsTab = ({ gameId, token, gameState, isConnected }) => {
  const { t } = useTranslation();

  const [handouts, setHandouts] = useState([]);
  const [folders, setFolders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Expansion state: Set of folder IDs
  const [expandedFolders, setExpandedFolders] = useState(new Set());

  // DragOverlay active item
  const [activeHandout, setActiveHandout] = useState(null);
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [activeFolder, setActiveFolder] = useState(null);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingHandout, setEditingHandout] = useState(null);
  const [viewingHandout, setViewingHandout] = useState(null);
  const [createForFolderId, setCreateForFolderId] = useState(undefined);

  // Folder creation inline form
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const getUserId = useCallback(() => {
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.user_id;
    } catch {
      return null;
    }
  }, [token]);

  const userId = getUserId();
  const isGM = gameState?.gameMasterId === userId;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { setNodeRef: setUngroupedRef, isOver: isOverUngrouped } = useDroppable({
    id: 'ungrouped',
    data: { type: 'folder', folderId: null },
  });

  // Track pointer position during drag to resolve ambiguous drops
  const pointerPosRef = useRef({ x: 0, y: 0 });
  const ungroupedElRef = useRef(null);

  const setUngroupedCombinedRef = useCallback(
    (el) => {
      ungroupedElRef.current = el;
      setUngroupedRef(el);
    },
    [setUngroupedRef]
  );

  const handleDragMove = useCallback((event) => {
    const { activatorEvent, delta } = event;
    if (activatorEvent) {
      pointerPosRef.current = {
        x: (activatorEvent.clientX || 0) + (delta?.x || 0),
        y: (activatorEvent.clientY || 0) + (delta?.y || 0),
      };
    }
  }, []);

  const collisionDetection = useCallback((args) => {
    const pointerHits = pointerWithin(args);
    if (pointerHits.length > 0) return pointerHits;
    return closestCenter(args);
  }, []);

  // ─── Data fetching ────────────────────────────────────────────────────────

  const fetchHandouts = useCallback(async () => {
    if (!gameId) return;
    try {
      setIsLoading(true);
      const data = await getHandouts(gameId);
      setHandouts(data?.handouts || []);
      const fetchedFolders = data?.handoutFolders || [];
      setFolders(fetchedFolders);
      setError('');
    } catch (err) {
      console.error('Failed to fetch handouts:', err);
      setError(t('handouts.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [gameId, t]);

  useEffect(() => {
    fetchHandouts();
  }, [fetchHandouts]);

  // Sync from game state (WebSocket updates via fetchGameState)
  useEffect(() => {
    if (!isConnected) return;
    if (gameState?.handouts !== undefined) {
      setHandouts(gameState.handouts || []);
    }
    if (gameState?.handoutFolders !== undefined) {
      setFolders(gameState.handoutFolders || []);
    }
    setIsLoading(false);
  }, [isConnected, gameState?.handouts, gameState?.handoutFolders]);

  // ─── Grouping ─────────────────────────────────────────────────────────────

  const handoutsByFolder = useMemo(() => {
    const map = new Map();
    map.set(null, []);
    folders.forEach((f) => map.set(f.id, []));

    handouts.forEach((h) => {
      const fid = h.folderId || null;
      const folderExists = fid && folders.some((f) => f.id === fid);
      if (folderExists) {
        map.get(fid).push(h);
      } else {
        map.get(null).push(h);
      }
    });

    // Sort each group by order
    for (const [key, items] of map.entries()) {
      map.set(key, [...items].sort((a, b) => a.order - b.order));
    }

    return map;
  }, [handouts, folders]);

  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => a.order - b.order),
    [folders]
  );

  // Keep a ref so handleDragOver (useCallback with []) can read current groupings
  const handoutsByFolderRef = useRef(handoutsByFolder);
  useEffect(() => {
    handoutsByFolderRef.current = handoutsByFolder;
  }, [handoutsByFolder]);

  // ─── Folder expand/collapse ───────────────────────────────────────────────

  const toggleFolder = useCallback((id) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // ─── Handout CRUD ─────────────────────────────────────────────────────────

  const handleOpenCreateForFolder = (folderId) => {
    setCreateForFolderId(folderId);
    setIsCreateModalOpen(true);
  };

  const handleCreateHandout = async (formData) => {
    try {
      const newHandout = await createHandout(gameId, formData);
      if (createForFolderId) {
        await moveHandout(gameId, newHandout.id, createForFolderId);
        setHandouts((prev) => [...prev, { ...newHandout, folderId: createForFolderId }]);
      } else {
        setHandouts((prev) => [...prev, newHandout]);
      }
      setCreateForFolderId(undefined);
      setIsCreateModalOpen(false);
    } catch (err) {
      console.error('Failed to create handout:', err);
      setError(t('handouts.createError'));
    }
  };

  const handleUpdateHandout = async (formData) => {
    if (!editingHandout) return;
    try {
      await updateHandout(gameId, editingHandout.id, formData);
      setHandouts((prev) =>
        prev.map((h) => (h.id === editingHandout.id ? { ...h, ...formData } : h))
      );
      setEditingHandout(null);
    } catch (err) {
      console.error('Failed to update handout:', err);
      setError(t('handouts.updateError'));
    }
  };

  const handleDeleteHandout = async (handout) => {
    if (!window.confirm(t('handouts.confirmDelete', { title: handout.title }))) return;
    try {
      await deleteHandout(gameId, handout.id);
      setHandouts((prev) => prev.filter((h) => h.id !== handout.id));
    } catch (err) {
      console.error('Failed to delete handout:', err);
      setError(t('handouts.deleteError'));
    }
  };

  // ─── Folder CRUD ──────────────────────────────────────────────────────────

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    try {
      const folder = await createHandoutFolder(gameId, trimmed);
      setFolders((prev) => [...prev, folder]);
      setExpandedFolders((prev) => new Set([...prev, folder.id]));
      setNewFolderName('');
      setIsCreatingFolder(false);
    } catch (err) {
      console.error('Failed to create folder:', err);
      setError(t('handouts.folders.createError'));
    }
  };

  const handleRenameFolder = async (folderId, name) => {
    try {
      await renameHandoutFolder(gameId, folderId, name);
      setFolders((prev) =>
        prev.map((f) => (f.id === folderId ? { ...f, name } : f))
      );
    } catch (err) {
      console.error('Failed to rename folder:', err);
      setError(t('handouts.folders.renameError'));
    }
  };

  const handleDeleteFolder = async (folderId) => {
    try {
      await deleteHandoutFolder(gameId, folderId);
      setFolders((prev) => prev.filter((f) => f.id !== folderId));
      // Ungroup handouts that were in this folder
      setHandouts((prev) =>
        prev.map((h) => (h.folderId === folderId ? { ...h, folderId: undefined } : h))
      );
    } catch (err) {
      console.error('Failed to delete folder:', err);
      setError(t('handouts.folders.deleteError'));
    }
  };

  // ─── DnD ──────────────────────────────────────────────────────────────────

  // dragOverState: where to show the cross-container drop indicator
  // { targetFolderId: string|null, insertBeforeId: string|null }
  const [dragOverState, setDragOverState] = useState(null);

  const handleDragStart = (event) => {
    const { active } = event;
    const activeType = active.data.current?.type;
    setDragOverState(null);
    if (activeType === 'folder-item') {
      const f = folders.find((x) => x.id === active.data.current?.folderId);
      setActiveFolder(f || null);
      setActiveHandout(null);
    } else {
      const h = handouts.find((x) => x.id === active.id);
      setActiveHandout(h || null);
      setActiveFolderId(active.data.current?.folderId ?? null);
      setActiveFolder(null);
    }
  };

  const handleDragOver = useCallback((event) => {
    const { active, over } = event;
    if (!over || !active || active.data.current?.type === 'folder-item') {
      setDragOverState(null);
      return;
    }
    const activeFolderIdCurrent = active.data.current?.folderId ?? null;
    const overFolderId = over.data.current?.folderId ?? null;

    // Only show indicator for cross-container drags
    if (activeFolderIdCurrent === overFolderId) {
      setDragOverState(null);
      return;
    }

    const overType = over.data.current?.type;
    if (overType === 'handout') {
      // Determine if pointer is above or below the item's center
      const overRect = over.rect;
      const pointerY = pointerPosRef.current.y;
      const insertAfter = overRect && pointerY > overRect.top + overRect.height / 2;

      if (insertAfter) {
        // Show indicator after this item = before the next item
        const folderHandouts = handoutsByFolderRef.current.get(overFolderId) || [];
        const overIndex = folderHandouts.findIndex((h) => h.id === over.id);
        const nextHandout = folderHandouts[overIndex + 1];
        setDragOverState({ targetFolderId: overFolderId, insertBeforeId: nextHandout?.id ?? null });
      } else {
        setDragOverState({ targetFolderId: overFolderId, insertBeforeId: over.id });
      }
    } else if (overType === 'folder') {
      setDragOverState({ targetFolderId: overFolderId, insertBeforeId: null });
    } else {
      setDragOverState(null);
    }
  }, []);

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveHandout(null);
    setActiveFolderId(null);
    setActiveFolder(null);
    setDragOverState(null);

    // When collision detection fails (no over, or over is the item itself),
    // fall back to checking if the pointer is physically inside the ungrouped area.
    if (!over || active.id === over.id) {
      const sourceHandout = active.data.current?.handout;
      const sourceFolderId = active.data.current?.folderId ?? null;
      if (sourceHandout && sourceFolderId !== null && ungroupedElRef.current) {
        const rect = ungroupedElRef.current.getBoundingClientRect();
        const { x, y } = pointerPosRef.current;
        if (y >= rect.top && y <= rect.bottom && x >= rect.left && x <= rect.right) {
          setHandouts((prev) =>
            prev.map((h) =>
              h.id === sourceHandout.id ? { ...h, folderId: undefined } : h
            )
          );
          try {
            await moveHandout(gameId, sourceHandout.id, null);
          } catch (err) {
            console.error('Failed to move handout to ungrouped:', err);
            fetchHandouts();
          }
        }
      }
      return;
    }

    const activeType = active.data.current?.type;

    // ── Folder reordering ──────────────────────────────────────────────────
    if (activeType === 'folder-item') {
      const overType = over.data.current?.type;
      if (overType !== 'folder-item') return;

      const sourceFolderId = active.data.current?.folderId;
      const targetFolderId = over.data.current?.folderId;
      if (sourceFolderId === targetFolderId) return;

      const oldIndex = sortedFolders.findIndex((f) => f.id === sourceFolderId);
      const newIndex = sortedFolders.findIndex((f) => f.id === targetFolderId);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(sortedFolders, oldIndex, newIndex).map((f, i) => ({ ...f, order: i }));
      setFolders(reordered);
      reorderHandoutFolders(gameId, reordered.map((f) => f.id)).catch((err) => {
        console.error('Failed to reorder folders:', err);
        fetchHandouts();
      });
      return;
    }

    // ── Handout move / reorder ─────────────────────────────────────────────
    const sourceHandout = active.data.current?.handout;
    if (!sourceHandout) return;

    const sourceFolderId = active.data.current?.folderId ?? null;
    const overType = over.data.current?.type;

    if (overType === 'folder' || overType === 'folder-item') {
      // Dropped onto a folder area (droppable or sortable) – append to end
      const targetFolderId = over.data.current?.folderId ?? null;
      if (sourceFolderId !== targetFolderId) {
        const targetFolderHandouts = [...(handoutsByFolder.get(targetFolderId) || [])];
        const movedHandout = { ...sourceHandout, folderId: targetFolderId || undefined };
        targetFolderHandouts.push(movedHandout);
        const reorderedTarget = targetFolderHandouts.map((h, i) => ({ ...h, order: i }));

        const reorderedSource = (handoutsByFolder.get(sourceFolderId) || [])
          .filter((h) => h.id !== sourceHandout.id)
          .map((h, i) => ({ ...h, order: i }));

        const otherHandouts = handouts.filter((h) => {
          const fid = h.folderId || null;
          return fid !== sourceFolderId && fid !== targetFolderId;
        });

        const allHandouts = [...reorderedTarget, ...reorderedSource, ...otherHandouts];
        setHandouts(allHandouts);
        try {
          await moveHandout(gameId, sourceHandout.id, targetFolderId);
          await reorderHandouts(gameId, allHandouts.map((h) => h.id));
        } catch (err) {
          console.error('Failed to move handout:', err);
          fetchHandouts();
        }
      }
    } else if (overType === 'handout') {
      const targetHandout = over.data.current?.handout;
      const targetFolderId = over.data.current?.folderId ?? null;

      if (sourceFolderId === targetFolderId) {
        // Same folder → reorder
        const folderHandouts = handoutsByFolder.get(targetFolderId) || [];
        const oldIndex = folderHandouts.findIndex((h) => h.id === sourceHandout.id);
        const newIndex = folderHandouts.findIndex((h) => h.id === targetHandout.id);

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const reordered = arrayMove(folderHandouts, oldIndex, newIndex).map((h, i) => ({ ...h, order: i }));
          const otherHandouts = handouts.filter(
            (h) => (h.folderId || null) !== targetFolderId
          );
          setHandouts([...reordered, ...otherHandouts]);
          const allIds = [...reordered.map((h) => h.id), ...otherHandouts.map((h) => h.id)];
          reorderHandouts(gameId, allIds).catch((err) => {
            console.error('Failed to reorder handouts:', err);
            fetchHandouts();
          });
        }
      } else {
        // Different folder → move and insert at the specific position
        const targetFolderHandouts = [...(handoutsByFolder.get(targetFolderId) || [])];
        const targetIndex = targetFolderHandouts.findIndex((h) => h.id === targetHandout.id);
        const movedHandout = { ...sourceHandout, folderId: targetFolderId || undefined };
        // Insert before or after based on pointer vs item center
        const overCenter = over.rect.top + over.rect.height / 2;
        const insertAfter = pointerPosRef.current.y > overCenter;
        const insertIndex = insertAfter ? targetIndex + 1 : targetIndex;
        if (targetIndex !== -1) {
          targetFolderHandouts.splice(insertIndex, 0, movedHandout);
        } else {
          targetFolderHandouts.push(movedHandout);
        }
        const reorderedTarget = targetFolderHandouts.map((h, i) => ({ ...h, order: i }));

        const reorderedSource = (handoutsByFolder.get(sourceFolderId) || [])
          .filter((h) => h.id !== sourceHandout.id)
          .map((h, i) => ({ ...h, order: i }));

        const otherHandouts = handouts.filter((h) => {
          const fid = h.folderId || null;
          return fid !== sourceFolderId && fid !== targetFolderId;
        });

        const allHandouts = [...reorderedTarget, ...reorderedSource, ...otherHandouts];
        setHandouts(allHandouts);
        try {
          await moveHandout(gameId, sourceHandout.id, targetFolderId);
          await reorderHandouts(gameId, allHandouts.map((h) => h.id));
        } catch (err) {
          console.error('Failed to move handout:', err);
          fetchHandouts();
        }
      }
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="handouts-tab handouts-tab--loading">
        <div className="loading-spinner" />
        <span>{t('common.loading')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="handouts-tab handouts-tab--error">
        <p>{error}</p>
        <button onClick={() => { setError(''); fetchHandouts(); }}>{t('common.retry')}</button>
      </div>
    );
  }

  const totalHandouts = handouts.length;

  return (
    <div className="handouts-tab">
      {/* Header */}
      <div className="handouts-tab__header">
        <h3 className="handouts-tab__title">{t('handouts.title')}</h3>
        {isGM && (
          <div className="handouts-tab__header-actions">
            <button
              className="handouts-tab__add-btn"
              onClick={() => setIsCreateModalOpen(true)}
            >
              + {t('handouts.addHandout')}
            </button>
            <button
              className="handouts-tab__add-btn"
              onClick={() => setIsCreatingFolder((v) => !v)}
            >
              + {t('handouts.folders.createFolder')}
            </button>
          </div>
        )}
      </div>

      {/* Inline folder creation form */}
      {isGM && isCreatingFolder && (
        <form className="handouts-tab__folder-form" onSubmit={handleCreateFolder}>
          <input
            className="handouts-tab__folder-input"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder={t('handouts.folders.namePlaceholder')}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Escape') setIsCreatingFolder(false); }}
          />
          <button className="handouts-tab__folder-submit" type="submit">
            {t('common.create')}
          </button>
          <button
            className="handouts-tab__folder-cancel"
            type="button"
            onClick={() => { setIsCreatingFolder(false); setNewFolderName(''); }}
          >
            {t('common.cancel')}
          </button>
        </form>
      )}

      {/* Empty state when there are no handouts AND no folders */}
      {totalHandouts === 0 && folders.length === 0 ? (
        <div className="handouts-tab__empty">
          <div className="empty-icon">📜</div>
          <p>{t('handouts.noHandouts')}</p>
          {isGM && <p className="empty-hint">{t('handouts.noHandoutsHint')}</p>}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="handouts-tab__list">
            {/* Named folders – wrapped in SortableContext for folder reordering */}
            <SortableContext
              items={sortedFolders.map((f) => `folder-sort-${f.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {sortedFolders.map((folder) => {
                const isTarget =
                  dragOverState?.targetFolderId === folder.id && activeHandout !== null;
                return (
                  <HandoutFolderSection
                    key={folder.id}
                    folder={folder}
                    handouts={handoutsByFolder.get(folder.id) || []}
                    isGM={isGM}
                    isExpanded={expandedFolders.has(folder.id)}
                    onToggle={() => toggleFolder(folder.id)}
                    onView={setViewingHandout}
                    onEdit={setEditingHandout}
                    onDelete={handleDeleteHandout}
                    onAddHandout={() => handleOpenCreateForFolder(folder.id)}
                    onRenameFolder={handleRenameFolder}
                    onDeleteFolder={handleDeleteFolder}
                    phantomHandout={isTarget ? activeHandout : null}
                    insertPhantomBeforeId={isTarget ? dragOverState.insertBeforeId : undefined}
                  />
                );
              })}
            </SortableContext>

            {/* Ungrouped handouts – flat list below folders, droppable */}
            {(() => {
              const ungrouped = handoutsByFolder.get(null) || [];
              const isEmpty = ungrouped.length === 0;
              const isDraggingFromFolder = activeHandout !== null && activeFolderId !== null;
              return (
                <div
                  ref={setUngroupedCombinedRef}
                  className={`handouts-tab__ungrouped${isEmpty ? ' handouts-tab__ungrouped--empty' : ''}${isOverUngrouped ? ' handouts-tab__ungrouped--drag-over' : ''}${isDraggingFromFolder ? ' handouts-tab__ungrouped--active-drag' : ''}`}
                >
                  <SortableContext
                    items={ungrouped.map((h) => h.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {isEmpty ? (
                      <span className="handouts-tab__ungrouped-placeholder">
                        {isDraggingFromFolder
                          ? t('handouts.folders.dropToUngroup')
                          : t('handouts.folders.emptyPlaceholder')}
                      </span>
                    ) : (
                      <>
                        {ungrouped.map((handout) => (
                          <React.Fragment key={handout.id}>
                            {dragOverState?.targetFolderId === null &&
                              activeHandout !== null &&
                              dragOverState?.insertBeforeId === handout.id && (
                                <HandoutItemPhantom handout={activeHandout} isGM={isGM} />
                              )}
                            <HandoutItem
                              handout={handout}
                              isGM={isGM}
                              folderId={null}
                              onView={setViewingHandout}
                              onEdit={setEditingHandout}
                              onDelete={handleDeleteHandout}
                            />
                          </React.Fragment>
                        ))}
                        {dragOverState?.targetFolderId === null &&
                          activeHandout !== null &&
                          dragOverState?.insertBeforeId === null && (
                            <HandoutItemPhantom handout={activeHandout} isGM={isGM} />
                          )}
                      </>
                    )}
                  </SortableContext>
                </div>
              );
            })()}
          </div>

          <DragOverlay>
            {activeFolder ? (
              /* Folder drag preview – simple label */
              <div className="handouts-tab__folder-drag-preview">
                📁 {activeFolder.name}
              </div>
            ) : activeHandout ? (
              <HandoutItem
                handout={activeHandout}
                isGM={isGM}
                folderId={activeFolderId}
                onView={() => {}}
                onEdit={() => {}}
                onDelete={() => {}}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Create/Edit Modal */}
      <HandoutCreateModal
        isOpen={isCreateModalOpen || !!editingHandout}
        onClose={() => {
          setIsCreateModalOpen(false);
          setEditingHandout(null);
          setCreateForFolderId(undefined);
        }}
        onSave={editingHandout ? handleUpdateHandout : handleCreateHandout}
        gameId={gameId}
        participants={gameState?.participants || []}
        editHandout={editingHandout}
      />

      {/* Viewer Modal */}
      <HandoutViewerModal
        isOpen={!!viewingHandout}
        onClose={() => setViewingHandout(null)}
        handout={viewingHandout}
      />
    </div>
  );
};

export default HandoutsTab;
