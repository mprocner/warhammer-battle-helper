import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

// Presentational floating tooltip, anchored ABOVE its trigger (arrow pointing down).
// Portaled to <body> by usePortalTooltip so it escapes any transformed/overflow-clipped
// ancestor (e.g. the zoomed scene viewport). Styling: global .portal-tooltip in style.css.
function PortalTooltip({ top, left, center, text, alignLeft }) {
    const modifierClass = alignLeft ? 'portal-tooltip--align-left' : 'portal-tooltip--above';
    const arrowStyle = alignLeft ? { left: center - left - 6 } : undefined;
    return (
        <div className={`portal-tooltip ${modifierClass}`} style={{ top, left }}>
            {text}
            <span className="portal-tooltip__arrow" style={arrowStyle} />
        </div>
    );
}

// usePortalTooltip wires hover → an above-anchored portal tooltip. Spread the returned
// handlers on the trigger (passing the label + e.currentTarget) and render tooltipNode.
// Near the left edge it flips to left-aligned so it never spills off-screen.
export function usePortalTooltip() {
    const [tooltip, setTooltip] = useState(null);
    const timeoutRef = useRef(null);

    const showTooltip = useCallback((text, element) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        const rect = element.getBoundingClientRect();
        const center = rect.left + rect.width / 2;
        const alignLeft = center < 125;
        setTooltip({
            top: rect.top,
            left: alignLeft ? rect.left : center,
            center,
            text,
            alignLeft,
        });
    }, []);

    const hideTooltip = useCallback(() => {
        timeoutRef.current = setTimeout(() => setTooltip(null), 100);
    }, []);

    const tooltipNode = tooltip
        ? createPortal(<PortalTooltip {...tooltip} />, document.body)
        : null;

    return { showTooltip, hideTooltip, tooltipNode };
}

export default PortalTooltip;
