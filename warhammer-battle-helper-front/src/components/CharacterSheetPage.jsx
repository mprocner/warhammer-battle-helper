import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axiosInstance from '../api/axios';
import { getSystem, normalizeCharacter } from '../systems/registry';
import useWebSocket from '../hooks/useWebSocket';
import { useCurrentUser } from '../hooks/useCurrentUser';

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
    const [searchParams] = useSearchParams();
    const characterId = searchParams.get('characterId');
    const gameId = searchParams.get('gameId');
    const rollVisibility = searchParams.get('rollVisibility') || 'all';
    const token = localStorage.getItem('token');
    const { userId } = useCurrentUser(token);

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
                // Requesty są niezależne — równolegle.
                const [charsRes, gameRes] = await Promise.all([
                    axiosInstance.get(`/games/${gameId}/characters`),
                    axiosInstance.get(`/games/${gameId}`),
                ]);
                const char = charsRes.data.map(normalizeCharacter).find(c => c.id === characterId);
                if (!char) throw new Error('Character not found');
                setCharacter(char);
                setGame(gameRes.data);
            } catch (err) {
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

    if (loading) return <div style={{ padding: 20 }}>Loading...</div>;
    if (error) return <div style={{ padding: 20, color: 'red' }}>Error: {error}</div>;
    if (!character) return <div style={{ padding: 20 }}>Character not found</div>;

    const system = getSystem(character.gameSystem);
    const CharacterSheet = system.CharacterSheet;
    const isGM = !!(game && userId && game.gameMasterId === userId);

    return (
        <CharacterSheet
            character={character}
            onClose={() => window.close()}
            onCharacterUpdate={handleCharacterUpdate}
            addLogMessage={() => {}}
            gameId={gameId}
            token={token}
            game={game}
            isGM={isGM}
            rollVisibility={rollVisibility}
            isStandalone
        />
    );
}

export default CharacterSheetPage;
