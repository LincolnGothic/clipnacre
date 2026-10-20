// SPDX-License-Identifier: GPL-3.0-or-later
export const DEFAULT_EXPORT_PATTERN = 'ClipNacre {date} {time}';
export const OCR_LANGUAGES = [
    {id: 'eng', label: 'English'}, {id: 'chi_sim', label: '简体中文'},
    {id: 'chi_tra', label: '繁體中文'}, {id: 'jpn', label: '日本語'},
    {id: 'spa', label: 'Español'}, {id: 'fra', label: 'Français'}, {id: 'kor', label: '한국어'},
];
export const MAX_OCR_TEXT_BYTES = 64 * 1024;
export function validateExportPattern(pattern) {
    if (typeof pattern !== 'string' || !pattern.trim() || pattern.length > 120 || /[\\/\r\n\0]/u.test(pattern) ||
        /[{}]/u.test(pattern.replace(/\{(date|time|width|height)\}/gu, '')))
        throw new Error('Invalid export filename');
    const longest = {date: '2000-12-31', time: '23-59-59', width: '8192', height: '8192'};
    const preview = pattern.trim().replace(/\{(date|time|width|height)\}/gu, (_token, name) => longest[name])
        .replace(/\.png$/iu, '') + '.png';
    if (new TextEncoder().encode(preview).length > 255) throw new Error('Export filename too long');
    return pattern.trim();
}
export function exportFilename(pattern, {date, time, width, height}) {
    const values = {date, time, width, height};
    return validateExportPattern(pattern).replace(/\{(date|time|width|height)\}/gu,
        (_token, name) => String(values[name])).replace(/\.png$/iu, '') + '.png';
}
export function ocrLanguageArgs(language, installed) {
    if (!/^[a-zA-Z0-9_]{1,32}$/u.test(language) || !installed.includes(language))
        throw new Error('OCR language unavailable');
    return language !== 'eng' && installed.includes('eng') ? `${language}+eng` : language;
}
