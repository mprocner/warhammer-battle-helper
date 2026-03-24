import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SaveIcon from '@mui/icons-material/Save';
import CheckIcon from '@mui/icons-material/Check';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';

import DraggablePopup from '../common/DraggablePopup';
import ModifierSelectionModal from './ModifierSelectionModal';

import useAutoSave from './hooks/useAutoSave';
import useRollActions from './hooks/useRollActions';

import CharacterInfoSection from './sections/CharacterInfoSection';
import ResourceBoxesSection from './sections/ResourceBoxesSection';
import TalentsSection from './sections/TalentsSection';
import WeaponsSection from './sections/WeaponsSection';
import ArmourSection from './sections/ArmourSection';
import ArmourPointsSection from './ArmourPointsSection';
import WealthSection from './sections/WealthSection';
import CharacteristicsSection from './sections/CharacteristicsSection';
import BasicSkillsSection from './sections/BasicSkillsSection';
import WeaponSkillsSection from './sections/WeaponSkillsSection';
import MagicSkillsSection from './sections/MagicSkillsSection';
import AdvancedSkillsSection from './sections/AdvancedSkillsSection';
import SpellsSection from './sections/SpellsSection';
import NotesSection from './sections/NotesSection';

function CharacterSheetPopup({ character, onClose, onCharacterUpdate, addLogMessage, gameId, token, isGM = false, isStandalone = false, rollVisibility = 'all' }) {
    const { t } = useTranslation();

    const {
        editedCharacter,
        setEditedCharacter,
        isSaving,
        saveSuccess,
        handleSave,
        scheduleAutoSave
    } = useAutoSave(character, onCharacterUpdate, isGM, gameId);

    const getCharacterSaveUrl = useCallback((charId) => {
        if (gameId) return `/games/${gameId}/characters/${charId}`;
        return `/characters/${charId}`;
    }, [gameId]);

    const {
        showModifierModal,
        mousePosition,
        handleCharacteristicClick,
        handleSkillClick,
        handleModifierConfirm,
        handleModifierCancel
    } = useRollActions(gameId, token, character.id, editedCharacter.basicInfo?.name, addLogMessage, rollVisibility);

    // Generic field change with deep path support and characteristic recalculation
    const handleFieldChange = useCallback((path, value) => {
        const numericFields = [
            'characteristics.initial',
            'characteristics.advances',
            'fate.fate',
            'fate.fortune',
            'resilience.resilience',
            'resilience.resolve',
            'experience.current',
            'experience.spent',
            'experience.total',
            'armourPoints.head',
            'armourPoints.leftArm',
            'armourPoints.rightArm',
            'armourPoints.body',
            'armourPoints.leftLeg',
            'armourPoints.rightLeg',
            'armourPoints.shield'
        ];

        setEditedCharacter(prev => {
            const next = JSON.parse(JSON.stringify(prev));
            const pathParts = path.split('.');
            let cur = next;
            for (let i = 0; i < pathParts.length - 1; i++) {
                if (!cur[pathParts[i]]) cur[pathParts[i]] = {};
                cur = cur[pathParts[i]];
            }
            const lastKey = pathParts[pathParts.length - 1];
            const shouldConvertToInt = numericFields.some(f => path.startsWith(f));
            cur[lastKey] = shouldConvertToInt ? (parseInt(value) || 0) : value;

            if (path.startsWith('characteristics.initial') || path.startsWith('characteristics.advances')) {
                const stats = ['WS', 'BS', 'S', 'T', 'I', 'Ag', 'Dex', 'Int', 'WP', 'Fel'];
                if (!next.characteristics) next.characteristics = {};
                next.characteristics.current = {};
                stats.forEach(stat => {
                    const initial = parseInt(next.characteristics?.initial?.[stat]) || 0;
                    const advances = parseInt(next.characteristics?.advances?.[stat]) || 0;
                    next.characteristics.current[stat] = initial + advances;
                });
            }

            return next;
        });
        scheduleAutoSave();
    }, [setEditedCharacter, scheduleAutoSave]);

    // Shared characteristic value lookup used by skill sections
    const getCharacteristicValue = useCallback((characteristic) => {
        const mapping = {
            'WEAPON_SKILL': 'WS', 'BALLISTIC_SKILL': 'BS', 'STRENGTH': 'S',
            'TOUGHNESS': 'T', 'INITIATIVE': 'I', 'AGILITY': 'Ag',
            'DEXTERITY': 'Dex', 'INTELLIGENCE': 'Int', 'WILLPOWER': 'WP', 'FELLOWSHIP': 'Fel'
        };
        const shortKey = mapping[characteristic] || characteristic;
        const stats = ['WS', 'BS', 'S', 'T', 'I', 'Ag', 'Dex', 'Int', 'WP', 'Fel'];
        const current = {};
        stats.forEach(stat => {
            const initial = parseInt(editedCharacter.characteristics?.initial?.[stat]) || 0;
            const advances = parseInt(editedCharacter.characteristics?.advances?.[stat]) || 0;
            current[stat] = initial + advances;
        });
        return current[shortKey] || 0;
    }, [editedCharacter.characteristics]);

    const handlePopOut = useCallback(() => {
        const params = new URLSearchParams({ characterId: character.id });
        if (gameId) params.set('gameId', gameId);
        window.open(`/character-sheet?${params.toString()}`, '_blank', 'width=1400,height=900,noopener');
    }, [character.id, gameId]);

    const headerButtons = (
        <>
            {!isStandalone && (
                <button
                    className="pop-out-btn-sheet"
                    onClick={(e) => { e.stopPropagation(); handlePopOut(); }}
                    title={t('characterSheet.popOut', 'Open in new window')}
                >
                    <OpenInNewIcon style={{ fontSize: 16 }} />
                </button>
            )}
            <button
                className="save-btn-sheet"
                onClick={(e) => {
                    e.stopPropagation();
                    handleSave();
                }}
                disabled={isSaving}
                title={saveSuccess ? t('common.saved') : t('common.saveCharacter')}
            >
                {isSaving ? <HourglassEmptyIcon style={{ fontSize: 16 }} /> : saveSuccess ? <CheckIcon style={{ fontSize: 16 }} /> : <SaveIcon style={{ fontSize: 16 }} />}
            </button>
        </>
    );

    const sharedSkillProps = {
        character: editedCharacter,
        setCharacter: setEditedCharacter,
        scheduleAutoSave,
        onCharacterUpdate,
        getCharacterSaveUrl,
        onSkillClick: handleSkillClick,
        getCharacteristicValue
    };

    const sheetContent = (
        <div className="two-page-layout">
            {/* LEFT SIDE */}
            <div className="page-one">
                <CharacterInfoSection
                    character={editedCharacter}
                    onFieldChange={handleFieldChange}
                />
                <ResourceBoxesSection
                    character={editedCharacter}
                    onFieldChange={handleFieldChange}
                />
                <TalentsSection
                    character={editedCharacter}
                    setCharacter={setEditedCharacter}
                    scheduleAutoSave={scheduleAutoSave}
                />
                <WeaponsSection
                    character={editedCharacter}
                    setCharacter={setEditedCharacter}
                    scheduleAutoSave={scheduleAutoSave}
                    onCharacterUpdate={onCharacterUpdate}
                    getCharacterSaveUrl={getCharacterSaveUrl}
                />
                <ArmourSection
                    character={editedCharacter}
                    setCharacter={setEditedCharacter}
                    scheduleAutoSave={scheduleAutoSave}
                />
                <ArmourPointsSection
                    armourPoints={editedCharacter.armourPoints}
                    onFieldChange={handleFieldChange}
                />
                <WealthSection
                    character={editedCharacter}
                    onFieldChange={handleFieldChange}
                />
            </div>

            {/* RIGHT SIDE */}
            <div className="page-one-right">
                <CharacteristicsSection
                    character={editedCharacter}
                    onFieldChange={handleFieldChange}
                    onCharacteristicClick={handleCharacteristicClick}
                />
                <BasicSkillsSection {...sharedSkillProps} />
                <WeaponSkillsSection {...sharedSkillProps} />
                <MagicSkillsSection {...sharedSkillProps} />
                <AdvancedSkillsSection {...sharedSkillProps} />
                <SpellsSection
                    character={editedCharacter}
                    setCharacter={setEditedCharacter}
                    scheduleAutoSave={scheduleAutoSave}
                />
                <NotesSection
                    character={editedCharacter}
                    onFieldChange={handleFieldChange}
                />
            </div>
        </div>
    );

    if (isStandalone) {
        return (
            <>
                <div className="sheet-standalone character-sheet-popup">
                    <div className="sheet-standalone__content">
                        {sheetContent}
                    </div>
                </div>
                {showModifierModal && (
                    <ModifierSelectionModal
                        mousePosition={mousePosition}
                        onConfirm={handleModifierConfirm}
                        onCancel={handleModifierCancel}
                    />
                )}
            </>
        );
    }

    return (
        <>
            <DraggablePopup
                title={editedCharacter.basicInfo?.name || t('characterSheet.title')}
                onClose={onClose}
                headerButtons={headerButtons}
            >
                {sheetContent}
            </DraggablePopup>

            {showModifierModal && (
                <ModifierSelectionModal
                    mousePosition={mousePosition}
                    onConfirm={handleModifierConfirm}
                    onCancel={handleModifierCancel}
                />
            )}
        </>
    );
}

export default CharacterSheetPopup;
