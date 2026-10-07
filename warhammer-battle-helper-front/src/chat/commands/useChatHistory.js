import { useCallback, useMemo, useRef } from 'react';

const MAX_HISTORY = 50;

// Terminal-style history of sent chat lines. Kept in refs: browsing changes the
// textarea through the caller's own state, so the hook itself never needs to re-render.
export default function useChatHistory(max = MAX_HISTORY) {
    const entries = useRef([]);
    const index = useRef(null); // null = not browsing

    const push = useCallback((text) => {
        const list = entries.current;
        if (list[list.length - 1] !== text) {
            list.push(text);
            if (list.length > max) list.shift();
        }
        index.current = null;
    }, [max]);

    const prev = useCallback(() => {
        const list = entries.current;
        if (list.length === 0) return null;
        index.current = index.current === null ? list.length - 1 : Math.max(0, index.current - 1);
        return list[index.current];
    }, []);

    const next = useCallback(() => {
        const list = entries.current;
        if (index.current === null) return null;
        if (index.current >= list.length - 1) {
            index.current = null;
            return '';
        }
        index.current += 1;
        return list[index.current];
    }, []);

    const isShowing = useCallback(
        (text) => index.current !== null && entries.current[index.current] === text,
        []
    );

    const reset = useCallback(() => { index.current = null; }, []);

    return useMemo(() => ({ push, prev, next, isShowing, reset }), [push, prev, next, isShowing, reset]);
}
