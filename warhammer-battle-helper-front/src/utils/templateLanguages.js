import codes from './templateLanguages.json';

// ISO 639-1 codes a custom template may declare. The JSON is also read by a Go test
// (internal/models/template_about_test.go), so the backend validates exactly this list.
export const TEMPLATE_LANGUAGES = codes;

export const isTemplateLanguage = (code) => TEMPLATE_LANGUAGES.includes(code);
