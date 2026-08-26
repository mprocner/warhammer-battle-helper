import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axiosInstance from '../api/axios';
import { getSystem, normalizeCharacter } from '../systems/registry';
import useWebSocket from '../hooks/useWebSocket';

/**
 * Karta postaci wyrwana do osobnego okna przeglądarki (route /character-sheet).
 *
 * Okno jest samowystarczalne: nie ma dostępu do stanu GameSession, więc dociąga
 * postać i grę samo. Gra jest potrzebna systemowi `custom`, który trzyma definicję
 * pól w bazie (Game.customSystemTemplate), a nie w kodzie komponentu.
 *
 * rollVisibility przyjeżdża parametrem URL, bo w GameSession jest ulotnym useState —
 * osobny kontekst JS nie ma jak go odczytać. To snapshot z chwili otwarcia okna.
 */
function CharacterSheetPage() {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const characterId = searchParams.get('characterId');
    const gameId = searchParams.get('gameId');
    const rollVisibility = searchParams.get('rollVisibility') || 'all';
    const token = localStorage.getItem('token');

    const [character, setCharacter] = useState(null);
    const [game, setGame] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!characterId || !gameId) {
            setLoading(false);
            return;
        }
        const fetchAll = async () => {
            try {
                // Requesty są niezależne — równolegle. Promise.allSettled, nie Promise.all:
                // gra jest potrzebna tylko systemowi `custom` (szablon pól w bazie). Jej brak
                // degraduje kartę custom do komunikatu creator.noTemplate, ale nie może zabijać
                // okna pozostałym trzem systemom, które propa `game` w ogóle nie czytają.
                const [charsResult, gameResult] = await Promise.allSettled([
                    axiosInstance.get(`/games/${gameId}/characters`),
                    axiosInstance.get(`/games/${gameId}`),
                ]);
                if (charsResult.status === 'rejected') throw charsResult.reason;
                if (gameResult.status === 'fulfilled') setGame(gameResult.value.data);
                const char = charsResult.value.data.map(normalizeCharacter).find(c => c.id === characterId);
                // Brak postaci o tym id to nie błąd sieci — zostawiamy character = null
                // i render pokazuje przetłumaczone t('character.notFound'). Rzucenie wyjątku
                // trafiłoby w gałąź `error`, która wyświetla nieprzetłumaczony err.message.
                if (char) setCharacter(char);
            } catch (err) {
                console.error('CharacterSheetPage:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, [characterId, gameId]);

    const handleWsMessage = useCallback((message) => {
        if (message.type === 'CHARACTER_UPDATED') {
            const updated = message.payload?.character;
            if (updated && updated.id === characterId) {
                setCharacter(normalizeCharacter(updated));
            }
        }
    }, [characterId]);

    useWebSocket(gameId, token, handleWsMessage);

    const handleCharacterUpdate = (updated) => {
        setCharacter(normalizeCharacter(updated));
    };

    if (loading) return <div style={{ padding: 20 }}>{t('common.loading')}</div>;
    if (error) return <div style={{ padding: 20, color: 'red' }}>{t('common.error')}</div>;
    if (!character) return <div style={{ padding: 20 }}>{t('character.notFound')}</div>;

    const system = getSystem(character.gameSystem);
    const CharacterSheet = system.CharacterSheet;

    return (
        <CharacterSheet
            character={character}
            onClose={() => window.close()}
            onCharacterUpdate={handleCharacterUpdate}
            addLogMessage={() => {}}
            gameId={gameId}
            token={token}
            game={game}
            rollVisibility={rollVisibility}
            isStandalone
        />
    );
}

export default CharacterSheetPage;
