import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiUrl, getApiHeaders } from '../api/axios';

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
      <div className="clone-modal" onClick={e => e.stopPropagation()}>
        <div className="clone-modal__header">
          <h2>{t('character.manageVisibility')}</h2>
          <button className="clone-modal__close" onClick={onClose}>×</button>
        </div>
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
                    <span>{p.username || p.email}</span>
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
