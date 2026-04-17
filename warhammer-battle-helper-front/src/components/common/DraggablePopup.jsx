import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import CloseIcon from '@mui/icons-material/Close';
import MinimizeIcon from '@mui/icons-material/Minimize';

function DraggablePopup({ title, onClose, headerButtons, children, initialWidth = 1400 }) {
    const [isMinimized, setIsMinimized] = useState(false);
    const [position, setPosition] = useState(() => ({
        x: Math.min(0, window.innerWidth - 600),
        y: Math.min(0, window.innerHeight - 400)
    }));
    const [size, setSize] = useState(() => ({
        width: Math.min(initialWidth, window.innerWidth),
        height: Math.min(800, window.innerHeight)
    }));
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [resizeDirection, setResizeDirection] = useState(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
    const popupRef = useRef(null);

    const clampPosition = useCallback((x, y) => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const el = popupRef.current;
        const elWidth = el ? el.offsetWidth : 600;
        const headerHeight = 46;

        const minVisibleX = 80;
        const clampedX = Math.max(-elWidth + minVisibleX, Math.min(x, vw - minVisibleX));
        const clampedY = Math.max(0, Math.min(y, vh - headerHeight));

        return { x: clampedX, y: clampedY };
    }, []);

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
                const clamped = clampPosition(e.clientX - dragOffset.x, e.clientY - dragOffset.y);
                setPosition(clamped);
            }

            if (isResizing && resizeDirection) {
                const deltaX = e.clientX - resizeStart.x;
                const deltaY = e.clientY - resizeStart.y;

                let newWidth = resizeStart.width;
                let newHeight = resizeStart.height;
                let newX = resizeStart.posX;
                let newY = resizeStart.posY;

                const minWidth = 600;
                const minHeight = 400;
                const maxWidth = window.innerWidth;
                const maxHeight = window.innerHeight;

                if (resizeDirection.includes('e')) {
                    newWidth = Math.max(minWidth, Math.min(resizeStart.width + deltaX, maxWidth - newX));
                }
                if (resizeDirection.includes('w')) {
                    const potentialWidth = resizeStart.width - deltaX;
                    if (potentialWidth >= minWidth) {
                        newWidth = potentialWidth;
                        newX = resizeStart.posX + deltaX;
                    }
                }
                if (resizeDirection.includes('s')) {
                    newHeight = Math.max(minHeight, Math.min(resizeStart.height + deltaY, maxHeight - newY));
                }
                if (resizeDirection.includes('n')) {
                    const potentialHeight = resizeStart.height - deltaY;
                    if (potentialHeight >= minHeight) {
                        newHeight = potentialHeight;
                        newY = resizeStart.posY + deltaY;
                    }
                }

                setSize({ width: newWidth, height: newHeight });
                const clamped = clampPosition(newX, newY);
                setPosition(clamped);
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
    }, [isDragging, isResizing, dragOffset, resizeDirection, resizeStart, clampPosition]);

    const content = (
        <div
            ref={popupRef}
            className="character-sheet-popup"
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: isMinimized ? 'auto' : `${Math.min(size.width, window.innerWidth)}px`,
                height: isMinimized ? 'auto' : `${Math.min(size.height, window.innerHeight)}px`,
                maxWidth: '100vw',
                maxHeight: '100vh'
            }}
            onMouseDown={handleMouseDown}
        >
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
                <h2 style={{ fontSize: isMinimized ? '14px' : undefined }}>{title}</h2>
                <div className="sheet-header-buttons">
                    {!isMinimized && headerButtons}
                    <button
                        className="minimize-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsMinimized(!isMinimized);
                        }}
                        title={isMinimized ? 'Expand' : 'Minimize'}
                    >
                        <MinimizeIcon fontSize="small" />
                    </button>
                    <button
                        className="close-btn-sheet"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                    >
                        <CloseIcon fontSize="small" />
                    </button>
                </div>
            </div>

            {!isMinimized && (
                <div className="sheet-content" style={{ maxHeight: `${size.height - 80}px` }}>
                    {children}
                </div>
            )}
        </div>
    );

    return createPortal(content, document.body);
}

export default DraggablePopup;
