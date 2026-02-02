import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { getHandouts, createHandout, updateHandout, deleteHandout, reorderHandouts } from '../../api/handouts';
import HandoutItem from './handouts/HandoutItem';
import HandoutCreateModal from './handouts/HandoutCreateModal';
import HandoutViewerModal from './handouts/HandoutViewerModal';
import './HandoutsTab.css';

/**
 * Handouts tab - manages game handouts
 */
const HandoutsTab = ({ gameId, token, gameState, isConnected }) => {
  const { t } = useTranslation();

  const [handouts, setHandouts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingHandout, setEditingHandout] = useState(null);
  const [viewingHandout, setViewingHandout] = useState(null);

  // Get current user ID from token
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

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch handouts
  const fetchHandouts = useCallback(async () => {
    if (!gameId) return;

    try {
      setIsLoading(true);
      const data = await getHandouts(gameId);
      // Sort by order
      const sorted = (data || []).sort((a, b) => a.order - b.order);
      setHandouts(sorted);
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

  // Refetch handouts when game state changes (WebSocket updates trigger this)
  useEffect(() => {
    if (isConnected && gameState?.handouts) {
      const sorted = [...gameState.handouts].sort((a, b) => a.order - b.order);
      setHandouts(sorted);
      setIsLoading(false);
    }
  }, [isConnected, gameState?.handouts]);

  // Handle create handout
  const handleCreateHandout = async (formData) => {
    try {
      const newHandout = await createHandout(gameId, formData);
      setHandouts(prev => [...prev, newHandout].sort((a, b) => a.order - b.order));
      setIsCreateModalOpen(false);
    } catch (err) {
      console.error('Failed to create handout:', err);
      setError(t('handouts.createError'));
    }
  };

  // Handle update handout
  const handleUpdateHandout = async (formData) => {
    if (!editingHandout) return;

    try {
      await updateHandout(gameId, editingHandout.id, formData);
      setHandouts(prev =>
        prev.map(h => h.id === editingHandout.id ? { ...h, ...formData } : h)
      );
      setEditingHandout(null);
    } catch (err) {
      console.error('Failed to update handout:', err);
      setError(t('handouts.updateError'));
    }
  };

  // Handle delete handout
  const handleDeleteHandout = async (handout) => {
    if (!window.confirm(t('handouts.confirmDelete', { title: handout.title }))) {
      return;
    }

    try {
      await deleteHandout(gameId, handout.id);
      setHandouts(prev => prev.filter(h => h.id !== handout.id));
    } catch (err) {
      console.error('Failed to delete handout:', err);
      setError(t('handouts.deleteError'));
    }
  };

  // Handle drag end for reordering
  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setHandouts(prev => {
        const oldIndex = prev.findIndex(h => h.id === active.id);
        const newIndex = prev.findIndex(h => h.id === over.id);
        const newOrder = arrayMove(prev, oldIndex, newIndex);

        // Update order on server
        const handoutIds = newOrder.map(h => h.id);
        reorderHandouts(gameId, handoutIds).catch(err => {
          console.error('Failed to reorder handouts:', err);
          // Revert on error
          fetchHandouts();
        });

        return newOrder;
      });
    }
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className="handouts-tab handouts-tab--loading">
        <div className="loading-spinner" />
        <span>{t('common.loading')}</span>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="handouts-tab handouts-tab--error">
        <p>{error}</p>
        <button onClick={fetchHandouts}>{t('common.retry')}</button>
      </div>
    );
  }

  return (
    <div className="handouts-tab">
      {/* Header */}
      <div className="handouts-tab__header">
        <h3 className="handouts-tab__title">{t('handouts.title')}</h3>
        {isGM && (
          <button
            className="handouts-tab__add-btn"
            onClick={() => setIsCreateModalOpen(true)}
          >
            + {t('handouts.addHandout')}
          </button>
        )}
      </div>

      {/* Handouts List */}
      {handouts.length === 0 ? (
        <div className="handouts-tab__empty">
          <div className="empty-icon">📜</div>
          <p>{t('handouts.noHandouts')}</p>
          {isGM && (
            <p className="empty-hint">{t('handouts.noHandoutsHint')}</p>
          )}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={handouts.map(h => h.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="handouts-tab__list">
              {handouts.map(handout => (
                <HandoutItem
                  key={handout.id}
                  handout={handout}
                  isGM={isGM}
                  onView={setViewingHandout}
                  onEdit={setEditingHandout}
                  onDelete={handleDeleteHandout}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Create/Edit Modal */}
      <HandoutCreateModal
        isOpen={isCreateModalOpen || !!editingHandout}
        onClose={() => {
          setIsCreateModalOpen(false);
          setEditingHandout(null);
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
