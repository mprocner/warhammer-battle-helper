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
    // hasChanges w postaci refa — efekt niżej zależy od [character] i czytałby stan
    // z nieaktualnego domknięcia. Przypisanie w trakcie renderu, tak samo jak
    // editedCharacterRef poniżej.
    const hasChangesRef = useRef(false);
    hasChangesRef.current = hasChanges;

    // Re-sync z propsa przy zmianie postaci, a dla tej samej postaci tylko wtedy, gdy
    // nie mamy niezapisanych edycji.
    //
    // Oba warunki są potrzebne. Bez drugiego refetch po evencie WS (np. po rzucie innego
    // gracza) kasowałby tekst wpisywany właśnie w tej karcie. Bez pierwszego karta nie
    // pokazywałaby zmian tej samej postaci wprowadzonych gdzie indziej — np. w jej
    // drugim oknie otwartym przez „Otwórz w nowym oknie".
    // (Stan początkowy ustawia już inicjalizator useState powyżej.)
    useEffect(() => {
        const isSameCharacter = character?.id === prevCharIdRef.current;
        if (isSameCharacter && hasChangesRef.current) return;
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
            const derived = normalizeCharacter(response.data);
            if (onCharacterUpdate) {
                onCharacterUpdate(derived);
            }
            // Reflect backend-derived fields locally so the wounds table / HP box fill in
            // right after editing characteristics — no reload needed. Only computed fields
            // (never hand-typed) are merged, so this can't clobber an in-progress edit.
            // current is only filled when unset, preserving a locally edited HP value.
            setEditedCharacter(prev => ({
                ...prev,
                wounds: {
                    ...prev.wounds,
                    ...derived.wounds,
                    current: prev.wounds?.current ?? derived.wounds?.current,
                },
                movement: { ...prev.movement, ...derived.movement },
            }));
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
