import { useState, useRef, useEffect, useCallback } from 'react';
import axiosInstance from '../../../api/axios';
import { buildPayload } from '../buildPayload';
import { getCharacterSaveUrl } from '../../shared/characterApi';

function normalizeCharacter(char) {
    if (!char) return char;
    if (char.stats && typeof char.stats === 'object') {
        return { ...char.stats, ...char };
    }
    return char;
}

function useAutoSave(character, onCharacterUpdate, isGM, gameId) {
    const [editedCharacter, setEditedCharacter] = useState(() => ({
        ...character,
        basicSkills: character.basicSkills || {},
        advancedSkills: character.advancedSkills || {},
        favoriteSkills: character.favoriteSkills || [],
        customSkills: character.customSkills || [],
        talents: character.talents || [],
        weapons: character.weapons || [],
        armour: character.armour || []
    }));
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const saveTimeoutRef = useRef(null);
    const editedCharacterRef = useRef(editedCharacter);
    const prevCharIdRef = useRef(character?.id);

    // Re-sync z propsa tylko przy zmianie postaci (inne id). Dla tej samej
    // postaci NIE nadpisujemy lokalnych edycji danymi z refetchu po evencie WS
    // — inaczej rzut innego gracza kasowałby właśnie wpisywany tekst.
    // (Stan początkowy ustawia już inicjalizator useState powyżej.)
    useEffect(() => {
        if (character?.id === prevCharIdRef.current) return;
        prevCharIdRef.current = character?.id;
        setEditedCharacter({
            ...character,
            basicSkills: character.basicSkills || {},
            advancedSkills: character.advancedSkills || {},
            favoriteSkills: character.favoriteSkills || [],
            customSkills: character.customSkills || [],
            talents: character.talents || [],
            weapons: character.weapons || [],
            armour: character.armour || []
        });
        setHasChanges(false);
    }, [character]);

    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    editedCharacterRef.current = editedCharacter;


    const save = useCallback(async (charToSave) => {
        setIsSaving(true);
        setSaveSuccess(false);
        try {
            const response = await axiosInstance.put(getCharacterSaveUrl(charToSave.id, gameId), buildPayload(charToSave));
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2000);
            if (onCharacterUpdate) {
                onCharacterUpdate(normalizeCharacter(response.data));
            }
            setHasChanges(false);
        } catch (error) {
            console.error('Error saving character:', error);
            alert('Failed to save character: ' + (error.response?.data?.error || error.message));
        } finally {
            setIsSaving(false);
        }
    }, [gameId, onCharacterUpdate]);

    const handleSave = useCallback(async () => {
        await save(editedCharacterRef.current);
    }, [save]);

    const scheduleAutoSave = useCallback(() => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
            handleSave();
        }, 1000);
    }, [handleSave]);

    const markChanged = useCallback(() => {
        setHasChanges(true);
    }, []);

    useEffect(() => {
        if (!hasChanges) return;
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
            handleSave();
        }, 1000);
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasChanges]);

    const saveImmediately = useCallback(async (updatedChar) => {
        setIsSaving(true);
        setSaveSuccess(false);
        try {
            const response = await axiosInstance.put(getCharacterSaveUrl(updatedChar.id, gameId), buildPayload(updatedChar));
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2000);
            if (onCharacterUpdate) {
                onCharacterUpdate(response.data);
            }
        } catch (error) {
            console.error('Error saving character:', error);
            alert('Failed to save character: ' + (error.response?.data?.error || error.message));
        } finally {
            setIsSaving(false);
        }
    }, [gameId, onCharacterUpdate]);

    return {
        editedCharacter,
        setEditedCharacter,
        isSaving,
        saveSuccess,
        hasChanges,
        markChanged,
        handleSave,
        scheduleAutoSave,
        saveImmediately
    };
}

export default useAutoSave;
