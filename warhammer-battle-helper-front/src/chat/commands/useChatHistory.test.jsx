import { renderHook } from '@testing-library/react';
import useChatHistory from './useChatHistory';

// Pure ref-based state with no DOM dependency, so renderHook is enough.
describe('useChatHistory', () => {
    it('returns null when there is nothing to recall', () => {
        const { result } = renderHook(() => useChatHistory());
        expect(result.current.prev()).toBeNull();
        expect(result.current.next()).toBeNull();
    });

    it('walks back and forth through sent entries', () => {
        const { result } = renderHook(() => useChatHistory());
        const h = result.current;
        h.push('a');
        h.push('b');

        expect(h.prev()).toBe('b');
        expect(h.isShowing('b')).toBe(true);
        expect(h.prev()).toBe('a');
        expect(h.prev()).toBe('a'); // clamped at the oldest entry
        expect(h.next()).toBe('b');
        expect(h.next()).toBe(''); // past the newest entry: back to an empty field
        expect(h.isShowing('')).toBe(false);
    });

    it('skips a consecutive duplicate', () => {
        const { result } = renderHook(() => useChatHistory());
        const h = result.current;
        h.push('a');
        h.push('a');

        expect(h.prev()).toBe('a');
        expect(h.next()).toBe('');
    });

    it('drops the oldest entry past the cap', () => {
        const { result } = renderHook(() => useChatHistory(2));
        const h = result.current;
        h.push('a');
        h.push('b');
        h.push('c');

        expect(h.prev()).toBe('c');
        expect(h.prev()).toBe('b');
        expect(h.prev()).toBe('b');
    });

    it('reset stops browsing', () => {
        const { result } = renderHook(() => useChatHistory());
        const h = result.current;
        h.push('a');
        h.prev();
        h.reset();

        expect(h.isShowing('a')).toBe(false);
        expect(h.next()).toBeNull();
    });
});
