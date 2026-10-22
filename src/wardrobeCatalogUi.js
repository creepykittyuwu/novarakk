import {
    catalogUrls,
    catalogResolveType,
    parseCatalogData,
    filterCatalog,
} from './wardrobeCatalog.js';

const SW_CATALOG_CACHE_PREFIX = 'sw_catalog_cache_v1:';
const SW_CATALOG_CACHE_TTL_MS = 10 * 60 * 1000;
const SW_CATALOG_PAGE_SIZE = 40;

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

function readCache(dataUrl) {
    try {
        const parsed = JSON.parse(localStorage.getItem(SW_CATALOG_CACHE_PREFIX + dataUrl) || 'null');
        return parsed && parsed.data && typeof parsed.data === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

function writeCache(dataUrl, data, meta = {}) {
    try {
        localStorage.setItem(SW_CATALOG_CACHE_PREFIX + dataUrl, JSON.stringify({
            data, etag: meta.etag || '', lastModified: meta.lastModified || '', ts: Date.now(),
        }));
    } catch {
        // localStorage may be full or unavailable in embedded WebViews.
    }
}

async function fetchCatalog(dataUrl, cached = null, force = false) {
    const headers = {};
    if (!force && cached?.etag) headers['If-None-Match'] = cached.etag;
    if (!force && cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified;
    const response = await fetch(dataUrl, { headers, cache: 'no-cache' });
    if (response.status === 304 && cached) return { data: cached.data, notModified: true };
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    writeCache(dataUrl, data, {
        etag: response.headers.get('ETag') || '',
        lastModified: response.headers.get('Last-Modified') || '',
    });
    return { data, notModified: false };
}

export async function fetchCatalogImageBlob(url) {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.blob();
}

export function openWardrobeCatalog(adapters) {
    const { url, targetLabel, getTypes, addedIds, pick, quickAdd, syncTypes } = adapters;
    const { site, data: dataUrl } = catalogUrls(url);
    document.getElementById('sw-catalog-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'sw-catalog-overlay';
    overlay.className = 'iig-style-overlay sw-catalog-overlay';
    overlay.innerHTML = `
        <div class="iig-style-modal sw-catalog-modal">
            <div class="iig-style-modal-head">
                <span class="iig-style-modal-title"><i class="fa-solid fa-globe"></i> Каталог образов <span class="sw-catalog-target">→ ${esc(targetLabel)}</span></span>
                <a class="iig-style-source-link" href="${esc(site)}" target="_blank" rel="noopener" title="Открыть сайт"><i class="fa-solid fa-arrow-up-right-from-square"></i> Сайт</a>
                <div class="iig-style-refresh menu_button sw-catalog-sync" title="Добавить все категории сайта как типы одежды"><i class="fa-solid fa-tags"></i></div>
                <div class="iig-style-refresh menu_button sw-catalog-refresh" title="Обновить каталог"><i class="fa-solid fa-rotate"></i></div>
                <div class="iig-style-refresh menu_button sw-catalog-close" title="Закрыть"><i class="fa-solid fa-xmark"></i></div>
            </div>
            <div class="sw-catalog-filters">
                <div class="iig-style-filters sw-catalog-chars"></div>
                <div class="iig-style-filters sw-catalog-keys"></div>
            </div>
            <div class="iig-style-body sw-catalog-body"><div class="iig-style-loading">Загрузка каталога…</div></div>
        </div>`;
    document.body.appendChild(overlay);

    const modal = overlay.querySelector('.sw-catalog-modal');
    const bodyEl = overlay.querySelector('.sw-catalog-body');
    const charsEl = overlay.querySelector('.sw-catalog-chars');
    const keysEl = overlay.querySelector('.sw-catalog-keys');
    const state = { charId: '', key: '', favOnly: false, limit: SW_CATALOG_PAGE_SIZE };
    let catalog = { chars: [], keys: [], outfits: [] };

    const onKey = (event) => {
        if (event.key !== 'Escape' || document.getElementById('sw-form-overlay')) return;
        event.stopImmediatePropagation();
        close();
    };
    function close() {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
    }
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    for (const type of ['click', 'mousedown', 'pointerdown', 'pointerup']) {
        modal.addEventListener(type, event => event.stopPropagation());
    }
    for (const type of ['touchstart', 'touchend']) {
        modal.addEventListener(type, event => event.stopPropagation(), { passive: true });
    }
    overlay.querySelector('.sw-catalog-close').addEventListener('click', close);

    const typeView = (key) => {
        const { suggestion, existing } = catalogResolveType(key, getTypes());
        if (existing) return { icon: existing.icon || 'fa-tag', label: existing.label, known: true };
        return { icon: suggestion.icon || 'fa-tag', label: suggestion.label || key, known: false };
    };

    const scoped = () => filterCatalog(catalog.outfits, { charId: state.charId, favOnly: state.favOnly });

    const renderChars = () => {
        const count = id => catalog.outfits.filter(o => !id || o.charId === id).length;
        const chars = catalog.chars.length > 1 ? [{ id: '', name: 'Все персонажи' }, ...catalog.chars] : [];
        const favCount = catalog.outfits.filter(o => o.fav).length;
        if (!favCount) state.favOnly = false;
        charsEl.hidden = !favCount && !chars.length;
        charsEl.innerHTML = (favCount ? `<button type="button" class="iig-style-chip ${state.favOnly ? 'active' : ''}" data-fav title="Только любимые на сайте"><i class="fa-solid fa-heart"></i> ${favCount}</button>` : '')
            + chars.map(c => `
            <button type="button" class="iig-style-chip ${state.charId === c.id ? 'active' : ''}" data-char="${esc(c.id)}">
                ${c.img ? `<img class="sw-catalog-avatar" src="${esc(c.img)}" alt="" loading="lazy">` : (c.id ? '' : '<i class="fa-solid fa-users"></i>')}
                ${esc(c.name)} <span class="sw-chip-count">${count(c.id)}</span>
            </button>`).join('');
        charsEl.querySelector('[data-fav]')?.addEventListener('click', () => {
            state.favOnly = !state.favOnly;
            state.limit = SW_CATALOG_PAGE_SIZE;
            renderAll();
        });
        for (const button of charsEl.querySelectorAll('[data-char]')) {
            button.addEventListener('click', () => {
                state.charId = button.dataset.char || '';
                state.key = '';
                state.limit = SW_CATALOG_PAGE_SIZE;
                renderAll();
            });
        }
    };

    const renderKeys = () => {
        const base = scoped();
        const counts = new Map();
        for (const o of base) counts.set(o.key, (counts.get(o.key) || 0) + 1);
        if (state.key && !counts.has(state.key)) state.key = '';
        const keys = catalog.keys.filter(key => counts.has(key));
        keysEl.innerHTML = `<button type="button" class="iig-style-chip ${state.key ? '' : 'active'}" data-key="">Все типы <span class="sw-chip-count">${base.length}</span></button>`
            + keys.map(key => {
                const view = typeView(key);
                return `<button type="button" class="iig-style-chip ${state.key === key ? 'active' : ''} ${view.known ? '' : 'sw-catalog-new-type'}" data-key="${esc(key)}" title="${view.known ? `Тип гардероба: ${esc(view.label)}` : 'Такого типа ещё нет — создастся при добавлении'}">
                    <i class="fa-solid ${esc(view.icon)}"></i> ${esc(key)} <span class="sw-chip-count">${counts.get(key)}</span>
                </button>`;
            }).join('');
        for (const button of keysEl.querySelectorAll('[data-key]')) {
            button.addEventListener('click', () => {
                state.key = button.dataset.key || '';
                state.limit = SW_CATALOG_PAGE_SIZE;
                renderKeys();
                renderGrid();
            });
        }
    };

    const cardHtml = (o, added) => {
        const view = typeView(o.key);
        const isAdded = added.has(o.id);
        return `<article class="sw-catalog-card ${isAdded ? 'sw-catalog-added' : ''}" data-id="${esc(o.id)}">
            <button type="button" class="sw-catalog-preview" data-act="pick" title="Открыть в форме: примерка, правка названия и типа">
                <img src="${esc(o.img)}" alt="" loading="lazy" decoding="async">
                ${o.fav ? '<span class="sw-catalog-fav-badge"><i class="fa-solid fa-heart"></i></span>' : ''}
            </button>
            <div class="sw-catalog-info">
                <span class="sw-catalog-name" title="${esc(o.name)}">${esc(o.name)}</span>
                <span class="sw-catalog-meta"><i class="fa-solid ${esc(view.icon)}"></i> ${esc(view.label)}${o.charName && !state.charId ? ` · ${esc(o.charName)}` : ''}</span>
                ${o.desc ? `<span class="sw-catalog-desc">${esc(o.desc)}</span>` : ''}
            </div>
            <div class="sw-catalog-actions">
                <button type="button" class="menu_button sw-catalog-quick" data-act="quick" title="${isAdded ? 'Уже в гардеробе — добавить ещё раз' : 'Сразу добавить в гардероб'}">
                    <i class="fa-solid ${isAdded ? 'fa-check' : 'fa-plus'}"></i>
                </button>
            </div>
        </article>`;
    };

    const renderGrid = () => {
        const visible = filterCatalog(catalog.outfits, state);
        if (!visible.length) {
            bodyEl.innerHTML = `<div class="iig-style-loading">${catalog.outfits.length ? 'Ничего не нашлось' : 'Каталог пуст'}</div>`;
            return;
        }
        bodyEl.innerHTML = '<div class="sw-catalog-grid"></div><button type="button" class="menu_button sw-catalog-more" hidden></button>';
        const grid = bodyEl.querySelector('.sw-catalog-grid');
        const more = bodyEl.querySelector('.sw-catalog-more');
        let shown = 0;
        const appendUpTo = (limit) => {
            const added = addedIds();
            const batch = visible.slice(shown, limit);
            grid.insertAdjacentHTML('beforeend', batch.map(o => cardHtml(o, added)).join(''));
            for (const card of [...grid.children].slice(shown)) bindCard(card);
            shown += batch.length;
            const rest = visible.length - shown;
            more.hidden = rest <= 0;
            more.textContent = `Ещё ${Math.min(rest, SW_CATALOG_PAGE_SIZE)} из ${rest}`;
        };
        more.addEventListener('click', () => {
            state.limit = shown + SW_CATALOG_PAGE_SIZE;
            appendUpTo(state.limit);
        });
        appendUpTo(state.limit);
    };

    function bindCard(card) {
        const outfit = catalog.outfits.find(o => o.id === card.dataset.id);
        if (!outfit) return;
        card.querySelector('[data-act="pick"]').addEventListener('click', () => pick(outfit));
        const quick = card.querySelector('[data-act="quick"]');
        quick.addEventListener('click', async () => {
            if (quick.disabled) return;
            quick.disabled = true;
            const icon = quick.querySelector('i');
            icon.className = 'fa-solid fa-spinner fa-spin';
            try {
                await quickAdd(outfit);
                card.classList.add('sw-catalog-added');
                icon.className = 'fa-solid fa-check';
                renderKeys();
            } catch (error) {
                icon.className = 'fa-solid fa-plus';
                toastr.error('Не удалось добавить: ' + String(error.message || error), 'Каталог образов');
            } finally {
                quick.disabled = false;
            }
        });
    }

    function renderAll() {
        renderChars();
        renderKeys();
        renderGrid();
    }

    const show = (data) => {
        catalog = parseCatalogData(data, site);
        if (state.charId && !catalog.chars.some(c => c.id === state.charId)) state.charId = '';
        renderAll();
    };

    overlay.querySelector('.sw-catalog-sync').addEventListener('click', () => {
        const keys = [...new Set(scoped().map(o => o.key).filter(Boolean))];
        const created = syncTypes(keys);
        renderAll();
        toastr.info(created ? `Создано типов: ${created}` : 'Все категории уже есть среди типов', 'Каталог образов', { timeOut: 2500 });
    });

    const refreshButton = overlay.querySelector('.sw-catalog-refresh');
    refreshButton.addEventListener('click', async () => {
        if (refreshButton.classList.contains('is-loading')) return;
        refreshButton.classList.add('is-loading');
        const icon = refreshButton.querySelector('i');
        icon.className = 'fa-solid fa-spinner iig-spin-anim';
        try {
            const result = await fetchCatalog(dataUrl, null, true);
            show(result.data);
            toastr.success('Каталог обновлён', 'Каталог образов', { timeOut: 2000 });
        } catch (error) {
            toastr.error('Не удалось обновить: ' + String(error.message || error), 'Каталог образов');
        } finally {
            icon.className = 'fa-solid fa-rotate';
            refreshButton.classList.remove('is-loading');
        }
    });

    const cached = readCache(dataUrl);
    if (cached) {
        show(cached.data);
        if (Date.now() - (cached.ts || 0) > SW_CATALOG_CACHE_TTL_MS) {
            fetchCatalog(dataUrl, cached)
                .then(result => { if (overlay.isConnected && !result.notModified) show(result.data); })
                .catch(() => {});
        }
    } else {
        fetchCatalog(dataUrl, null, true)
            .then(result => { if (overlay.isConnected) show(result.data); })
            .catch(error => {
                if (!overlay.isConnected) return;
                bodyEl.innerHTML = `<p class="hint" style="padding: 16px;">Не удалось загрузить каталог (${esc(dataUrl)}): ${esc(error.message || error)}</p>`;
            });
    }

    return { close, refresh: renderAll };
}
