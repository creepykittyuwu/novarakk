/**
 * Каталог образов с внешнего сайта-гардероба (формат creepykittyuwu/wardrobe):
 * wardrobe.json → { chars, cats, items }. Чистая логика без DOM и SillyTavern.
 */

export const SW_CATALOG_DEFAULT_URL = 'https://creepykittyuwu.github.io/wardrobe/';

const SW_CATALOG_ALIASES = {
    casual: ['casual', 'everyday', 'daily', 'повседневное', 'повседневка'],
    formal: ['formal', 'evening', 'gala', 'формальное', 'вечернее'],
    sport: ['sport', 'sports', 'sportswear', 'gym', 'fitness', 'спорт', 'спортивное'],
    sleep: ['sleep', 'sleepwear', 'pajamas', 'pyjamas', 'night', 'nightwear', 'home', 'сон', 'спальное', 'пижамы', 'домашнее'],
    beach: ['beach', 'swim', 'swimwear', 'swimsuit', 'пляж', 'купальник', 'пляж/купальник'],
    work: ['work', 'office', 'business', 'работа', 'офис'],
    outer: ['outer', 'outerwear', 'coat', 'coats', 'верхняя', 'верхняя одежда'],
};

const SW_CATALOG_ICONS = [
    [/summer|лет/i, 'fa-sun'],
    [/winter|зим/i, 'fa-snowflake'],
    [/autumn|fall|осен/i, 'fa-leaf'],
    [/spring|весн/i, 'fa-seedling'],
    [/party|club|вечерин|тусов/i, 'fa-champagne-glasses'],
    [/hallow|хэллоуин|хеллоуин/i, 'fa-ghost'],
    [/fantasy|фэнтези|фентези/i, 'fa-dragon'],
    [/histor|истор/i, 'fa-landmark'],
    [/steampunk|стимпанк/i, 'fa-gears'],
    [/asian|азиат|japan|china|korea/i, 'fa-torii-gate'],
    [/middle\s*east|eastern|восточ|arab/i, 'fa-moon'],
    [/canon|канон/i, 'fa-star'],
    [/them|темат|cosplay|косплей/i, 'fa-masks-theater'],
    [/date|romant|свидан/i, 'fa-heart'],
];

export function catalogUrls(rawUrl) {
    let url = String(rawUrl || '').trim() || SW_CATALOG_DEFAULT_URL;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (/\.json(\?.*)?$/i.test(url)) {
        return { site: url.replace(/[^/]*\.json(\?.*)?$/i, ''), data: url };
    }
    url = url.replace(/[?#].*$/, '').replace(/index\.html?$/i, '');
    if (!url.endsWith('/')) url += '/';
    return { site: url, data: url + 'wardrobe.json' };
}

function slugify(text) {
    return String(text || '').toLocaleLowerCase()
        .replace(/[^a-z0-9а-яё]+/gi, '-')
        .replace(/^-+|-+$/g, '');
}

export function catalogCategoryKey(catName, charName = '') {
    let name = String(catName || '').replace(/\s+/g, ' ').trim();
    const owner = String(charName || '').trim();
    if (owner && name.toLocaleLowerCase().startsWith(owner.toLocaleLowerCase() + ' ')) {
        name = name.slice(owner.length).trim();
    }
    return name || String(catName || '').trim();
}

export function catalogTypeSuggestion(key) {
    const label = String(key || '').trim();
    const norm = label.toLocaleLowerCase();
    for (const [id, words] of Object.entries(SW_CATALOG_ALIASES)) {
        if (words.includes(norm)) return { id, label: null, icon: null, builtin: true };
    }
    const icon = SW_CATALOG_ICONS.find(([re]) => re.test(label))?.[1] || 'fa-tag';
    const pretty = label.charAt(0).toLocaleUpperCase() + label.slice(1);
    return { id: 'cat-' + (slugify(label) || 'misc'), label: pretty.slice(0, 24), icon, builtin: false };
}

export function catalogResolveType(key, types) {
    const list = Array.isArray(types) ? types : [];
    const suggestion = catalogTypeSuggestion(key);
    const norm = String(key || '').trim().toLocaleLowerCase();
    const found = list.find(t => t.id === suggestion.id)
        || list.find(t => String(t.label || '').trim().toLocaleLowerCase() === norm);
    return { suggestion, existing: found || null };
}

export function catalogOutfitName(desc, fallback = '') {
    const text = String(desc || '').replace(/\s+/g, ' ').trim();
    const outfit = text.match(/outfit:\s*([^.]*)/i)?.[1]
        || text.replace(/^main colou?r:[^.]*\.\s*/i, '').replace(/^[^.:,]{1,20}:\s*/, '');
    let name = outfit.split(/,|;|:|\s+(?:with|worn|over|under|and|paired)\s+/i)[0].trim();
    const words = name.split(' ');
    if (words.length > 6) name = words.slice(0, 6).join(' ');
    if (name.length > 48) name = name.slice(0, 48).trim();
    name = name.replace(/^(?:a|an|the)\s+/i, '');
    if (!name) return fallback;
    return name.charAt(0).toLocaleUpperCase() + name.slice(1);
}

export function parseCatalogData(data, siteUrl) {
    const chars = Array.isArray(data?.chars) ? data.chars : [];
    const cats = Array.isArray(data?.cats) ? data.cats : [];
    const items = Array.isArray(data?.items) ? data.items : [];
    const absolute = (path) => {
        if (!path) return '';
        try { return new URL(path, siteUrl).href; } catch { return ''; }
    };
    const charById = new Map(chars.map(c => [c.id, { id: String(c.id), name: String(c.name || '').trim(), img: absolute(c.img) }]));
    const catById = new Map();
    for (const cat of cats) {
        if (!cat?.id) continue;
        const owner = charById.get(cat.char) || null;
        const key = catalogCategoryKey(cat.name, owner?.name);
        catById.set(cat.id, { id: String(cat.id), name: String(cat.name || '').trim(), key, charId: owner?.id || '' });
    }
    const outfits = [];
    for (const item of items) {
        const img = absolute(item?.img);
        if (!item?.id || !img) continue;
        const cat = catById.get(item.cat) || null;
        const desc = String(item.desc || '').replace(/\s+/g, ' ').trim();
        outfits.push({
            id: String(item.id),
            img,
            desc,
            fav: !!item.fav,
            catId: cat?.id || '',
            catName: cat?.name || '',
            key: cat?.key || '',
            charId: cat?.charId || '',
            charName: charById.get(cat?.charId)?.name || '',
            name: catalogOutfitName(desc, cat?.key || 'Образ'),
        });
    }
    const usedChars = new Set(outfits.map(o => o.charId));
    return {
        chars: [...charById.values()].filter(c => usedChars.has(c.id)),
        keys: [...new Set(outfits.map(o => o.key).filter(Boolean))],
        outfits,
    };
}

export function filterCatalog(outfits, { charId = '', key = '', favOnly = false } = {}) {
    return outfits.filter(o => {
        if (charId && o.charId !== charId) return false;
        if (key && o.key !== key) return false;
        if (favOnly && !o.fav) return false;
        return true;
    });
}
