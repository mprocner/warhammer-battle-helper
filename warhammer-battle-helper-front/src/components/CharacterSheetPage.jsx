import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axiosInstance from '../api/axios';
import { getSystem, normalizeCharacter } from '../systems/registry';

function CharacterSheetPage() {
    const [searchParams] = useSearchParams();
    const characterId = searchParams.get('characterId');
    const gameId = searchParams.get('gameId');

    const [character, setCharacter] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchCharacter = async () => {
            try {
                const url = gameId ? `/games/${gameId}/characters` : `/characters`;
                const res = await axiosInstance.get(url);
                const chars = res.data.map(normalizeCharacter);
                const char = chars.find(c => c.id === characterId);
                if (!char) throw new Error('Character not found');
                setCharacter(char);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        if (characterId) fetchCharacter();
    }, [characterId, gameId]);

    const handleCharacterUpdate = (updated) => {
        setCharacter(normalizeCharacter(updated));
    };

    if (loading) return <div style={{ padding: 20 }}>Loading...</div>;
    if (error) return <div style={{ padding: 20, color: 'red' }}>Error: {error}</div>;
    if (!character) return <div style={{ padding: 20 }}>Character not found</div>;

    const system = getSystem(character.gameSystem);
    const CharacterSheet = system.CharacterSheet;

    return (
        <CharacterSheet
            character={character}
            onClose={() => window.close()}
            onCharacterUpdate={handleCharacterUpdate}
            addLogMessage={() => {}}
            gameId={gameId}
            token={localStorage.getItem('token')}
            isStandalone
        />
    );
}

export default CharacterSheetPage;
