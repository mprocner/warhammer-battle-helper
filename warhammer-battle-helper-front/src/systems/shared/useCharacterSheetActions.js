import { useCallback } from 'react';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SaveIcon from '@mui/icons-material/Save';
import CheckIcon from '@mui/icons-material/Check';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';

// rollVisibility jest w GameSession ulotnym useState — nowe okno to osobny kontekst JS
// i nie ma jak go odczytać, więc przenosimy go parametrem URL. Snapshot z chwili
// otwarcia: zmiana ustawienia w oknie głównym nie dotrze do już otwartego okna.
export function usePopOut(characterId, gameId, rollVisibility = 'all') {
    return useCallback(() => {
        const params = new URLSearchParams({ characterId });
        if (gameId) params.set('gameId', gameId);
        // 'all' jest domyślne po stronie CharacterSheetPage — nie zaśmiecamy URL.
        if (rollVisibility && rollVisibility !== 'all') params.set('rollVisibility', rollVisibility);
        window.open(`/character-sheet?${params.toString()}`, '_blank', 'width=1400,height=900,noopener');
    }, [characterId, gameId, rollVisibility]);
}

export function useCharacterSheetHeaderButtons({ isSaving, saveSuccess, onSave, onPopOut, isStandalone, t }) {
    return (
        <>
            {!isStandalone && (
                <button
                    className="pop-out-btn-sheet"
                    onClick={(e) => { e.stopPropagation(); onPopOut(); }}
                    title={t('characterSheet.popOut')}
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
