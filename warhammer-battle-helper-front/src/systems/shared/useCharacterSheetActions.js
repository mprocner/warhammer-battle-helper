import { useCallback } from 'react';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SaveIcon from '@mui/icons-material/Save';
import CheckIcon from '@mui/icons-material/Check';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';

export function usePopOut(characterId, gameId) {
    return useCallback(() => {
        const params = new URLSearchParams({ characterId });
        if (gameId) params.set('gameId', gameId);
        window.open(`/character-sheet?${params.toString()}`, '_blank', 'width=1400,height=900,noopener');
    }, [characterId, gameId]);
}

export function useCharacterSheetHeaderButtons({ isSaving, saveSuccess, onSave, onPopOut, isStandalone, t }) {
    return (
        <>
            {!isStandalone && (
                <button
                    className="pop-out-btn-sheet"
                    onClick={(e) => { e.stopPropagation(); onPopOut(); }}
                    title={t('characterSheet.popOut', 'Open in new window')}
                >
                    <OpenInNewIcon style={{ fontSize: 16 }} />
                </button>
            )}
            <button
                className="save-btn-sheet"
                onClick={(e) => { e.stopPropagation(); onSave(); }}
                disabled={isSaving}
                title={saveSuccess ? t('common.saved') : t('common.saveCharacter')}
            >
                {isSaving
                    ? <HourglassEmptyIcon style={{ fontSize: 16 }} />
                    : saveSuccess
                        ? <CheckIcon style={{ fontSize: 16 }} />
                        : <SaveIcon style={{ fontSize: 16 }} />}
            </button>
        </>
    );
}
