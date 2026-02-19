import { useState, useRef, useEffect, useCallback } from 'react';
import axiosInstance from '../../../api/axios';

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

    useEffect(() => {
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

    const getCharacterSaveUrl = useCallback((charId) => {
        if (isGM && gameId) {
            return `/characters/${charId}?gameId=${gameId}`;
        }
        return `/characters/${charId}`;
    }, [isGM, gameId]);

    editedCharacterRef.current = editedCharacter;

    const buildPayload = useCallback((charToSave) => {
        const { sb: _sb, tb: _tb, wpb: _wpb, hardy: _hardy, total: _total, ...woundsRest } = charToSave.wounds ?? {};
        const { walk: _walk, run: _run, ...movementRest } = charToSave.movement ?? {};
        return { ...charToSave, wounds: woundsRest, movement: movementRest };
    }, []);

    const save = useCallback(async (charToSave) => {
        setIsSaving(true);
        setSaveSuccess(false);
        try {
            const response = await axiosInstance.put(getCharacterSaveUrl(charToSave.id), buildPayload(charToSave));
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2000);
            if (onCharacterUpdate) {
                onCharacterUpdate(response.data);
            }
            setHasChanges(false);
        } catch (error) {
            console.error('Error saving character:', error);
            alert('Failed to save character: ' + (error.response?.data?.error || error.message));
        } finally {
            setIsSaving(false);
        }
    }, [getCharacterSaveUrl, onCharacterUpdate]);

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
    }, [hasChanges]);

    const saveImmediately = useCallback(async (updatedChar) => {
        setIsSaving(true);
        setSaveSuccess(false);
        try {
            const response = await axiosInstance.put(getCharacterSaveUrl(updatedChar.id), buildPayload(updatedChar));
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
    }, [getCharacterSaveUrl, onCharacterUpdate]);

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
