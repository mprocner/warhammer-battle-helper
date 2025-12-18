import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import axiosInstance from '../api/axios';
import skillsData from '../data/skills.json';
import ModifierSelectionModal from './ModifierSelectionModal';
import axios from 'axios';
import { getApiUrl } from '../api/axios';

function CharacterSheetPopup({ character, onClose, onCharacterUpdate, addLogMessage }) {
    const { t } = useTranslation(['translation', 'skills']);
    const [isMinimized, setIsMinimized] = useState(false);
    const [position, setPosition] = useState({ x: 100, y: 100 });
    const [size, setSize] = useState({ width: 1400, height: 800 });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [resizeDirection, setResizeDirection] = useState(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
    const [editedCharacter, setEditedCharacter] = useState({
        ...character,
        basicSkills: character.basicSkills || {},
        advancedSkills: character.advancedSkills || {}
    });
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [activeTooltip, setActiveTooltip] = useState(null);
    const [showModifierModal, setShowModifierModal] = useState(false);
    const [mousePosition, setMousePosition] = useState(null);
    const [pendingCharacteristic, setPendingCharacteristic] = useState(null);
    const popupRef = useRef(null);
    const saveTimeoutRef = useRef(null);

    // Update edited character when character prop changes
    useEffect(() => {
        setEditedCharacter({
            ...character,
            basicSkills: character.basicSkills || {},
            advancedSkills: character.advancedSkills || {}
        });
        setHasChanges(false);
    }, [character]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    // Close tooltip when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (activeTooltip && !e.target.closest('.skill-info-icon') && !e.target.closest('.skill-tooltip')) {
                setActiveTooltip(null);
            }
        };

        if (activeTooltip) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [activeTooltip]);

    // Toggle skill tooltip
    const handleTooltipToggle = (skillKey, e) => {
        e.stopPropagation();
        setActiveTooltip(activeTooltip === skillKey ? null : skillKey);
    };

    // Get all basic skills except Melee (including other grouped skills as single rows)
    const basicSkills = useMemo(() => {
        const skills = [];
        skillsData
            .filter(skill => skill.type === 'basic' && skill.key !== 'MELEE')
            .forEach(skill => {
                if (skill.showAllSpecializations && skill.specialisations) {
                    // Expand all specializations as separate skills (e.g., STEALTH)
                    skill.specialisations.forEach(spec => {
                        skills.push({
                            key: `${skill.key}_${spec}`,
                            name: `${t(`skills:${skill.key}.name`)} (${t(`skills:${skill.key}.specialisations.${spec}`)})`,
                            characteristic: skill.characteristic,
                            isGrouped: true,
                            parentKey: skill.key,
                            specializationKey: spec
                        });
                    });
                } else if (skill.basicSpecialization && skill.specialisations) {
                    // Show only the basic specialization (e.g., RIDE - HORSE)
                    const spec = skill.basicSpecialization;
                    skills.push({
                        key: `${skill.key}_${spec}`,
                        name: `${t(`skills:${skill.key}.name`)} (${t(`skills:${skill.key}.specialisations.${spec}`)})`,
                        characteristic: skill.characteristic,
                        isGrouped: true,
                        parentKey: skill.key,
                        specializationKey: spec
                    });
                } else {
                    // Add as single skill
                    skills.push({
                        key: skill.key,
                        name: t(`skills:${skill.key}.name`),
                        characteristic: skill.characteristic
                    });
                }
            });
        return skills.sort((a, b) => a.name.localeCompare(b.name));
    }, [t]);

    // Get Melee skill for weapon skills table
    const meleeSkill = useMemo(() => {
        const skill = skillsData.find(s => s.key === 'MELEE');
        if (!skill) return null;
        return {
            key: skill.key,
            name: t(`skills:${skill.key}.name`),
            characteristic: skill.characteristic,
            specialisations: skill.specialisations || [],
            basicMeleeSpecializations: skill.basicMeleeSpecializations || []
        };
    }, [t]);

    // Get Ranged skill for ranged weapon skills table
    const rangedSkill = useMemo(() => {
        const skill = skillsData.find(s => s.key === 'RANGED');
        if (!skill) return null;
        return {
            key: skill.key,
            name: t(`skills:${skill.key}.name`),
            characteristic: skill.characteristic,
            specialisations: skill.specialisations || []
        };
    }, [t]);

    // Get magic skills (Channelling, Language (Magick), Pray)
    const magicSkills = useMemo(() => {
        const skills = [];
        skillsData
            .filter(skill => skill.magicSkill)
            .forEach(skill => {
                if (skill.key === 'CHANNELLING' && skill.showAsGeneral) {
                    // Show Channelling as a single general skill
                    skills.push({
                        key: skill.key,
                        name: t(`skills:${skill.key}.name`),
                        characteristic: skill.characteristic,
                        isGeneral: true
                    });
                } else if (skill.key === 'LANGUAGE' && skill.magicSpecialization) {
                    // Show only Language (Magick)
                    const spec = skill.magicSpecialization;
                    skills.push({
                        key: `${skill.key}_${spec}`,
                        name: `${t(`skills:${skill.key}.name`)} (${t(`skills:${skill.key}.specialisations.${spec}`)})`,
                        characteristic: skill.characteristic,
                        isGrouped: true,
                        parentKey: skill.key,
                        specializationKey: spec
                    });
                } else if (!skill.grouped) {
                    // Show ungrouped skills like Pray
                    skills.push({
                        key: skill.key,
                        name: t(`skills:${skill.key}.name`),
                        characteristic: skill.characteristic
                    });
                }
            });
        return skills;
    }, [t]);

    // Get all advanced skills options for dropdown (expanded with specializations)
    // Also includes grouped basic skills except weapon skills (MELEE, RANGED), STEALTH, and some magic skills
    const advancedSkillsOptions = useMemo(() => {
        const options = [];
        skillsData
            .filter(skill => {
                // Exclude weapon skills (MELEE, RANGED)
                if (skill.weaponSkill) return false;
                // Exclude CHANNELLING and PRAY (shown in Magic section)
                if (skill.magicSkill && (skill.key === 'CHANNELLING' || skill.key === 'PRAY')) return false;
                // Include LANGUAGE (will filter out MAGICK specialization later)
                if (skill.key === 'LANGUAGE') return true;
                // Include all other advanced skills
                if (skill.type === 'advanced') return true;
                // Include grouped basic skills except STEALTH (which has showAllSpecializations)
                if (skill.type === 'basic' && skill.grouped && !skill.showAllSpecializations) {
                    return true;
                }
                return false;
            })
            .forEach(skill => {
                if (skill.grouped && skill.specialisations) {
                    // Add each specialization as separate option
                    skill.specialisations.forEach(spec => {
                        // Skip the basic specialization if it exists (e.g., RIDE - HORSE)
                        if (skill.basicSpecialization && spec === skill.basicSpecialization) {
                            return;
                        }
                        // Skip magic specialization if it exists (e.g., LANGUAGE - MAGICK)
                        if (skill.magicSpecialization && spec === skill.magicSpecialization) {
                            return;
                        }
                        options.push({
                            key: `${skill.key}_${spec}`,
                            name: `${t(`skills:${skill.key}.name`)} (${t(`skills:${skill.key}.specialisations.${spec}`)})`,
                            characteristic: skill.characteristic
                        });
                    });
                } else {
                    // Add ungrouped skill
                    options.push({
                        key: skill.key,
                        name: t(`skills:${skill.key}.name`),
                        characteristic: skill.characteristic
                    });
                }
            });
        return options.sort((a, b) => a.name.localeCompare(b.name));
    }, [t]);

    // Convert advanced skills map to array for rendering (sorted alphabetically)
    const advancedSkillsList = useMemo(() => {
        if (!editedCharacter.advancedSkills) return [];

        return Object.keys(editedCharacter.advancedSkills)
            .map(skillKey => {
                // Find the skill option to get name and characteristic
                const skillOption = advancedSkillsOptions.find(s => s.key === skillKey);
                if (!skillOption) return null;

                return {
                    key: skillKey,
                    name: skillOption.name,
                    characteristic: skillOption.characteristic,
                    advances: editedCharacter.advancedSkills[skillKey]
                };
            })
            .filter(s => s !== null)
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [editedCharacter.advancedSkills, advancedSkillsOptions]);

    // Map characteristic key to short form used in character data
    const getCharacteristicShortKey = (characteristic) => {
        const mapping = {
            'WEAPON_SKILL': 'WS',
            'BALLISTIC_SKILL': 'BS',
            'STRENGTH': 'S',
            'TOUGHNESS': 'T',
            'INITIATIVE': 'I',
            'AGILITY': 'Ag',
            'DEXTERITY': 'Dex',
            'INTELLIGENCE': 'Int',
            'WILLPOWER': 'WP',
            'FELLOWSHIP': 'Fel'
        };
        return mapping[characteristic] || characteristic;
    };

    // Get characteristic value for a skill
    const getCharacteristicValue = (characteristic) => {
        const shortKey = getCharacteristicShortKey(characteristic);
        const current = calculateCurrentCharacteristics(editedCharacter);
        return current[shortKey] || 0;
    };

    // Get skill advances
    const getSkillAdvances = (skillKey) => {
        return parseInt(editedCharacter.basicSkills?.[skillKey]) || 0;
    };

    // Calculate advanced skill value (characteristic + advances)
    const calculateAdvancedSkillValue = (skillKey, characteristic) => {
        const charValue = getCharacteristicValue(characteristic);
        const advances = parseInt(editedCharacter.advancedSkills?.[skillKey]) || 0;
        return charValue + advances;
    };

    // Get skill advances for grouped skill (with compound key like MELEE_BASIC)
    const getGroupedSkillAdvances = (parentKey, specializationKey) => {
        const compoundKey = `${parentKey}_${specializationKey}`;
        return parseInt(editedCharacter.basicSkills?.[compoundKey]) || 0;
    };

    // Calculate total skill value (characteristic + advances)
    const calculateSkillValue = (skillKey, characteristic) => {
        const charValue = getCharacteristicValue(characteristic);
        const advances = getSkillAdvances(skillKey);
        return charValue + advances;
    };

    // Calculate total skill value for grouped skill
    const calculateGroupedSkillValue = (parentKey, specializationKey, characteristic) => {
        const charValue = getCharacteristicValue(characteristic);
        const advances = getGroupedSkillAdvances(parentKey, specializationKey);
        return charValue + advances;
    };

    // Handle skill advances change
    const handleSkillAdvancesChange = (skillKey, value) => {
        const numValue = parseInt(value) || 0;
        setEditedCharacter(prev => ({
            ...prev,
            basicSkills: {
                ...prev.basicSkills,
                [skillKey]: numValue
            }
        }));
        setHasChanges(true);

        // Auto-save after 1 second
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
            handleSave();
        }, 1000);
    };

    // Handle grouped skill advances change
    const handleGroupedSkillAdvancesChange = (parentKey, specializationKey, value) => {
        const compoundKey = `${parentKey}_${specializationKey}`;
        const numValue = parseInt(value) || 0;
        setEditedCharacter(prev => ({
            ...prev,
            basicSkills: {
                ...prev.basicSkills,
                [compoundKey]: numValue
            }
        }));
        setHasChanges(true);

        // Auto-save after 1 second
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
            handleSave();
        }, 1000);
    };

    // Add advanced skill from dropdown
    const handleAddAdvancedSkill = (skillKey) => {
        if (!skillKey) return;

        // Check if skill already exists
        if (editedCharacter.advancedSkills?.[skillKey] !== undefined) {
            alert(t('validation.skillAlreadyAdded'));
            return;
        }

        setEditedCharacter(prev => ({
            ...prev,
            advancedSkills: {
                ...prev.advancedSkills,
                [skillKey]: 0
            }
        }));
        setHasChanges(true);

        // Auto-save
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
            handleSave();
        }, 1000);
    };

    // Update advanced skill advances
    const handleAdvancedSkillAdvancesChange = (skillKey, value) => {
        const numValue = parseInt(value) || 0;
        setEditedCharacter(prev => ({
            ...prev,
            advancedSkills: {
                ...prev.advancedSkills,
                [skillKey]: numValue
            }
        }));
        setHasChanges(true);

        // Auto-save
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
            handleSave();
        }, 1000);
    };

    // Remove ranged skill
    const handleRemoveRangedSkill = (parentKey, specializationKey) => {
        const compoundKey = `${parentKey}_${specializationKey}`;
        setEditedCharacter(prev => {
            const newBasicSkills = { ...prev.basicSkills };
            delete newBasicSkills[compoundKey];
            return {
                ...prev,
                basicSkills: newBasicSkills
            };
        });
        setHasChanges(true);

        // Auto-save after 1 second
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
            handleSave();
        }, 1000);
    };

    // Remove melee skill specialization
    const handleRemoveMeleeSkill = (parentKey, specializationKey) => {
        const compoundKey = `${parentKey}_${specializationKey}`;
        setEditedCharacter(prev => {
            const newBasicSkills = { ...prev.basicSkills };
            delete newBasicSkills[compoundKey];
            return {
                ...prev,
                basicSkills: newBasicSkills
            };
        });
        setHasChanges(true);

        // Auto-save after 1 second
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
            handleSave();
        }, 1000);
    };

    // Remove advanced skill
    const handleRemoveAdvancedSkill = (skillKey) => {
        setEditedCharacter(prev => {
            const newAdvancedSkills = { ...prev.advancedSkills };
            delete newAdvancedSkills[skillKey];
            return {
                ...prev,
                advancedSkills: newAdvancedSkills
            };
        });
        setHasChanges(true);

        // Auto-save
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
            handleSave();
        }, 1000);
    };

    // Handle characteristic click for rolling
    const handleCharacteristicClick = (charName, charValue, event) => {
        if (!charValue || charValue === '-') {
            if (addLogMessage) {
                addLogMessage(t('combat.cannotRoll', { characteristic: charName }), 'warning');
            }
            return;
        }

        // Store pending characteristic and show modifier modal
        setPendingCharacteristic({ name: charName, value: charValue });
        setMousePosition({ x: event.clientX, y: event.clientY });
        setShowModifierModal(true);
    };

    // Handle modifier confirmation
    const handleModifierConfirm = (selectedModifier) => {
        setShowModifierModal(false);
        if (pendingCharacteristic) {
            rollCharacteristic(
                pendingCharacteristic.name,
                pendingCharacteristic.value,
                selectedModifier
            );
        }
        setPendingCharacteristic(null);
    };

    // Handle modifier cancel
    const handleModifierCancel = () => {
        setShowModifierModal(false);
        setPendingCharacteristic(null);
    };

    // Roll characteristic
    const rollCharacteristic = async (charName, charValue, modifierValue) => {
        try {
            // Roll d100 for characteristic test
            const sides = 100;
            const modifiedValue = charValue + modifierValue;
            const response = await axios.post(`${getApiUrl()}/roll`, {
                "sides": sides
            }, {
                withCredentials: true
            });

            const rollResult = response.data.result;
            const successLevel = Math.floor(modifiedValue / 10) - Math.floor(rollResult / 10);
            const success = rollResult <= modifiedValue;

            if (addLogMessage) {
                const successText = success
                    ? t('combat.success', { level: successLevel })
                    : t('combat.failure', { level: successLevel });
                const modifierText = modifierValue !== 0 ? ` (${modifierValue > 0 ? '+' : ''}${modifierValue})` : '';
                addLogMessage(
                    `${editedCharacter.basicInfo?.name} - ${charName}${modifierText} Test: Rolled ${rollResult} vs ${modifiedValue} - ${successText}`,
                    success ? 'success' : 'error'
                );
            }
        } catch (error) {
            console.error('Error rolling characteristic:', error);
            if (addLogMessage) {
                addLogMessage(t('combat.rollFailed'), 'error');
            }
        }
    };

    // Calculate current characteristics from initial + advances
    const calculateCurrentCharacteristics = (char) => {
        const stats = ['WS', 'BS', 'S', 'T', 'I', 'Ag', 'Dex', 'Int', 'WP', 'Fel'];
        const current = {};

        stats.forEach(stat => {
            const initial = parseInt(char.characteristics?.initial?.[stat]) || 0;
            const advances = parseInt(char.characteristics?.advances?.[stat]) || 0;
            current[stat] = initial + advances;
        });

        return current;
    };

    // Save character
    const handleSave = useCallback(async () => {
        setIsSaving(true);
        setSaveSuccess(false);
        try {
            const response = await axiosInstance.put(
                `/characters/${editedCharacter.id}`,
                editedCharacter
            );

            console.log('Character saved successfully11:', response.data);

            // Show success indicator
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2000);

            // Update character data in parent component with edited data
            if (onCharacterUpdate) {
                onCharacterUpdate(editedCharacter);
            }

            setHasChanges(false);
        } catch (error) {
            console.error('Error saving character:', error);
            alert('Failed to save character: ' + (error.response?.data?.error || error.message));
        } finally {
            setIsSaving(false);
        }
    }, [editedCharacter, onCharacterUpdate]);

    // Auto-save when character is edited (with debouncing)
    useEffect(() => {
        if (!hasChanges) return;

        // Clear existing timeout
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        // Set new timeout to save after 1 second of no changes
        saveTimeoutRef.current = setTimeout(() => {
            handleSave();
        }, 1000);

        // Cleanup timeout on unmount
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [hasChanges, handleSave]);

    // Handle field changes
    const handleFieldChange = (path, value) => {
        const pathParts = path.split('.');
        setEditedCharacter(prev => {
            const newCharacter = JSON.parse(JSON.stringify(prev)); // Deep clone
            let current = newCharacter;

            for (let i = 0; i < pathParts.length - 1; i++) {
                if (!current[pathParts[i]]) {
                    current[pathParts[i]] = {};
                }
                current = current[pathParts[i]];
            }

            // Convert numeric fields to integers
            const numericFields = [
                'characteristics.initial',
                'characteristics.advances',
                'fate.fate',
                'fate.fortune',
                'resilience.resilience',
                'resilience.resolve',
                'experience.current',
                'experience.spent',
                'experience.total'
            ];

            const shouldConvertToInt = numericFields.some(field => path.startsWith(field));

            if (shouldConvertToInt) {
                current[pathParts[pathParts.length - 1]] = parseInt(value) || 0;
            } else {
                current[pathParts[pathParts.length - 1]] = value;
            }

            // If changing characteristics initial or advances, recalculate current
            if (path.startsWith('characteristics.initial') || path.startsWith('characteristics.advances')) {
                if (!newCharacter.characteristics) {
                    newCharacter.characteristics = {};
                }
                newCharacter.characteristics.current = calculateCurrentCharacteristics(newCharacter);
            }

            return newCharacter;
        });
        setHasChanges(true);
    };

    // Drag handlers
    const handleMouseDown = (e) => {
        if (e.target.closest('.sheet-header') && !e.target.closest('.sheet-header-buttons')) {
            setIsDragging(true);
            const rect = popupRef.current.getBoundingClientRect();
            setDragOffset({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            });
        }
    };

    // Resize handlers
    const handleResizeMouseDown = (e, direction) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        setResizeDirection(direction);
        setResizeStart({
            x: e.clientX,
            y: e.clientY,
            width: size.width,
            height: size.height,
            posX: position.x,
            posY: position.y
        });
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (isDragging) {
                setPosition({
                    x: e.clientX - dragOffset.x,
                    y: e.clientY - dragOffset.y
                });
            }

            if (isResizing && resizeDirection) {
                const deltaX = e.clientX - resizeStart.x;
                const deltaY = e.clientY - resizeStart.y;

                let newWidth = resizeStart.width;
                let newHeight = resizeStart.height;
                let newX = resizeStart.posX;
                let newY = resizeStart.posY;

                // Minimum sizes
                const minWidth = 600;
                const minHeight = 400;

                if (resizeDirection.includes('e')) {
                    newWidth = Math.max(minWidth, resizeStart.width + deltaX);
                }
                if (resizeDirection.includes('w')) {
                    const potentialWidth = resizeStart.width - deltaX;
                    if (potentialWidth >= minWidth) {
                        newWidth = potentialWidth;
                        newX = resizeStart.posX + deltaX;
                    }
                }
                if (resizeDirection.includes('s')) {
                    newHeight = Math.max(minHeight, resizeStart.height + deltaY);
                }
                if (resizeDirection.includes('n')) {
                    const potentialHeight = resizeStart.height - deltaY;
                    if (potentialHeight >= minHeight) {
                        newHeight = potentialHeight;
                        newY = resizeStart.posY + deltaY;
                    }
                }

                setSize({ width: newWidth, height: newHeight });
                if (newX !== resizeStart.posX || newY !== resizeStart.posY) {
                    setPosition({ x: newX, y: newY });
                }
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            setIsResizing(false);
            setResizeDirection(null);
        };

        if (isDragging || isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isResizing, dragOffset, resizeDirection, resizeStart, size, position]);

    const popupContent = (
        <div
            ref={popupRef}
            className="character-sheet-popup"
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: isMinimized ? 'auto' : `${size.width}px`,
                height: isMinimized ? 'auto' : `${size.height}px`,
                maxWidth: 'none'
            }}
            onMouseDown={handleMouseDown}
        >
            {/* Resize handles */}
            {!isMinimized && (
                <>
                    <div className="resize-handle resize-n" onMouseDown={(e) => handleResizeMouseDown(e, 'n')} />
                    <div className="resize-handle resize-s" onMouseDown={(e) => handleResizeMouseDown(e, 's')} />
                    <div className="resize-handle resize-e" onMouseDown={(e) => handleResizeMouseDown(e, 'e')} />
                    <div className="resize-handle resize-w" onMouseDown={(e) => handleResizeMouseDown(e, 'w')} />
                    <div className="resize-handle resize-ne" onMouseDown={(e) => handleResizeMouseDown(e, 'ne')} />
                    <div className="resize-handle resize-nw" onMouseDown={(e) => handleResizeMouseDown(e, 'nw')} />
                    <div className="resize-handle resize-se" onMouseDown={(e) => handleResizeMouseDown(e, 'se')} />
                    <div className="resize-handle resize-sw" onMouseDown={(e) => handleResizeMouseDown(e, 'sw')} />
                </>
            )}
            <div className="sheet-header" style={{ cursor: isDragging ? 'grabbing' : 'grab' }}>
                <h2 style={{ fontSize: isMinimized ? '14px' : undefined }}>
                    {editedCharacter.basicInfo?.name || t('characterSheet.title')}
                </h2>
                <div className="sheet-header-buttons">
                    {!isMinimized && (
                        <button
                            className="save-btn-sheet"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleSave();
                            }}
                            disabled={isSaving}
                            title={saveSuccess ? t('common.saved') : t('common.saveCharacter')}
                        >
                            {isSaving ? '⏳' : saveSuccess ? '✓' : '💾'}
                        </button>
                    )}
                    <button
                        className="minimize-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsMinimized(!isMinimized);
                        }}
                        title={isMinimized ? t('common.expand') : t('common.minimize')}
                    >
                        {isMinimized ? '▢' : '─'}
                    </button>
                    <button
                        className="close-btn-sheet"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                    >
                        ×
                    </button>
                </div>
            </div>

            {!isMinimized && (
                <div className="sheet-content" style={{ maxHeight: `${size.height - 80}px` }}>
                    <div className="two-page-layout">
                        {/* LEFT SIDE - PAGE 1 */}
                        <div className="page-one">
                            {/* Character Information */}
                            <div className="card-section">
                                <h3>{t('characterSheet.characterInformation')}</h3>
                                <div className="form-grid">
                                    <div className="form-group">
                                        <label>{t('characterSheet.name')}</label>
                                        <input type="text" value={editedCharacter.basicInfo?.name || ''} onChange={(e) => handleFieldChange('basicInfo.name', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>{t('characterSheet.species')}</label>
                                        <input type="text" value={editedCharacter.basicInfo?.species || ''} onChange={(e) => handleFieldChange('basicInfo.species', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>{t('characterSheet.class')}</label>
                                        <input type="text" value={editedCharacter.basicInfo?.class || ''} onChange={(e) => handleFieldChange('basicInfo.class', e.target.value)} />
                                    </div>
                                </div>
                                <div className="form-grid" style={{ marginTop: '10px' }}>
                                    <div className="form-group">
                                        <label>{t('characterSheet.career')}</label>
                                        <input type="text" value={editedCharacter.basicInfo?.career || ''} onChange={(e) => handleFieldChange('basicInfo.career', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>{t('characterSheet.careerLevel')}</label>
                                        <input type="text" value={editedCharacter.basicInfo?.careerLevel || ''} onChange={(e) => handleFieldChange('basicInfo.careerLevel', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>{t('characterSheet.status')}</label>
                                        <input type="text" value={editedCharacter.basicInfo?.status || ''} onChange={(e) => handleFieldChange('basicInfo.status', e.target.value)} />
                                    </div>
                                </div>
                                <div className="form-group" style={{ marginTop: '10px' }}>
                                    <label>{t('characterSheet.careerPath')}</label>
                                    <input type="text" value={editedCharacter.basicInfo?.careerPath || ''} onChange={(e) => handleFieldChange('basicInfo.careerPath', e.target.value)} />
                                </div>
                                <div className="form-grid" style={{ marginTop: '10px' }}>
                                    <div className="form-group">
                                        <label>{t('characterSheet.age')}</label>
                                        <input type="text" value={editedCharacter.basicInfo?.age || ''} onChange={(e) => handleFieldChange('basicInfo.age', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>{t('characterSheet.height')}</label>
                                        <input type="text" value={editedCharacter.basicInfo?.height || ''} onChange={(e) => handleFieldChange('basicInfo.height', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>{t('characterSheet.hair')}</label>
                                        <input type="text" value={editedCharacter.basicInfo?.hair || ''} onChange={(e) => handleFieldChange('basicInfo.hair', e.target.value)} />
                                    </div>
                                </div>
                                <div className="form-group" style={{ marginTop: '10px' }}>
                                    <label>{t('characterSheet.eyes')}</label>
                                    <input type="text" value={editedCharacter.basicInfo?.eyes || ''} onChange={(e) => handleFieldChange('basicInfo.eyes', e.target.value)} />
                                </div>
                            </div>

                            {/* Fate, Resilience, Experience */}
                            <div className="three-col-grid">
                                <div className="mini-box">
                                    <h4>{t('characterSheet.fateTitle')}</h4>
                                    <div className="mini-field">
                                        <label>{t('characterSheet.fate')}</label>
                                        <input type="text" value={editedCharacter.fate?.fate || ''} onChange={(e) => handleFieldChange('fate.fate', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>{t('characterSheet.fortune')}</label>
                                        <input type="text" value={editedCharacter.fate?.fortune || ''} onChange={(e) => handleFieldChange('fate.fortune', e.target.value)} />
                                    </div>
                                </div>
                                <div className="mini-box">
                                    <h4>{t('characterSheet.resilienceTitle')}</h4>
                                    <div className="mini-field">
                                        <label>{t('characterSheet.resilience')}</label>
                                        <input type="text" value={editedCharacter.resilience?.resilience || ''} onChange={(e) => handleFieldChange('resilience.resilience', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>{t('characterSheet.resolve')}</label>
                                        <input type="text" value={editedCharacter.resilience?.resolve || ''} onChange={(e) => handleFieldChange('resilience.resolve', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>{t('characterSheet.motivation')}</label>
                                        <input type="text" style={{ width: '100%' }} value={editedCharacter.resilience?.motivation || ''} onChange={(e) => handleFieldChange('resilience.motivation', e.target.value)} />
                                    </div>
                                </div>
                                <div className="mini-box">
                                    <h4>{t('characterSheet.experienceTitle')}</h4>
                                    <div className="mini-field">
                                        <label>{t('characterSheet.currentExperience')}</label>
                                        <input type="text" value={editedCharacter.experience?.current || ''} onChange={(e) => handleFieldChange('experience.current', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>{t('characterSheet.spent')}</label>
                                        <input type="text" value={editedCharacter.experience?.spent || ''} onChange={(e) => handleFieldChange('experience.spent', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>{t('characterSheet.total')}</label>
                                        <input type="text" value={editedCharacter.experience?.total || ''} onChange={(e) => handleFieldChange('experience.total', e.target.value)} />
                                    </div>
                                </div>
                            </div>

                            {/* Movement */}
                            <div className="card-section">
                                <h3>{t('characterSheet.movement')}</h3>
                                <div className="three-col-grid">
                                    <div className="mini-field">
                                        <label>{t('characterSheet.movement')}</label>
                                        <input type="text" value={editedCharacter.movement?.movement || ''} onChange={(e) => handleFieldChange('movement.movement', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>{t('characterSheet.walk')}</label>
                                        <input type="text" value={editedCharacter.movement?.walk || ''} onChange={(e) => handleFieldChange('movement.walk', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>{t('characterSheet.run')}</label>
                                        <input type="text" value={editedCharacter.movement?.run || ''} onChange={(e) => handleFieldChange('movement.run', e.target.value)} />
                                    </div>
                                </div>
                            </div>

                            {/* Wounds */}
                            <div className="card-section">
                                <h3>{t('characterSheet.wounds')}</h3>
                                <div className="three-col-grid">
                                    <div className="mini-field">
                                        <label>{t('characterSheet.sb')}</label>
                                        <input type="text" value={editedCharacter.wounds?.sb || ''} onChange={(e) => handleFieldChange('wounds.sb', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>{t('characterSheet.tbPlus2')}</label>
                                        <input type="text" value={editedCharacter.wounds?.tb || ''} onChange={(e) => handleFieldChange('wounds.tb', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>{t('characterSheet.wpb')}</label>
                                        <input type="text" value={editedCharacter.wounds?.wpb || ''} onChange={(e) => handleFieldChange('wounds.wpb', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>{t('characterSheet.hardy')}</label>
                                        <input type="text" value={editedCharacter.wounds?.hardy || ''} onChange={(e) => handleFieldChange('wounds.hardy', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>{t('characterSheet.total')}</label>
                                        <input type="text" value={editedCharacter.wounds?.total || ''} onChange={(e) => handleFieldChange('wounds.total', e.target.value)} />
                                    </div>
                                </div>
                            </div>

                            {/* Talents */}
                            <div className="card-section">
                                <h3>{t('characterSheet.talents')}</h3>
                                <table className="skills-table">
                                    <thead>
                                        <tr>
                                            <th>{t('characterSheet.talentName')}</th>
                                            <th style={{ width: '60px' }}>{t('characterSheet.timesTaken')}</th>
                                            <th>{t('characterSheet.description')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {character.talents?.map((talent, idx) => (
                                            <tr key={idx}>
                                                <td><input type="text" value={talent.name || ''} readOnly /></td>
                                                <td><input type="text" value={talent.timesTaken || ''} readOnly /></td>
                                                <td><input type="text" value={talent.description || ''} readOnly /></td>
                                            </tr>
                                        )) || (
                                            <tr>
                                                <td><input type="text" readOnly /></td>
                                                <td><input type="text" readOnly /></td>
                                                <td><input type="text" readOnly /></td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Weapons */}
                            <div className="card-section">
                                <h3>{t('characterSheet.weapons')}</h3>
                                <table className="skills-table">
                                    <thead>
                                        <tr>
                                            <th>{t('characterSheet.name')}</th>
                                            <th style={{ width: '70px' }}>{t('characterSheet.group')}</th>
                                            <th style={{ width: '50px' }}>{t('characterSheet.enc')}</th>
                                            <th style={{ width: '80px' }}>{t('characterSheet.rangeReach')}</th>
                                            <th style={{ width: '70px' }}>{t('characterSheet.damage')}</th>
                                            <th>{t('characterSheet.qualities')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {character.weapons?.map((weapon, idx) => (
                                            <tr key={idx}>
                                                <td><input type="text" value={weapon.name || ''} readOnly /></td>
                                                <td><input type="text" value={weapon.group || ''} readOnly /></td>
                                                <td><input type="text" value={weapon.enc || ''} readOnly /></td>
                                                <td><input type="text" value={weapon.range || ''} readOnly /></td>
                                                <td><input type="text" value={weapon.damage || ''} readOnly /></td>
                                                <td><input type="text" value={weapon.qualities || ''} readOnly /></td>
                                            </tr>
                                        )) || (
                                            <tr>
                                                <td><input type="text" readOnly /></td>
                                                <td><input type="text" readOnly /></td>
                                                <td><input type="text" readOnly /></td>
                                                <td><input type="text" readOnly /></td>
                                                <td><input type="text" readOnly /></td>
                                                <td><input type="text" readOnly /></td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Armour */}
                            <div className="card-section">
                                <h3>{t('characterSheet.armour')}</h3>
                                <table className="skills-table">
                                    <thead>
                                        <tr>
                                            <th>{t('characterSheet.name')}</th>
                                            <th style={{ width: '100px' }}>{t('characterSheet.location')}</th>
                                            <th style={{ width: '50px' }}>{t('characterSheet.enc')}</th>
                                            <th style={{ width: '50px' }}>{t('characterSheet.ap')}</th>
                                            <th>{t('characterSheet.qualities')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {character.armour?.map((armour, idx) => (
                                            <tr key={idx}>
                                                <td><input type="text" value={armour.name || ''} readOnly /></td>
                                                <td><input type="text" value={armour.locations || ''} readOnly /></td>
                                                <td><input type="text" value={armour.enc || ''} readOnly /></td>
                                                <td><input type="text" value={armour.ap || ''} readOnly /></td>
                                                <td><input type="text" value={armour.qualities || ''} readOnly /></td>
                                            </tr>
                                        )) || (
                                            <tr>
                                                <td><input type="text" readOnly /></td>
                                                <td><input type="text" readOnly /></td>
                                                <td><input type="text" readOnly /></td>
                                                <td><input type="text" readOnly /></td>
                                                <td><input type="text" readOnly /></td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Wealth */}
                            <div className="card-section">
                                <h3>{t('characterSheet.wealth')}</h3>
                                <div className="three-col-grid">
                                    <div className="mini-field">
                                        <label>{t('characterSheet.brass')}</label>
                                        <input type="text" value={editedCharacter.wealth?.brass || ''} onChange={(e) => handleFieldChange('wealth.brass', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>{t('characterSheet.silver')}</label>
                                        <input type="text" value={editedCharacter.wealth?.silver || ''} onChange={(e) => handleFieldChange('wealth.silver', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>{t('characterSheet.gold')}</label>
                                        <input type="text" value={editedCharacter.wealth?.gold || ''} onChange={(e) => handleFieldChange('wealth.gold', e.target.value)} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT SIDE - PAGE 2 */}
                        <div className="page-one-right">
                            {/* Characteristics */}
                            <div className="card-section">
                                <h3>{t('characterSheet.characteristics')}</h3>
                                <table className="characteristics-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: '80px' }}></th>
                                            <th
                                                onClick={(e) => handleCharacteristicClick('WS', editedCharacter.characteristics?.current?.WS, e)}
                                                style={{ cursor: 'pointer' }}
                                                title={t('combat.rollTest', { characteristic: t('characteristicsShort.WEAPON_SKILL') })}
                                            >
                                                {t('characteristicsShort.WEAPON_SKILL')}
                                            </th>
                                            <th
                                                onClick={(e) => handleCharacteristicClick('BS', editedCharacter.characteristics?.current?.BS, e)}
                                                style={{ cursor: 'pointer' }}
                                                title={t('combat.rollTest', { characteristic: t('characteristicsShort.BALLISTIC_SKILL') })}
                                            >
                                                {t('characteristicsShort.BALLISTIC_SKILL')}
                                            </th>
                                            <th
                                                onClick={(e) => handleCharacteristicClick('S', editedCharacter.characteristics?.current?.S, e)}
                                                style={{ cursor: 'pointer' }}
                                                title={t('combat.rollTest', { characteristic: t('characteristicsShort.STRENGTH') })}
                                            >
                                                {t('characteristicsShort.STRENGTH')}
                                            </th>
                                            <th
                                                onClick={(e) => handleCharacteristicClick('T', editedCharacter.characteristics?.current?.T, e)}
                                                style={{ cursor: 'pointer' }}
                                                title={t('combat.rollTest', { characteristic: t('characteristicsShort.TOUGHNESS') })}
                                            >
                                                {t('characteristicsShort.TOUGHNESS')}
                                            </th>
                                            <th
                                                onClick={(e) => handleCharacteristicClick('I', editedCharacter.characteristics?.current?.I, e)}
                                                style={{ cursor: 'pointer' }}
                                                title={t('combat.rollTest', { characteristic: t('characteristicsShort.INITIATIVE') })}
                                            >
                                                {t('characteristicsShort.INITIATIVE')}
                                            </th>
                                            <th
                                                onClick={(e) => handleCharacteristicClick('Ag', editedCharacter.characteristics?.current?.Ag, e)}
                                                style={{ cursor: 'pointer' }}
                                                title={t('combat.rollTest', { characteristic: t('characteristicsShort.AGILITY') })}
                                            >
                                                {t('characteristicsShort.AGILITY')}
                                            </th>
                                            <th
                                                onClick={(e) => handleCharacteristicClick('Dex', editedCharacter.characteristics?.current?.Dex, e)}
                                                style={{ cursor: 'pointer' }}
                                                title={t('combat.rollTest', { characteristic: t('characteristicsShort.DEXTERITY') })}
                                            >
                                                {t('characteristicsShort.DEXTERITY')}
                                            </th>
                                            <th
                                                onClick={(e) => handleCharacteristicClick('Int', editedCharacter.characteristics?.current?.Int, e)}
                                                style={{ cursor: 'pointer' }}
                                                title={t('combat.rollTest', { characteristic: t('characteristicsShort.INTELLIGENCE') })}
                                            >
                                                {t('characteristicsShort.INTELLIGENCE')}
                                            </th>
                                            <th
                                                onClick={(e) => handleCharacteristicClick('WP', editedCharacter.characteristics?.current?.WP, e)}
                                                style={{ cursor: 'pointer' }}
                                                title={t('combat.rollTest', { characteristic: t('characteristicsShort.WILLPOWER') })}
                                            >
                                                {t('characteristicsShort.WILLPOWER')}
                                            </th>
                                            <th
                                                onClick={(e) => handleCharacteristicClick('Fel', editedCharacter.characteristics?.current?.Fel, e)}
                                                style={{ cursor: 'pointer' }}
                                                title={t('combat.rollTest', { characteristic: t('characteristicsShort.FELLOWSHIP') })}
                                            >
                                                {t('characteristicsShort.FELLOWSHIP')}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="row-label">{t('characterSheet.initial')}</td>
                                            <td><input type="text" value={editedCharacter.characteristics?.initial?.WS || ''} onChange={(e) => handleFieldChange('characteristics.initial.WS', e.target.value)} /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.initial?.BS || ''} onChange={(e) => handleFieldChange('characteristics.initial.BS', e.target.value)} /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.initial?.S || ''} onChange={(e) => handleFieldChange('characteristics.initial.S', e.target.value)} /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.initial?.T || ''} onChange={(e) => handleFieldChange('characteristics.initial.T', e.target.value)} /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.initial?.I || ''} onChange={(e) => handleFieldChange('characteristics.initial.I', e.target.value)} /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.initial?.Ag || ''} onChange={(e) => handleFieldChange('characteristics.initial.Ag', e.target.value)} /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.initial?.Dex || ''} onChange={(e) => handleFieldChange('characteristics.initial.Dex', e.target.value)} /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.initial?.Int || ''} onChange={(e) => handleFieldChange('characteristics.initial.Int', e.target.value)} /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.initial?.WP || ''} onChange={(e) => handleFieldChange('characteristics.initial.WP', e.target.value)} /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.initial?.Fel || ''} onChange={(e) => handleFieldChange('characteristics.initial.Fel', e.target.value)} /></td>
                                        </tr>
                                        <tr>
                                            <td className="row-label">{t('characterSheet.advances')}</td>
                                            <td><input type="text" value={editedCharacter.characteristics?.advances?.WS || ''} onChange={(e) => handleFieldChange('characteristics.advances.WS', e.target.value)} /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.advances?.BS || ''} onChange={(e) => handleFieldChange('characteristics.advances.BS', e.target.value)} /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.advances?.S || ''} onChange={(e) => handleFieldChange('characteristics.advances.S', e.target.value)} /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.advances?.T || ''} onChange={(e) => handleFieldChange('characteristics.advances.T', e.target.value)} /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.advances?.I || ''} onChange={(e) => handleFieldChange('characteristics.advances.I', e.target.value)} /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.advances?.Ag || ''} onChange={(e) => handleFieldChange('characteristics.advances.Ag', e.target.value)} /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.advances?.Dex || ''} onChange={(e) => handleFieldChange('characteristics.advances.Dex', e.target.value)} /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.advances?.Int || ''} onChange={(e) => handleFieldChange('characteristics.advances.Int', e.target.value)} /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.advances?.WP || ''} onChange={(e) => handleFieldChange('characteristics.advances.WP', e.target.value)} /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.advances?.Fel || ''} onChange={(e) => handleFieldChange('characteristics.advances.Fel', e.target.value)} /></td>
                                        </tr>
                                        <tr>
                                            <td className="row-label">{t('characterSheet.current')}</td>
                                            <td><input type="text" value={editedCharacter.characteristics?.current?.WS || ''} readOnly /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.current?.BS || ''} readOnly /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.current?.S || ''} readOnly /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.current?.T || ''} readOnly /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.current?.I || ''} readOnly /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.current?.Ag || ''} readOnly /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.current?.Dex || ''} readOnly /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.current?.Int || ''} readOnly /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.current?.WP || ''} readOnly /></td>
                                            <td><input type="text" value={editedCharacter.characteristics?.current?.Fel || ''} readOnly /></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Basic Skills */}
                            <div className="card-section">
                                <h3>{t('characterSheet.basicSkills')}</h3>
                                <div className="two-col-layout">
                                    <table className="skills-table">
                                        <thead>
                                            <tr>
                                                <th>{t('characterSheet.name')}</th>
                                                <th style={{ width: '50px' }}>{t('characterSheet.char')}</th>
                                                <th style={{ width: '50px' }}>{t('characterSheet.adv')}</th>
                                                <th style={{ width: '50px' }}>{t('characterSheet.skill')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {basicSkills.slice(0, Math.ceil(basicSkills.length / 2)).map((skill) => {
                                                const skillKey = skill.isGrouped ? skill.parentKey : skill.key;
                                                const tooltipKey = `basic-${skill.key}`;
                                                return (
                                                    <tr key={skill.key}>
                                                        <td className="skill-name">
                                                            <span>{skill.name}</span>
                                                            <span
                                                                className="skill-info-icon"
                                                                onClick={(e) => handleTooltipToggle(tooltipKey, e)}
                                                            >
                                                                ⓘ
                                                            </span>
                                                            {activeTooltip === tooltipKey && (
                                                                <div className="skill-tooltip">
                                                                    {t(`skills:${skillKey}.description`)}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td><input type="text" value={t(`characteristicsShort.${skill.characteristic}`)} readOnly /></td>
                                                        <td>
                                                            <input
                                                                type="number"
                                                                value={getSkillAdvances(skill.key)}
                                                                onChange={(e) => handleSkillAdvancesChange(skill.key, e.target.value)}
                                                                min="0"
                                                            />
                                                        </td>
                                                        <td><input type="text" value={calculateSkillValue(skill.key, skill.characteristic)} readOnly /></td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>

                                    <table className="skills-table">
                                        <thead>
                                            <tr>
                                                <th>{t('characterSheet.name')}</th>
                                                <th style={{ width: '50px' }}>{t('characterSheet.char')}</th>
                                                <th style={{ width: '50px' }}>{t('characterSheet.adv')}</th>
                                                <th style={{ width: '50px' }}>{t('characterSheet.skill')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {basicSkills.slice(Math.ceil(basicSkills.length / 2)).map((skill) => {
                                                const skillKey = skill.isGrouped ? skill.parentKey : skill.key;
                                                const tooltipKey = `basic2-${skill.key}`;
                                                return (
                                                    <tr key={skill.key}>
                                                        <td className="skill-name">
                                                            <span>{skill.name}</span>
                                                            <span
                                                                className="skill-info-icon"
                                                                onClick={(e) => handleTooltipToggle(tooltipKey, e)}
                                                            >
                                                                ⓘ
                                                            </span>
                                                            {activeTooltip === tooltipKey && (
                                                                <div className="skill-tooltip">
                                                                    {t(`skills:${skillKey}.description`)}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td><input type="text" value={t(`characteristicsShort.${skill.characteristic}`)} readOnly /></td>
                                                        <td>
                                                            <input
                                                                type="number"
                                                                value={getSkillAdvances(skill.key)}
                                                                onChange={(e) => handleSkillAdvancesChange(skill.key, e.target.value)}
                                                                min="0"
                                                            />
                                                        </td>
                                                        <td><input type="text" value={calculateSkillValue(skill.key, skill.characteristic)} readOnly /></td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Melee (Weapon Skills) */}
                            {meleeSkill && (
                                <div className="card-section">
                                    <h3>{t('characterSheet.weaponSkills')}</h3>
                                    <table className="skills-table">
                                        <thead>
                                            <tr>
                                                <th>{t('characterSheet.name')}</th>
                                                <th style={{ width: '50px' }}>{t('characterSheet.char')}</th>
                                                <th style={{ width: '50px' }}>{t('characterSheet.adv')}</th>
                                                <th style={{ width: '50px' }}>{t('characterSheet.skill')}</th>
                                                <th style={{ width: '40px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {/* Melee Weapon Skills - Always show basic ones (BASIC and BRAWLING) */}
                                            {meleeSkill.basicMeleeSpecializations.map((spec) => {
                                                const tooltipKey = `melee-${spec}`;
                                                return (
                                                    <tr key={`${meleeSkill.key}_${spec}`}>
                                                        <td className="skill-name">
                                                            <span>{meleeSkill.name} ({t(`skills:${meleeSkill.key}.specialisations.${spec}`)})</span>
                                                            <span
                                                                className="skill-info-icon"
                                                                onClick={(e) => handleTooltipToggle(tooltipKey, e)}
                                                            >
                                                                ⓘ
                                                            </span>
                                                            {activeTooltip === tooltipKey && (
                                                                <div className="skill-tooltip">
                                                                    {t(`skills:${meleeSkill.key}.description`)}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td><input type="text" value={t(`characteristicsShort.${meleeSkill.characteristic}`)} readOnly /></td>
                                                        <td>
                                                            <input
                                                                type="number"
                                                                value={getGroupedSkillAdvances(meleeSkill.key, spec)}
                                                                onChange={(e) => handleGroupedSkillAdvancesChange(meleeSkill.key, spec, e.target.value)}
                                                                min="0"
                                                            />
                                                        </td>
                                                        <td><input type="text" value={calculateGroupedSkillValue(meleeSkill.key, spec, meleeSkill.characteristic)} readOnly /></td>
                                                        <td></td>
                                                    </tr>
                                                );
                                            })}
                                            {/* Melee Weapon Skills - Show additional ones that have been added */}
                                            {editedCharacter.basicSkills &&
                                                Object.keys(editedCharacter.basicSkills)
                                                    .filter(key => {
                                                        if (!key.startsWith(`${meleeSkill.key}_`)) return false;
                                                        const spec = key.replace(`${meleeSkill.key}_`, '');
                                                        // Exclude basic melee specializations (they're always shown above)
                                                        return !meleeSkill.basicMeleeSpecializations.includes(spec);
                                                    })
                                                    .map((compoundKey) => {
                                                        const spec = compoundKey.replace(`${meleeSkill.key}_`, '');
                                                        const tooltipKey = `melee-added-${spec}`;
                                                        return (
                                                            <tr key={compoundKey}>
                                                                <td className="skill-name">
                                                                    <span>{meleeSkill.name} ({t(`skills:${meleeSkill.key}.specialisations.${spec}`)})</span>
                                                                    <span
                                                                        className="skill-info-icon"
                                                                        onClick={(e) => handleTooltipToggle(tooltipKey, e)}
                                                                    >
                                                                        ⓘ
                                                                    </span>
                                                                    {activeTooltip === tooltipKey && (
                                                                        <div className="skill-tooltip">
                                                                            {t(`skills:${meleeSkill.key}.description`)}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td><input type="text" value={t(`characteristicsShort.${meleeSkill.characteristic}`)} readOnly /></td>
                                                                <td>
                                                                    <input
                                                                        type="number"
                                                                        value={getGroupedSkillAdvances(meleeSkill.key, spec)}
                                                                        onChange={(e) => handleGroupedSkillAdvancesChange(meleeSkill.key, spec, e.target.value)}
                                                                        min="0"
                                                                    />
                                                                </td>
                                                                <td><input type="text" value={calculateGroupedSkillValue(meleeSkill.key, spec, meleeSkill.characteristic)} readOnly /></td>
                                                                <td>
                                                                    <button
                                                                        className="skill-delete-btn"
                                                                        onClick={() => handleRemoveMeleeSkill(meleeSkill.key, spec)}
                                                                        title={t('common.delete')}
                                                                    >
                                                                        ×
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                            }
                                            {/* Ranged Weapon Skills - only show added ones */}
                                            {rangedSkill && editedCharacter.basicSkills &&
                                                Object.keys(editedCharacter.basicSkills)
                                                    .filter(key => key.startsWith(`${rangedSkill.key}_`))
                                                    .map((compoundKey) => {
                                                        const spec = compoundKey.replace(`${rangedSkill.key}_`, '');
                                                        const tooltipKey = `ranged-${spec}`;
                                                        return (
                                                            <tr key={compoundKey}>
                                                                <td className="skill-name">
                                                                    <span>{rangedSkill.name} ({t(`skills:${rangedSkill.key}.specialisations.${spec}`)})</span>
                                                                    <span
                                                                        className="skill-info-icon"
                                                                        onClick={(e) => handleTooltipToggle(tooltipKey, e)}
                                                                    >
                                                                        ⓘ
                                                                    </span>
                                                                    {activeTooltip === tooltipKey && (
                                                                        <div className="skill-tooltip">
                                                                            {t(`skills:${rangedSkill.key}.description`)}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td><input type="text" value={t(`characteristicsShort.${rangedSkill.characteristic}`)} readOnly /></td>
                                                                <td>
                                                                    <input
                                                                        type="number"
                                                                        value={getGroupedSkillAdvances(rangedSkill.key, spec)}
                                                                        onChange={(e) => handleGroupedSkillAdvancesChange(rangedSkill.key, spec, e.target.value)}
                                                                        min="0"
                                                                    />
                                                                </td>
                                                                <td><input type="text" value={calculateGroupedSkillValue(rangedSkill.key, spec, rangedSkill.characteristic)} readOnly /></td>
                                                                <td>
                                                                    <button
                                                                        className="skill-delete-btn"
                                                                        onClick={() => handleRemoveRangedSkill(rangedSkill.key, spec)}
                                                                        title={t('common.delete')}
                                                                    >
                                                                        ×
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                            }
                                        </tbody>
                                    </table>
                                    {/* Weapon Skills Dropdown - Add Melee and Ranged specializations */}
                                    <div style={{ marginTop: '10px' }}>
                                        <select
                                            onChange={(e) => {
                                                if (e.target.value) {
                                                    const [skillKey, spec] = e.target.value.split('_');
                                                    handleGroupedSkillAdvancesChange(skillKey, spec, '0');
                                                }
                                                e.target.value = '';
                                            }}
                                            style={{ width: '100%', padding: '5px' }}
                                        >
                                            <option value="">{t('characterSheet.addWeaponSkill')}</option>
                                            {/* Melee specializations (excluding BASIC and BRAWLING and already added ones) */}
                                            {meleeSkill && meleeSkill.specialisations
                                                .filter(spec => {
                                                    // Exclude basic melee specializations (always shown)
                                                    if (meleeSkill.basicMeleeSpecializations.includes(spec)) return false;
                                                    // Exclude already added specializations
                                                    const compoundKey = `${meleeSkill.key}_${spec}`;
                                                    return !(compoundKey in (editedCharacter.basicSkills || {}));
                                                })
                                                .map(spec => (
                                                    <option key={`${meleeSkill.key}_${spec}`} value={`${meleeSkill.key}_${spec}`}>
                                                        {meleeSkill.name} ({t(`skills:${meleeSkill.key}.specialisations.${spec}`)})
                                                    </option>
                                                ))
                                            }
                                            {/* Ranged specializations (excluding already added ones) */}
                                            {rangedSkill && rangedSkill.specialisations
                                                .filter(spec => {
                                                    // Exclude already added specializations
                                                    const compoundKey = `${rangedSkill.key}_${spec}`;
                                                    return !(compoundKey in (editedCharacter.basicSkills || {}));
                                                })
                                                .map(spec => (
                                                    <option key={`${rangedSkill.key}_${spec}`} value={`${rangedSkill.key}_${spec}`}>
                                                        {rangedSkill.name} ({t(`skills:${rangedSkill.key}.specialisations.${spec}`)})
                                                    </option>
                                                ))
                                            }
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* Magic Skills */}
                            {magicSkills.length > 0 && (
                                <div className="card-section">
                                    <h3>{t('characterSheet.magicSkills')}</h3>
                                    <table className="skills-table">
                                        <thead>
                                            <tr>
                                                <th>{t('characterSheet.name')}</th>
                                                <th style={{ width: '50px' }}>{t('characterSheet.char')}</th>
                                                <th style={{ width: '50px' }}>{t('characterSheet.adv')}</th>
                                                <th style={{ width: '50px' }}>{t('characterSheet.skill')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {magicSkills.map((skill) => {
                                                const tooltipKey = `magic-${skill.key}`;
                                                const skillKey = skill.isGrouped ? skill.parentKey : skill.key;

                                                // For general skills like Channelling, use basicSkills storage
                                                const advances = skill.isGeneral
                                                    ? (parseInt(editedCharacter.basicSkills?.[skill.key]) || 0)
                                                    : skill.isGrouped
                                                        ? getGroupedSkillAdvances(skill.parentKey, skill.specializationKey)
                                                        : (parseInt(editedCharacter.advancedSkills?.[skill.key]) || 0);

                                                const skillValue = skill.isGeneral || skill.isGrouped
                                                    ? (getCharacteristicValue(skill.characteristic) + advances)
                                                    : calculateAdvancedSkillValue(skill.key, skill.characteristic);

                                                return (
                                                    <tr key={skill.key}>
                                                        <td className="skill-name">
                                                            <span>{skill.name}</span>
                                                            <span
                                                                className="skill-info-icon"
                                                                onClick={(e) => handleTooltipToggle(tooltipKey, e)}
                                                            >
                                                                ⓘ
                                                            </span>
                                                            {activeTooltip === tooltipKey && (
                                                                <div className="skill-tooltip">
                                                                    {t(`skills:${skillKey}.description`)}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td><input type="text" value={t(`characteristicsShort.${skill.characteristic}`)} readOnly /></td>
                                                        <td>
                                                            <input
                                                                type="number"
                                                                value={advances}
                                                                onChange={(e) => {
                                                                    if (skill.isGeneral) {
                                                                        handleSkillAdvancesChange(skill.key, e.target.value);
                                                                    } else if (skill.isGrouped) {
                                                                        handleGroupedSkillAdvancesChange(skill.parentKey, skill.specializationKey, e.target.value);
                                                                    } else {
                                                                        handleAdvancedSkillAdvancesChange(skill.key, e.target.value);
                                                                    }
                                                                }}
                                                                min="0"
                                                            />
                                                        </td>
                                                        <td><input type="text" value={skillValue} readOnly /></td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Advanced and Grouped Skills */}
                            <div className="card-section">
                                <h3>{t('characterSheet.groupedAdvancedSkills')}</h3>
                                <table className="skills-table">
                                    <thead>
                                        <tr>
                                            <th>{t('characterSheet.name')}</th>
                                            <th style={{ width: '50px' }}>{t('characterSheet.char')}</th>
                                            <th style={{ width: '50px' }}>{t('characterSheet.adv')}</th>
                                            <th style={{ width: '50px' }}>{t('characterSheet.skill')}</th>
                                            <th style={{ width: '40px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {advancedSkillsList.map((skill) => {
                                            // Extract base skill key for description (e.g., LANGUAGE from LANGUAGE_CLASSICAL)
                                            const baseSkillKey = skill.key.includes('_') ? skill.key.split('_')[0] : skill.key;
                                            const tooltipKey = `advanced-${skill.key}`;
                                            return (
                                                <tr key={skill.key}>
                                                    <td className="skill-name">
                                                        <span>{skill.name}</span>
                                                        <span
                                                            className="skill-info-icon"
                                                            onClick={(e) => handleTooltipToggle(tooltipKey, e)}
                                                        >
                                                            ⓘ
                                                        </span>
                                                        {activeTooltip === tooltipKey && (
                                                            <div className="skill-tooltip">
                                                                {t(`skills:${baseSkillKey}.description`)}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td><input type="text" value={t(`characteristicsShort.${skill.characteristic}`)} readOnly /></td>
                                                    <td>
                                                        <input
                                                            type="number"
                                                            value={skill.advances}
                                                            onChange={(e) => handleAdvancedSkillAdvancesChange(skill.key, e.target.value)}
                                                            min="0"
                                                        />
                                                    </td>
                                                    <td><input type="text" value={calculateAdvancedSkillValue(skill.key, skill.characteristic)} readOnly /></td>
                                                    <td>
                                                        <button
                                                            className="skill-delete-btn"
                                                            onClick={() => handleRemoveAdvancedSkill(skill.key)}
                                                            title={t('common.delete')}
                                                        >
                                                            ×
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {advancedSkillsList.length === 0 && (
                                            <tr>
                                                <td colSpan="5" style={{ textAlign: 'center', fontStyle: 'italic' }}>
                                                    {t('characterSheet.noAdvancedSkills')}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                <div style={{ marginTop: '10px' }}>
                                    <select
                                        onChange={(e) => {
                                            handleAddAdvancedSkill(e.target.value);
                                            e.target.value = '';
                                        }}
                                        style={{ width: '100%', padding: '5px' }}
                                    >
                                        <option value="">{t('characterSheet.addAdvancedSkill')}</option>
                                        {advancedSkillsOptions
                                            .filter(option => !(option.key in (editedCharacter.advancedSkills || {})))
                                            .map(option => (
                                                <option key={option.key} value={option.key}>
                                                    {option.name}
                                                </option>
                                            ))
                                        }
                                    </select>
                                </div>
                            </div>

                            {/* Spells and Prayers */}
                            <div className="card-section">
                                <h3>{t('characterSheet.spellsAndPrayers')}</h3>
                                <table className="skills-table">
                                    <thead>
                                        <tr>
                                            <th>{t('characterSheet.name')}</th>
                                            <th style={{ width: '50px' }}>{t('characterSheet.tn')}</th>
                                            <th style={{ width: '70px' }}>{t('characterSheet.range')}</th>
                                            <th style={{ width: '70px' }}>{t('characterSheet.target')}</th>
                                            <th style={{ width: '70px' }}>{t('characterSheet.duration')}</th>
                                            <th>{t('characterSheet.effect')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {character.spells?.map((spell, idx) => (
                                            <tr key={idx}>
                                                <td><input type="text" value={spell.name || ''} readOnly /></td>
                                                <td><input type="text" value={spell.tn || ''} readOnly /></td>
                                                <td><input type="text" value={spell.range || ''} readOnly /></td>
                                                <td><input type="text" value={spell.target || ''} readOnly /></td>
                                                <td><input type="text" value={spell.duration || ''} readOnly /></td>
                                                <td><input type="text" value={spell.effect || ''} readOnly /></td>
                                            </tr>
                                        )) || (
                                            <tr>
                                                <td><input type="text" readOnly /></td>
                                                <td><input type="text" readOnly /></td>
                                                <td><input type="text" readOnly /></td>
                                                <td><input type="text" readOnly /></td>
                                                <td><input type="text" readOnly /></td>
                                                <td><input type="text" readOnly /></td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Ambitions */}
                            <div className="card-section">
                                <h3>{t('characterSheet.ambitions')}</h3>
                                <div className="form-group">
                                    <label>{t('characterSheet.shortTerm')}</label>
                                    <input type="text" value={editedCharacter.ambitions?.shortTerm || ''} onChange={(e) => handleFieldChange('ambitions.shortTerm', e.target.value)} />
                                </div>
                                <div className="form-group" style={{ marginTop: '8px' }}>
                                    <label>{t('characterSheet.longTerm')}</label>
                                    <input type="text" value={editedCharacter.ambitions?.longTerm || ''} onChange={(e) => handleFieldChange('ambitions.longTerm', e.target.value)} />
                                </div>
                            </div>

                            {/* Party */}
                            <div className="card-section">
                                <h3>{t('characterSheet.party')}</h3>
                                <div className="form-group">
                                    <label>{t('characterSheet.partyName')}</label>
                                    <input type="text" value={editedCharacter.party?.name || ''} onChange={(e) => handleFieldChange('party.name', e.target.value)} />
                                </div>
                                <div className="form-group" style={{ marginTop: '8px' }}>
                                    <label>{t('characterSheet.members')}</label>
                                    <textarea className="notes" style={{ minHeight: '60px' }} value={editedCharacter.party?.members || ''} onChange={(e) => handleFieldChange('party.members', e.target.value)} />
                                </div>
                            </div>

                            {/* Trappings */}
                            <div className="card-section">
                                <h3>{t('characterSheet.trappings')}</h3>
                                <textarea className="notes" value={editedCharacter.trappings || ''} onChange={(e) => handleFieldChange('trappings', e.target.value)} />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showModifierModal && (
                <ModifierSelectionModal
                    mousePosition={mousePosition}
                    onConfirm={handleModifierConfirm}
                    onCancel={handleModifierCancel}
                />
            )}
        </div>
    );

    return createPortal(popupContent, document.body);
}

export default CharacterSheetPopup;