import { useEffect } from 'react';

export const BRAND = 'PlayRPG';
const SEPARATOR = ' · ';

// The brand is a name, not a word, so it stays the same in every language.
export const formatPageTitle = (page) => (page ? `${page}${SEPARATOR}${BRAND}` : BRAND);

// Sets the browser tab title to "<page> · PlayRPG" for as long as the calling page is mounted.
// The caller passes an already translated string, so a language switch re-renders the page with a
// new value and the effect runs again. On unmount the title falls back to the bare brand: React
// runs every cleanup of a route change before the next page's effects, so the next page still
// gets the last word and a route without its own title never keeps a stale one.
const usePageTitle = (page) => {
    useEffect(() => {
        document.title = formatPageTitle(page);
        return () => { document.title = BRAND; };
    }, [page]);
};

export default usePageTitle;
