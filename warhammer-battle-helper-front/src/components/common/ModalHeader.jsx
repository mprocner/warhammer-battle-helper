import React from 'react';
import CloseIcon from '@mui/icons-material/Close';
import MinimizeIcon from '@mui/icons-material/Minimize';

function ModalHeader({
    title,
    onClose,
    isMinimized = false,
    onToggleMinimize,
    extraButtons,
    isDragging = false,
    draggable = false,
    icon,
    minimizeTitle,
    expandTitle,
    closeTitle,
}) {
    const className = [
        'modal-header',
        draggable && !isDragging ? 'modal-header--draggable' : '',
        isDragging ? 'modal-header--dragging' : '',
        isMinimized ? 'modal-header--minimized' : '',
    ].filter(Boolean).join(' ');

    return (
        <div className={className}>
            {icon && <span className="modal-header__icon">{icon}</span>}
            <h2 className="modal-header__title">{title}</h2>
            <div className="modal-header__buttons">
                {!isMinimized && extraButtons}
                {onToggleMinimize && (
                    <button
                        className="modal-header__btn modal-header__btn--minimize"
                        onClick={(e) => { e.stopPropagation(); onToggleMinimize(); }}
                        title={isMinimized ? expandTitle : minimizeTitle}
                    >
                        <MinimizeIcon fontSize="small" />
                    </button>
                )}
                <button
                    className="modal-header__btn modal-header__btn--close"
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    title={closeTitle}
                >
                    <CloseIcon fontSize="small" />
                </button>
            </div>
        </div>
    );
}

export default ModalHeader;
