// Language of what the overlay says (speech bubbles, cues): config `ui_language` "en" | "ta".
// Settings stays English. Strings are their own keys: t('Vanakkam nanba! 🙏'); placeholders
// in braces are filled from `vars`: t('{n}/{goal} glasses today 💧', { n, goal }).
// Tamil text lives in i18n-ta.js; a string missing there falls back to English.

import { TA } from './i18n-ta.js';

let lang = 'en';

export function setLanguage(code) {
    lang = code === 'ta' ? 'ta' : 'en';
}

export function language() {
    return lang;
}

/** `text` in the current language, with {placeholders} replaced from `vars`. */
export function t(text, vars) {
    const out = (lang === 'ta' && TA[text]) || text;
    return vars ? out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : out;
}


/**
 * Marks an English string that is shown later through t() / say / setCue (cue tables, defaults),
 * so scripts/i18n-strings.mjs finds it. Returns it unchanged.
 */
export const tx = (text) => text;