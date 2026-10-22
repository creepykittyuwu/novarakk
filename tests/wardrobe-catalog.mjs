// Pure catalog parsing/type-mapping tests for the Browse wardrobe catalog.
// Run: node tests/wardrobe-catalog.mjs
import assert from 'node:assert/strict';
import {
    catalogUrls, catalogCategoryKey, catalogTypeSuggestion, catalogResolveType,
    catalogOutfitName, parseCatalogData, filterCatalog, SW_CATALOG_DEFAULT_URL,
} from '../src/wardrobeCatalog.js';

assert.deepEqual(catalogUrls(''), { site: SW_CATALOG_DEFAULT_URL, data: SW_CATALOG_DEFAULT_URL + 'wardrobe.json' });
assert.deepEqual(catalogUrls('example.github.io/w'), { site: 'https://example.github.io/w/', data: 'https://example.github.io/w/wardrobe.json' });
assert.deepEqual(catalogUrls('https://x.io/a/index.html?q=1'), { site: 'https://x.io/a/', data: 'https://x.io/a/wardrobe.json' });
assert.deepEqual(catalogUrls('https://x.io/a/data.json'), { site: 'https://x.io/a/', data: 'https://x.io/a/data.json' });

assert.equal(catalogCategoryKey('Nielle sport', 'Nielle'), 'sport');
assert.equal(catalogCategoryKey('Nielle', 'Nielle'), 'Nielle');
assert.equal(catalogCategoryKey('Middle Eastern', 'Nielle'), 'Middle Eastern');

assert.equal(catalogTypeSuggestion('sport').id, 'sport');
assert.equal(catalogTypeSuggestion('Office').id, 'work');
assert.equal(catalogTypeSuggestion('Sleep').id, 'sleep');
const summer = catalogTypeSuggestion('summer');
assert.deepEqual(summer, { id: 'cat-summer', label: 'Summer', icon: 'fa-sun', builtin: false });
assert.equal(catalogTypeSuggestion('тематическое').id, 'cat-тематическое');
assert.equal(catalogTypeSuggestion('Middle Eastern').icon, 'fa-moon');

const types = [{ id: 'sport', label: 'Спортивное' }, { id: 'x1', label: 'Party' }, { id: 'other', label: 'Другое' }];
assert.equal(catalogResolveType('sport', types).existing.id, 'sport');
assert.equal(catalogResolveType('party', types).existing.id, 'x1');
assert.equal(catalogResolveType('winter', types).existing, null);

assert.equal(catalogOutfitName('Main color: Brown. Outfit: Oversized brown hoodie with a large print, worn over a skirt.'), 'Oversized brown hoodie');
assert.equal(catalogOutfitName('Main color: Red. Outfit: A strapless red satin mini dress, paired with heels.'), 'Strapless red satin mini dress');
assert.equal(catalogOutfitName('', 'summer'), 'summer');

const data = {
    chars: [{ id: 'ch1', name: 'Nielle', img: 'images/ch1.jpg' }, { id: 'ch2', name: 'Zion', img: '' }, { id: 'ch3', name: 'Empty' }],
    cats: [{ id: 'c1', name: 'Nielle sport', char: 'ch1' }, { id: 'c2', name: 'Canon', char: 'ch2' }],
    items: [
        { id: 'i1', cat: 'c1', desc: 'Main color: Grey. Outfit: Grey track jacket with stripes.', img: 'images/i1.jpg', fav: true },
        { id: 'i2', cat: 'c2', desc: 'Outfit: Black leather jacket, jeans.', img: 'images/i2.jpg' },
        { id: 'i3', cat: 'c2', desc: 'no image', img: '' },
    ],
};
const parsed = parseCatalogData(data, 'https://site.io/w/');
assert.equal(parsed.outfits.length, 2);
assert.deepEqual(parsed.chars.map(c => c.name), ['Nielle', 'Zion']);
assert.equal(parsed.chars[0].img, 'https://site.io/w/images/ch1.jpg');
assert.deepEqual(parsed.keys, ['sport', 'Canon']);
assert.equal(parsed.outfits[0].img, 'https://site.io/w/images/i1.jpg');
assert.equal(parsed.outfits[0].name, 'Grey track jacket');
assert.equal(filterCatalog(parsed.outfits, { charId: 'ch2' }).length, 1);
assert.equal(filterCatalog(parsed.outfits, { key: 'sport' })[0].id, 'i1');
assert.equal(filterCatalog(parsed.outfits, { favOnly: true }).length, 1);
assert.equal(filterCatalog(parsed.outfits, { charId: 'ch1', key: 'Canon' }).length, 0);

console.log('wardrobe-catalog: PASS');
