import React, { useEffect, useRef } from 'react';

function ModifierSelectionModal({ mousePosition, onConfirm, onCancel }) {
    const modifierOptions = [60, 50, 40, 30, 20, 10, 0, -10, -20, -30, -40, -50, -60];
    const modalRef = useRef(null);

    useEffect(() => {
        // Center the modal at the cursor position
        if (modalRef.current && mousePosition) {
            const rect = modalRef.current.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            // Center the popup at the cursor
            let adjustedX = mousePosition.x - rect.width / 2;
            let adjustedY = mousePosition.y - rect.height / 2;

            // Adjust if goes off right edge
            if (adjustedX + rect.width > viewportWidth) {
                adjustedX = viewportWidth - rect.width - 10;
            }

            // Adjust if goes off bottom edge
            if (adjustedY + rect.height > viewportHeight) {
                adjustedY = viewportHeight - rect.height - 10;
            }

            // Adjust if goes off left edge
            if (adjustedX < 10) {
                adjustedX = 10;
            }

            // Adjust if goes off top edge
            if (adjustedY < 10) {
                adjustedY = 10;
            }

            modalRef.current.style.left = `${adjustedX}px`;
            modalRef.current.style.top = `${adjustedY}px`;
        }
    }, [mousePosition]);

    const handleModifierClick = (modifier) => {
        onConfirm(modifier);
    };

    return (
        <div className="modifier-popup-overlay" onClick={onCancel}>
            <div
                ref={modalRef}
                className="modifier-popup"
                onClick={(e) => e.stopPropagation()}
                style={{
                    left: mousePosition?.x || 0,
                    top: mousePosition?.y || 0
                }}
            >
                {modifierOptions.map((modifier) => (
                    <button
                        key={modifier}
                        className={`modifier-popup-btn ${modifier > 0 ? 'positive' : modifier < 0 ? 'negative' : 'neutral'}`}
                        onClick={() => handleModifierClick(modifier)}
                    >
                        {modifier > 0 ? '+' : ''}{modifier}
                    </button>
                ))}
            </div>
        </div>
    );
}

export default ModifierSelectionModal;