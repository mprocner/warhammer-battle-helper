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

    const save = useCallback(async (charToSave) => {
        setIsSaving(true);
        setSaveSuccess(false);
        try {
            await axiosInstance.put(getCharacterSaveUrl(charToSave.id), charToSave);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2000);
            if (onCharacterUpdate) {
                onCharacterUpdate(charToSave);
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
        await save(editedCharacter);
    }, [editedCharacter, save]);

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
    }, [hasChanges, handleSave]);

    const saveImmediately = useCallback(async (updatedChar) => {
        setIsSaving(true);
        setSaveSuccess(false);
        try {
            await axiosInstance.put(getCharacterSaveUrl(updatedChar.id), updatedChar);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2000);
            if (onCharacterUpdate) {
                onCharacterUpdate(updatedChar);
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
