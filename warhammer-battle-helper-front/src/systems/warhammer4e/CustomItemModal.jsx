import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ModalHeader from '../../components/common/ModalHeader';

const CHARACTERISTICS = [
    'WEAPON_SKILL', 'BALLISTIC_SKILL', 'STRENGTH', 'TOUGHNESS', 'INITIATIVE',
    'AGILITY', 'DEXTERITY', 'INTELLIGENCE', 'WILLPOWER', 'FELLOWSHIP'
];

function CustomItemModal({ type, isEditing, form, onChange, onSave, onCancel }) {
    const { t } = useTranslation();
    const [isMinimized, setIsMinimized] = useState(false);

    const title = type === 'skill'
        ? (isEditing ? t('characterSheet.editCustomSkillModalTitle') : t('characterSheet.customSkillModalTitle'))
        : (isEditing ? t('characterSheet.editCustomTalentModalTitle') : t('characterSheet.customTalentModalTitle'));

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') onCancel();
    };

    return (
        <div className="custom-item-modal-overlay" onClick={onCancel}>
            <div className={`custom-item-modal ${isMinimized ? 'custom-item-modal--minimized' : ''}`} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
                <ModalHeader
                    title={title}
                    onClose={onCancel}
                    isMinimized={isMinimized}
                    onToggleMinimize={() => setIsMinimized(v => !v)}
                    minimizeTitle={t('common.minimize')}
                    expandTitle={t('common.expand')}
                />

                <div className="custom-item-modal__body">
                    <label className="custom-item-modal__label">
                        {t('characterSheet.skillName')}
                        <input
                            type="text"
                            className="custom-item-modal__input"
                            value={form.name}
                            onChange={(e) => onChange({ ...form, name: e.target.value })}
                            autoFocus
                        />
                    </label>

                    {type === 'skill' && (
                        <label className="custom-item-modal__label">
                            {t('characterSheet.skillAttribute')}
                            <select
                                className="custom-item-modal__input"
                                value={form.characteristic}
                                onChange={(e) => onChange({ ...form, characteristic: e.target.value })}
                            >
                                {CHARACTERISTICS.map(char => (
                                    <option key={char} value={char}>{t(`characteristicsShort.${char}`)}</option>
                                ))}
                            </select>
                        </label>
                    )}

                    <label className="custom-item-modal__label">
                        {t('characterSheet.skillDescription')}
                        <textarea
                            className="custom-item-modal__textarea"
                            value={form.description}
                            onChange={(e) => onChange({ ...form, description: e.target.value })}
                        />
                    </label>

                    <div className="custom-item-modal__actions">
                        <button className="custom-item-modal__btn custom-item-modal__btn--cancel" onClick={onCancel}>
                            {t('common.cancel')}
                        </button>
                        <button className="custom-item-modal__btn custom-item-modal__btn--confirm" onClick={onSave}>
                            {t('common.save')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default CustomItemModal;
