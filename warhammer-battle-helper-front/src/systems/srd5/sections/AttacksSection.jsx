import React from 'react';
import { useTranslation } from 'react-i18next';
import DeleteIcon from '@mui/icons-material/Delete';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import CasinoIcon from '@mui/icons-material/Casino';
import Srd5AdvantageOverlay from '../Srd5AdvantageOverlay';

const ATTACK_ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha', 'spellcasting'];

function AttacksSection({ weapons, onWeaponChange, onAddWeapon, onRemoveWeapon, onToggleFavourite, onRollWeapon, gameId }) {
  const { t } = useTranslation();

  return (
    <div className="srd-section">
      <h4 className="srd-section-title">{t('srd.weapons')}</h4>
      {weapons.length === 0 && (
        <div className="srd-empty-hint">{t('srd.noWeapons')}</div>
      )}
      <table className="srd-weapons-table">
        <thead>
          <tr>
            <th>{t('srd.weaponName')}</th>
            <th>{t('srd.attackAbility')}</th>
            <th>{t('srd.damage')}</th>
            <th>{t('srd.damageType')}</th>
            <th>{t('srd.proficient')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {weapons.map((w, idx) => (
            <tr key={idx} className="srd-weapons-table__row">
              <td>
                <input
                  className="srd-weapons-table__input"
                  value={w.name || ''}
                  onChange={e => onWeaponChange(idx, 'name', e.target.value)}
                  placeholder={t('srd.weaponName')}
                />
              </td>
              <td>
                <select
                  className="srd-weapons-table__select"
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
                  className="srd-weapons-table__input srd-weapons-table__input--sm"
                  value={w.damage || ''}
                  onChange={e => onWeaponChange(idx, 'damage', e.target.value)}
                  placeholder="1d8"
                />
              </td>
              <td>
                <input
                  className="srd-weapons-table__input srd-weapons-table__input--sm"
                  value={w.damageType || ''}
                  onChange={e => onWeaponChange(idx, 'damageType', e.target.value)}
                  placeholder={t('srd.slashing')}
                />
              </td>
              <td style={{ textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={w.proficient ?? false}
                  onChange={e => onWeaponChange(idx, 'proficient', e.target.checked)}
                />
              </td>
              <td className="srd-weapons-table__actions">
                {gameId && (
                  <Srd5AdvantageOverlay onAdvRoll={(d) => onRollWeapon && onRollWeapon(w, d)} disabled={!w.name}>
                    <button className="srd-weapons-table__roll-btn" title={t('srd.rollWeapon')}>
                      <CasinoIcon style={{ fontSize: 18 }} />
                    </button>
                  </Srd5AdvantageOverlay>
                )}
                <button
                  className={`srd-weapons-table__fav-btn ${w.isFavourite ? 'srd-weapons-table__fav-btn--active' : ''}`}
                  onClick={() => onToggleFavourite && onToggleFavourite(idx)}
                  title={w.isFavourite ? t('removeFavorite') : t('addFavorite')}
                >
                  {w.isFavourite ? <StarIcon style={{ fontSize: 18 }} /> : <StarBorderIcon style={{ fontSize: 18 }} />}
                </button>
                <button
                  className="srd-weapons-table__del-btn"
                  onClick={() => onRemoveWeapon(idx)}
                  title={t('common.delete')}
                >
                  <DeleteIcon style={{ fontSize: 18 }} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="srd-add-btn" onClick={onAddWeapon}>
        <AddCircleOutlineIcon style={{ fontSize: 14, marginRight: 4 }} />
        {t('srd.addWeapon')}
      </button>
    </div>
  );
}

export default AttacksSection;
