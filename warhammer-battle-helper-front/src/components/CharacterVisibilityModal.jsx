import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ModalHeader from './common/ModalHeader';
import { getApiUrl, getApiHeaders } from '../api/axios';
import { resolveDisplayName } from '../utils/participants';

function CharacterVisibilityModal({ character, participants, gameId, token, onClose }) {
  const { t } = useTranslation();

  // Pre-fill checkboxes from current visibleTo
  const [selectedIds, setSelectedIds] = useState(() =>
    new Set((character.visibleTo || []).map(id =>
      typeof id === 'string' ? id : id
    ))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);

  // Only show non-GM participants
  const playerParticipants = (participants || []).filter(p => p.role !== 'gm');

  const handleToggle = (userId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `${getApiUrl()}/games/${gameId}/characters/${character.id}/visibility`,
        {
          method: 'PUT',
          headers: getApiHeaders({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }),
          body: JSON.stringify({ visibleTo: Array.from(selectedIds) })
        }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update visibility');
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="clone-modal-overlay" onClick={onClose}>
      <div className={`clone-modal ${isMinimized ? 'clone-modal--minimized' : ''}`} onClick={e => e.stopPropagation()}>
        <ModalHeader
          title={t('character.manageVisibility')}
          onClose={onClose}
          isMinimized={isMinimized}
          onToggleMinimize={() => setIsMinimized(v => !v)}
          minimizeTitle={t('common.minimize')}
          expandTitle={t('common.expand')}
        />
        <div className="clone-modal__body">
          <p className="clone-modal__character-name">{character.basicInfo?.name}</p>

          {playerParticipants.length === 0 ? (
            <p>{t('character.noParticipants')}</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0' }}>
              {playerParticipants.map(p => (
                <li key={p.userId} style={{ padding: '4px 0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.userId)}
                      onChange={() => handleToggle(p.userId)}
                    />
                    <span>{resolveDisplayName(p) || p.username}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {error && <p style={{ color: 'red', fontSize: '0.85em' }}>{error}</p>}

          <div className="clone-modal__actions">
            <button className="clone-modal__btn clone-modal__btn--cancel" onClick={onClose} disabled={saving}>
              {t('common.cancel')}
            </button>
            <button className="clone-modal__btn clone-modal__btn--confirm" onClick={handleSave} disabled={saving}>
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CharacterVisibilityModal;
