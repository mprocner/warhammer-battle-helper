import React from 'react';
import { useTranslation } from 'react-i18next';
import CoCDiceModOverlay from '../CoCDiceModOverlay';
import CasinoIcon from '@mui/icons-material/Casino';
import StarIcon from '@mui/icons-material/Star';
import CloseIcon from '@mui/icons-material/Close';

function WeaponsSection({ weapons, customSkills, onWeaponFieldChange, onRemoveWeapon, onAddWeapon, onToggleFavourite, onRollWeapon, gameId }) {
  const { t } = useTranslation();
  return (
    <div className="coc-section">
      <h4 className="coc-section-title">{t('coc.weapons')}</h4>
      <table className="coc-weapons-table">
        <thead>
          <tr>
            <th title={t('coc.favorite')}><StarIcon sx={{ fontSize: 14 }} /></th>
            <th>{t('coc.weaponName')}</th>
            <th>{t('coc.weaponDamage')}</th>
            <th>{t('coc.weaponRange')}</th>
            <th className="coc-weapons-table__col--narrow">{t('coc.weaponAttacks')}</th>
            <th className="coc-weapons-table__col--narrow">{t('coc.weaponAmmo')}</th>
            <th className="coc-weapons-table__col--narrow">{t('coc.weaponMalfunction')}</th>
            <th>{t('coc.weaponSkillLabel')}</th>
            <th className="coc-weapons-table__col--actions"></th>
          </tr>
        </thead>
        <tbody>
          {weapons.map((w, i) => (
            <tr key={i}>
              <td>
                <input
                  type="checkbox"
                  checked={w.isFavourite || false}
                  onChange={() => onToggleFavourite(i)}
                />
              </td>
              <td><input value={w.name || ''} onChange={e => onWeaponFieldChange(i, 'name', e.target.value)} /></td>
              <td><input value={w.damage || ''} onChange={e => onWeaponFieldChange(i, 'damage', e.target.value)} /></td>
              <td><input value={w.range || ''} onChange={e => onWeaponFieldChange(i, 'range', e.target.value)} /></td>
              <td><input type="number" value={w.attacks ?? ''} onChange={e => onWeaponFieldChange(i, 'attacks', parseInt(e.target.value) || 0)} min={0} /></td>
              <td><input type="number" value={w.ammo ?? ''} onChange={e => onWeaponFieldChange(i, 'ammo', parseInt(e.target.value) || 0)} min={0} /></td>
              <td><input type="number" value={w.malfunction ?? ''} onChange={e => onWeaponFieldChange(i, 'malfunction', parseInt(e.target.value) || 0)} min={0} /></td>
              <td>
                <select
                  className="coc-weapon-skill-select"
                  value={w.skillKey || 'fighting_brawl'}
                  onChange={e => onWeaponFieldChange(i, 'skillKey', e.target.value)}
                >
                  <option value="fighting_brawl">{t('coc.skill_fighting_brawl')}</option>
                  <option value="firearms_handgun">{t('coc.skill_firearms_handgun')}</option>
                  <option value="firearms_rifle">{t('coc.skill_firearms_rifle')}</option>
                  {customSkills.filter(cs => cs.name).map(cs => (
                    <option key={cs.key} value={cs.key}>{cs.name}</option>
                  ))}
                </select>
              </td>
              <td className="coc-weapons-table__actions">
                {gameId && (
                  <CoCDiceModOverlay onDiceModRoll={(d) => onRollWeapon(w, d)} disabled={!gameId}>
                    <button className="coc-roll-btn" title={t('coc.rollWeapon')}>
                      <CasinoIcon fontSize="small" />
                    </button>
                  </CoCDiceModOverlay>
                )}
                {i !== 0 && (
                  <button className="coc-remove-btn" onClick={() => onRemoveWeapon(i)}><CloseIcon fontSize="small" /></button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="coc-add-btn" onClick={onAddWeapon}>
        + {t('coc.addWeapon')}
      </button>
    </div>
  );
}

export default WeaponsSection;
