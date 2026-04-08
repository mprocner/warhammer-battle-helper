import React from 'react';
import { useTranslation } from 'react-i18next';
import DeleteIcon from '@mui/icons-material/Delete';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import DnD5eAdvantageOverlay from '../DnD5eAdvantageOverlay';

const ATTACK_ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha', 'spellcasting'];

function AttacksSection({ weapons, onWeaponChange, onAddWeapon, onRemoveWeapon, onToggleFavourite, onRollWeapon, gameId }) {
  const { t } = useTranslation();

  return (
    <div className="dnd-section">
      <h4 className="dnd-section-title">{t('dnd.weapons')}</h4>
      {weapons.length === 0 && (
        <div className="dnd-empty-hint">{t('dnd.noWeapons')}</div>
      )}
      <table className="dnd-weapons-table">
        <thead>
          <tr>
            <th>{t('dnd.weaponName')}</th>
            <th>{t('dnd.attackAbility')}</th>
            <th>{t('dnd.damage')}</th>
            <th>{t('dnd.damageType')}</th>
            <th>{t('dnd.proficient')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {weapons.map((w, idx) => (
            <tr key={idx} className="dnd-weapons-table__row">
              <td>
                <DnD5eAdvantageOverlay
                  onAdvRoll={(d) => onRollWeapon && onRollWeapon(w, d)}
                  disabled={!gameId || !w.name}
                >
                  <input
                    className="dnd-weapons-table__input"
                    value={w.name || ''}
                    onChange={e => onWeaponChange(idx, 'name', e.target.value)}
                    placeholder={t('dnd.weaponName')}
                    onClick={e => e.stopPropagation()}
                  />
                </DnD5eAdvantageOverlay>
              </td>
              <td>
                <select
                  className="dnd-weapons-table__select"
                  value={w.attackAbility || 'str'}
                  onChange={e => onWeaponChange(idx, 'attackAbility', e.target.value)}
                >
                  {ATTACK_ABILITIES.map(a => (
                    <option key={a} value={a}>{a.toUpperCase()}</option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  className="dnd-weapons-table__input dnd-weapons-table__input--sm"
                  value={w.damage || ''}
                  onChange={e => onWeaponChange(idx, 'damage', e.target.value)}
                  placeholder="1d8"
                />
              </td>
              <td>
                <input
                  className="dnd-weapons-table__input dnd-weapons-table__input--sm"
                  value={w.damageType || ''}
                  onChange={e => onWeaponChange(idx, 'damageType', e.target.value)}
                  placeholder={t('dnd.slashing')}
                />
              </td>
              <td style={{ textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={w.proficient ?? false}
                  onChange={e => onWeaponChange(idx, 'proficient', e.target.checked)}
                />
              </td>
              <td className="dnd-weapons-table__actions">
                <button
                  className={`dnd-weapons-table__fav-btn ${w.isFavourite ? 'dnd-weapons-table__fav-btn--active' : ''}`}
                  onClick={() => onToggleFavourite && onToggleFavourite(idx)}
                  title={w.isFavourite ? t('removeFavorite') : t('addFavorite')}
                >
                  {w.isFavourite ? <StarIcon style={{ fontSize: 14 }} /> : <StarBorderIcon style={{ fontSize: 14 }} />}
                </button>
                <button
                  className="dnd-weapons-table__del-btn"
                  onClick={() => onRemoveWeapon(idx)}
                  title={t('common.delete')}
                >
                  <DeleteIcon style={{ fontSize: 14 }} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="dnd-add-btn" onClick={onAddWeapon}>
        <AddCircleOutlineIcon style={{ fontSize: 14, marginRight: 4 }} />
        {t('dnd.addWeapon')}
      </button>
    </div>
  );
}

export default AttacksSection;
