import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import axiosInstance from '../api/axios';

function CharacterSheetPopup({ character, onClose, onCharacterUpdate }) {
    const { t } = useTranslation();
    const [isMinimized, setIsMinimized] = useState(false);
    const [position, setPosition] = useState({ x: 100, y: 100 });
    const [size, setSize] = useState({ width: 1400, height: 800 });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [resizeDirection, setResizeDirection] = useState(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
    const [editedCharacter, setEditedCharacter] = useState(character);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const popupRef = useRef(null);
    const saveTimeoutRef = useRef(null);

    // Update edited character when character prop changes
    useEffect(() => {
        setEditedCharacter(character);
        setHasChanges(false);
    }, [character]);

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
                                        <label>Name</label>
                                        <input type="text" value={editedCharacter.basicInfo?.name || ''} onChange={(e) => handleFieldChange('basicInfo.name', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>Species</label>
                                        <input type="text" value={editedCharacter.basicInfo?.species || ''} onChange={(e) => handleFieldChange('basicInfo.species', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>Class</label>
                                        <input type="text" value={editedCharacter.basicInfo?.class || ''} onChange={(e) => handleFieldChange('basicInfo.class', e.target.value)} />
                                    </div>
                                </div>
                                <div className="form-grid" style={{ marginTop: '10px' }}>
                                    <div className="form-group">
                                        <label>Career</label>
                                        <input type="text" value={editedCharacter.basicInfo?.career || ''} onChange={(e) => handleFieldChange('basicInfo.career', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>Career Level</label>
                                        <input type="text" value={editedCharacter.basicInfo?.careerLevel || ''} onChange={(e) => handleFieldChange('basicInfo.careerLevel', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>Status</label>
                                        <input type="text" value={editedCharacter.basicInfo?.status || ''} onChange={(e) => handleFieldChange('basicInfo.status', e.target.value)} />
                                    </div>
                                </div>
                                <div className="form-group" style={{ marginTop: '10px' }}>
                                    <label>Career Path</label>
                                    <input type="text" value={editedCharacter.basicInfo?.careerPath || ''} onChange={(e) => handleFieldChange('basicInfo.careerPath', e.target.value)} />
                                </div>
                                <div className="form-grid" style={{ marginTop: '10px' }}>
                                    <div className="form-group">
                                        <label>Age</label>
                                        <input type="text" value={editedCharacter.basicInfo?.age || ''} onChange={(e) => handleFieldChange('basicInfo.age', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>Height</label>
                                        <input type="text" value={editedCharacter.basicInfo?.height || ''} onChange={(e) => handleFieldChange('basicInfo.height', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>Hair</label>
                                        <input type="text" value={editedCharacter.basicInfo?.hair || ''} onChange={(e) => handleFieldChange('basicInfo.hair', e.target.value)} />
                                    </div>
                                </div>
                                <div className="form-group" style={{ marginTop: '10px' }}>
                                    <label>Eyes</label>
                                    <input type="text" value={editedCharacter.basicInfo?.eyes || ''} onChange={(e) => handleFieldChange('basicInfo.eyes', e.target.value)} />
                                </div>
                            </div>

                            {/* Fate, Resilience, Experience */}
                            <div className="three-col-grid">
                                <div className="mini-box">
                                    <h4>Fate</h4>
                                    <div className="mini-field">
                                        <label>Fate</label>
                                        <input type="text" value={editedCharacter.fate?.fate || ''} onChange={(e) => handleFieldChange('fate.fate', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>Fortune</label>
                                        <input type="text" value={editedCharacter.fate?.fortune || ''} onChange={(e) => handleFieldChange('fate.fortune', e.target.value)} />
                                    </div>
                                </div>
                                <div className="mini-box">
                                    <h4>Resilience</h4>
                                    <div className="mini-field">
                                        <label>Resilience</label>
                                        <input type="text" value={editedCharacter.resilience?.resilience || ''} onChange={(e) => handleFieldChange('resilience.resilience', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>Resolve</label>
                                        <input type="text" value={editedCharacter.resilience?.resolve || ''} onChange={(e) => handleFieldChange('resilience.resolve', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>Motivation</label>
                                        <input type="text" style={{ width: '100%' }} value={editedCharacter.resilience?.motivation || ''} onChange={(e) => handleFieldChange('resilience.motivation', e.target.value)} />
                                    </div>
                                </div>
                                <div className="mini-box">
                                    <h4>Experience</h4>
                                    <div className="mini-field">
                                        <label>Current</label>
                                        <input type="text" value={editedCharacter.experience?.current || ''} onChange={(e) => handleFieldChange('experience.current', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>Spent</label>
                                        <input type="text" value={editedCharacter.experience?.spent || ''} onChange={(e) => handleFieldChange('experience.spent', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>Total</label>
                                        <input type="text" value={editedCharacter.experience?.total || ''} onChange={(e) => handleFieldChange('experience.total', e.target.value)} />
                                    </div>
                                </div>
                            </div>

                            {/* Movement */}
                            <div className="card-section">
                                <h3>{t('characterSheet.movement')}</h3>
                                <div className="three-col-grid">
                                    <div className="mini-field">
                                        <label>Movement</label>
                                        <input type="text" value={editedCharacter.movement?.movement || ''} onChange={(e) => handleFieldChange('movement.movement', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>Walk</label>
                                        <input type="text" value={editedCharacter.movement?.walk || ''} onChange={(e) => handleFieldChange('movement.walk', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>Run</label>
                                        <input type="text" value={editedCharacter.movement?.run || ''} onChange={(e) => handleFieldChange('movement.run', e.target.value)} />
                                    </div>
                                </div>
                            </div>

                            {/* Wounds */}
                            <div className="card-section">
                                <h3>{t('characterSheet.wounds')}</h3>
                                <div className="three-col-grid">
                                    <div className="mini-field">
                                        <label>SB</label>
                                        <input type="text" value={editedCharacter.wounds?.sb || ''} onChange={(e) => handleFieldChange('wounds.sb', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>TB+2</label>
                                        <input type="text" value={editedCharacter.wounds?.tb || ''} onChange={(e) => handleFieldChange('wounds.tb', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>WPB</label>
                                        <input type="text" value={editedCharacter.wounds?.wpb || ''} onChange={(e) => handleFieldChange('wounds.wpb', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>Hardy</label>
                                        <input type="text" value={editedCharacter.wounds?.hardy || ''} onChange={(e) => handleFieldChange('wounds.hardy', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>Total</label>
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
                                            <th>Talent Name</th>
                                            <th style={{ width: '60px' }}>Times Taken</th>
                                            <th>Description</th>
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
                                            <th>Name</th>
                                            <th style={{ width: '70px' }}>Group</th>
                                            <th style={{ width: '50px' }}>Enc</th>
                                            <th style={{ width: '80px' }}>Range/Reach</th>
                                            <th style={{ width: '70px' }}>Damage</th>
                                            <th>Qualities</th>
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
                                            <th>Name</th>
                                            <th style={{ width: '100px' }}>Locations</th>
                                            <th style={{ width: '50px' }}>Enc</th>
                                            <th style={{ width: '50px' }}>AP</th>
                                            <th>Qualities</th>
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
                                        <label>D (Brass)</label>
                                        <input type="text" value={editedCharacter.wealth?.brass || ''} onChange={(e) => handleFieldChange('wealth.brass', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>SS (Silver)</label>
                                        <input type="text" value={editedCharacter.wealth?.silver || ''} onChange={(e) => handleFieldChange('wealth.silver', e.target.value)} />
                                    </div>
                                    <div className="mini-field">
                                        <label>GC (Gold)</label>
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
                                            <th>WS</th>
                                            <th>BS</th>
                                            <th>S</th>
                                            <th>T</th>
                                            <th>I</th>
                                            <th>Ag</th>
                                            <th>Dex</th>
                                            <th>Int</th>
                                            <th>WP</th>
                                            <th>Fel</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="row-label">Initial</td>
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
                                            <td className="row-label">Advances</td> 
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
                                            <td className="row-label">Current</td>
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
                                                <th>Name</th>
                                                <th style={{ width: '50px' }}>Char</th>
                                                <th style={{ width: '50px' }}>Adv</th>
                                                <th style={{ width: '50px' }}>Skill</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {character.basicSkills?.slice(0, 10).map((skill, idx) => (
                                                <tr key={idx}>
                                                    <td className="skill-name">{skill.name || ''}</td>
                                                    <td><input type="text" value={skill.characteristic || ''} readOnly /></td>
                                                    <td><input type="text" value={skill.advances || ''} readOnly /></td>
                                                    <td><input type="text" value={skill.skill || ''} readOnly /></td>
                                                </tr>
                                            )) || <tr><td colSpan="4">No skills</td></tr>}
                                        </tbody>
                                    </table>

                                    <table className="skills-table">
                                        <thead>
                                            <tr>
                                                <th>Name</th>
                                                <th style={{ width: '50px' }}>Char</th>
                                                <th style={{ width: '50px' }}>Adv</th>
                                                <th style={{ width: '50px' }}>Skill</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {character.basicSkills?.slice(10).map((skill, idx) => (
                                                <tr key={idx}>
                                                    <td className="skill-name">{skill.name || ''}</td>
                                                    <td><input type="text" value={skill.characteristic || ''} readOnly /></td>
                                                    <td><input type="text" value={skill.advances || ''} readOnly /></td>
                                                    <td><input type="text" value={skill.skill || ''} readOnly /></td>
                                                </tr>
                                            )) || <tr><td colSpan="4">-</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Grouped & Advanced Skills */}
                            <div className="card-section">
                                <h3>{t('characterSheet.groupedAdvancedSkills')}</h3>
                                <table className="skills-table">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th style={{ width: '70px' }}>Characteristic</th>
                                            <th style={{ width: '50px' }}>Adv</th>
                                            <th style={{ width: '50px' }}>Skill</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {character.advancedSkills?.map((skill, idx) => (
                                            <tr key={idx}>
                                                <td><input type="text" value={skill.name || ''} readOnly /></td>
                                                <td><input type="text" value={skill.characteristic || ''} readOnly /></td>
                                                <td><input type="text" value={skill.advances || ''} readOnly /></td>
                                                <td><input type="text" value={skill.skill || ''} readOnly /></td>
                                            </tr>
                                        )) || (
                                            <tr>
                                                <td><input type="text" readOnly /></td>
                                                <td><input type="text" readOnly /></td>
                                                <td><input type="text" readOnly /></td>
                                                <td><input type="text" readOnly /></td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Spells and Prayers */}
                            <div className="card-section">
                                <h3>{t('characterSheet.spellsAndPrayers')}</h3>
                                <table className="skills-table">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th style={{ width: '50px' }}>TN</th>
                                            <th style={{ width: '70px' }}>Range</th>
                                            <th style={{ width: '70px' }}>Target</th>
                                            <th style={{ width: '70px' }}>Duration</th>
                                            <th>Effect</th>
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
                                    <label>Short Term</label>
                                    <input type="text" value={editedCharacter.ambitions?.shortTerm || ''} onChange={(e) => handleFieldChange('ambitions.shortTerm', e.target.value)} />
                                </div>
                                <div className="form-group" style={{ marginTop: '8px' }}>
                                    <label>Long Term</label>
                                    <input type="text" value={editedCharacter.ambitions?.longTerm || ''} onChange={(e) => handleFieldChange('ambitions.longTerm', e.target.value)} />
                                </div>
                            </div>

                            {/* Party */}
                            <div className="card-section">
                                <h3>{t('characterSheet.party')}</h3>
                                <div className="form-group">
                                    <label>Party Name</label>
                                    <input type="text" value={editedCharacter.party?.name || ''} onChange={(e) => handleFieldChange('party.name', e.target.value)} />
                                </div>
                                <div className="form-group" style={{ marginTop: '8px' }}>
                                    <label>Members</label>
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
        </div>
    );

    return createPortal(popupContent, document.body);
}

export default CharacterSheetPopup;