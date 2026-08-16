// scripts/extractors/generic.js
// Layer ekstraksi GENERIK — tidak spesifik ke satu toko manapun.
// Dipakai sebagai:
//   1) extractor utama untuk situs yang TIDAK dikenal (lihat registry.js)
//   2) fallback tambahan yang dipanggil extractor per-situs untuk field
//      yang belum terisi setelah logika khusus situs itu jalan
//
// Confidence semua method di sini sengaja dibuat LEBIH RENDAH (10-50)
// daripada method spesifik situs (80-90), jadi setData() otomatis
// memprioritaskan hasil situs-spesifik kalau ada.

const NOISE_SELECTORS = [
    'footer', 'header', '.related-products', '.product-related',
    '.reviews', '#reviews', '.diskusi', '#diskusi', '.sjns',
    '.similar-products', '.recommended', '[class*="footer"]',
    '[class*="header"]', '[class*="related"]', '[class*="recommend"]',
    '[id*="footer"]', '[id*="header"]', '[id*="related"]',
    '.tab-pane', '#tab_deskripsi', '#ulasan', '#diskusi'
];

import { BaseExtractor } from './base.js';

export class GenericExtractor extends BaseExtractor {
    isBookPage(threshold = 1) {
        const signals = [
            // URL pattern
            /\/(buku|book|product|item|detail)\//i.test(location.pathname),
            // Meta indicators
            document.querySelector('meta[property="og:type"]')?.content === 'book',
            !!document.querySelector('meta[property="books:author"], meta[property="book:author"]'),
            // JSON-LD Book type
            !!document.querySelector('script[type="application/ld+json"]')?.textContent?.includes('"@type":"Book"'),
            // Content indicators (light check)
            document.body.textContent.match(/\b(isbn|penulis|penerbit|jumlah halaman|tebal buku|author|publisher|pages)\b/i)
        ];
        const score = signals.filter(Boolean).length;
        console.log(`[Book Scraper Debug] isBookPage score: ${score}/${signals.length}`);
        return score >= threshold;
    }

    async waitForPageSignals(timeoutMs = 5000) {
        // If document is still loading, wait for it to be interactive
        if (document.readyState !== 'complete' && document.readyState !== 'interactive') {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
        }

        return new Promise(resolve => {
            const deadline = Date.now() + timeoutMs;
            let observer;

            const checkSignals = () => {
                const titleSignal = document.querySelector('h1, h2.title, h3.title, h4.title, [class*="product-title"], [class*="product_name"]');
                const priceSignal = document.querySelector(this.config.PRICE_SELECTORS.join(', '));
                const specSignal = document.querySelector('table, dl, [class*="spec"], [class*="detail"]');
                const authorSignal = document.body.textContent.match(/\b(penulis|author)\b/i);

                if (titleSignal && (priceSignal || specSignal || authorSignal)) {
                    if (observer) observer.disconnect();
                    clearTimeout(timeoutHandle);
                    resolve();
                    return true;
                }
                return false;
            };

            // Set a timeout to ensure we don't wait forever
            const timeoutHandle = setTimeout(() => {
                if (observer) observer.disconnect();
                console.warn('[Book Scraper] waitForPageSignals timed out.');
                resolve();
            }, timeoutMs);

            // Initial check
            if (checkSignals()) return;

            // If initial check fails, use MutationObserver to wait for DOM changes
            observer = new MutationObserver(() => {
                if (checkSignals()) {
                    // observer is disconnected inside checkSignals
                } else if (Date.now() >= deadline) {
                    observer.disconnect();
                    clearTimeout(timeoutHandle);
                    console.warn('[Book Scraper] waitForPageSignals timed out after mutation checks.');
                    resolve();
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        });
    }

    _getProductArea() {
        if (this._productArea) return this._productArea;
        const selectors = [
            '.product-single-item', '.product-detail', '.product-info',
            '.product-summary', '.product-view', '[class*="product-single"]',
            '[class*="product-detail"]', '[class*="product-info"]',
            '[class*="product-summary"]', 'main[role="main"]', 'main',
            'article', '#content', '.content', '.container'
        ];
        for (const s of selectors) {
            const el = document.querySelector(s);
            if (el) { this._productArea = el; return el; }
        }
        this._productArea = document.body;
        return document.body;
    }

    _isNoise(el) {
        if (!el) return true;
        return el.closest(NOISE_SELECTORS.join(', ')) !== null;
    }

    extractFromJsonLd() {
        try {
            const scripts = document.querySelectorAll('script[type="application/ld+json"]');
            for (const script of scripts) {
                if (!script.textContent) continue;
                const json = JSON.parse(script.textContent);
                const items = Array.isArray(json) ? json : [json];

                for (const item of items) {
                    const nodesToSearch = [
                        ...(item['@graph'] || [item]),
                        item.mainEntity,
                        ...(item.workExample || []),
                        ...(item.exampleOfWork || []),
                        ...(item.itemListElement || []),
                        item.hasOfferCatalog
                    ].filter(Boolean);

                    for (const node of nodesToSearch) {
                        this._processJsonLdNode(node);
                    }
                }
            }
        } catch (e) {
            console.warn('[Book Scraper] Failed to parse JSON-LD:', e);
        }
    }

    _isJsonLdType(node, ...types) {
        if (!node || !node['@type']) return false;
        const nodeType = node['@type'];
        const typeArray = Array.isArray(nodeType) ? nodeType : [nodeType];
        return typeArray.some(t => {
            const cleanType = String(t).replace(/^(schema:|https?:\/\/schema\.org\/)/, '');
            return types.includes(cleanType);
        });
    }

    _processJsonLdNode(node) {
        if (!this._isJsonLdType(node, 'Book', 'Product', 'CreativeWork')) return;

        if (node.name) this.setData('title', this.utils.cleanTitle(node.name), 45);

        if (node.author) {
            let authorName = '';
            if (Array.isArray(node.author)) {
                authorName = node.author.map(a => a.name || a).filter(Boolean).join(', ');
            } else if (typeof node.author === 'object' && node.author.name) {
                authorName = node.author.name;
            } else if (typeof node.author === 'string') {
                authorName = node.author;
            }
            if (authorName) this.setData('author', this.utils.cleanAuthor(authorName, this.config.KEYWORDS.author), 40);
        }

        if (node.datePublished) {
            this.setData('publicationYear', this.utils.normalizeYear(node.datePublished), 40);
        }

        if (node.numberOfPages) {
            this.setData('pages', this.utils.extractNumber(String(node.numberOfPages)), 40);
        }

        if (node.isbn) {
            this.setData('isbn', String(node.isbn).replace(/-/g, ''), 50);
        }

        let offer = null;
        if (node.offers) {
            offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
        } else if (node.aggregateOffer) {
            offer = Array.isArray(node.aggregateOffer.offers) ? node.aggregateOffer.offers[0] : node.aggregateOffer;
        }

        if (offer) {
            const price = this.utils.normalizePrice(String(offer.price || offer.lowPrice));
            if (price) this.setData('price', price, 40);
        } else if (node.price) { // Fallback to root price
            const price = this.utils.normalizePrice(String(node.price));
            if (price) this.setData('price', price, 35);
        }
    }

    extractFromOpenGraph() {
        try {
            const getOg = (prop) => document.querySelector(`meta[property="og:${prop}"]`)?.content;
            
            const title = getOg('title');
            if (title) this.setData('title', this.utils.cleanTitle(title), 50);

            const author = getOg('book:author') || getOg('article:author');
            if (author) this.setData('author', this.utils.cleanAuthor(author, this.config.KEYWORDS.author), 50);

            const price = this.utils.normalizePrice(getOg('price:amount') || getOg('product:price:amount'));
            if (price) this.setData('price', price, 45);

            const isbn = getOg('book:isbn');
            if (isbn) this.setData('isbn', isbn.replace(/-/g, ''), 55);

            const releaseDate = getOg('book:release_date') || getOg('article:published_time');
            if (releaseDate) this.setData('publicationYear', this.utils.normalizeYear(releaseDate), 50);

        } catch (e) {
            console.warn('[Book Scraper] Failed during Open Graph extraction:', e);
        }
    }

    extractFromMeta() {
        try {
            const meta = (prop) => document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`)?.content;

            // Author
            const authorMeta = meta('books:author') || meta('book:author') || meta('author');
            if (authorMeta) this.setData('author', this.utils.cleanAuthor(authorMeta, this.config.KEYWORDS.author), 35);

            // Price
            const price = this.utils.normalizePrice(meta('product:price:amount') || meta('price'));
            if (price) this.setData('price', price, 30);

            // Pages
            const pages = meta('book:page_count') || meta('books:page_count');
            if (pages) this.setData('pages', this.utils.extractNumber(pages), 35);

            // ISBN
            const isbn = meta('book:isbn') || meta('books:isbn') || meta('isbn');
            if (isbn) this.setData('isbn', isbn.replace(/-/g, ''), 40);

            // Publication Year
            const pubYear = meta('book:release_date') || meta('books:release_date') || meta('datePublished');
            if (pubYear) this.setData('publicationYear', this.utils.normalizeYear(pubYear), 35);

        } catch (e) {
            console.warn('[Book Scraper] Failed during Meta Tag extraction:', e);
        }
    }

    extractFromSemanticHtml() {
        try {
            const prop = (name) => document.querySelector(`[itemprop="${name}"]`)?.textContent;
            this.setData('title', this.utils.cleanTitle(prop('name')), 25);
            this.setData('author', this.utils.cleanAuthor(prop('author'), this.config.KEYWORDS.author), 25);
            this.setData('publicationYear', this.utils.normalizeYear(prop('datePublished')), 25);
            this.setData('pages', this.utils.extractNumber(prop('numberOfPages')), 25);
            const price = this.utils.normalizePrice(prop('price'));
            if (price) this.setData('price', price, 25);
        } catch (e) {
            console.warn('[Book Scraper] Failed during Semantic HTML extraction:', e);
        }
    }

    extractFromTableSpecs() {
        try {
            const area = this._getProductArea();
            
            // --- POLA A & B: Semua Tabel di Product Area ---
            const tables = area.querySelectorAll('table');
            for (const table of tables) {
                if (this._isNoise(table)) continue;
                const rows = table.querySelectorAll('tr');
                if (rows.length < 2) continue;
                
                const firstRowCells = rows[0].querySelectorAll('td, th');
                
                if (firstRowCells.length >= 2) {
                    this._parseTableTwoColumn(rows);   // Pola A
                } else if (firstRowCells.length === 1) {
                    this._parseTableTwoRow(rows);      // Pola B (Andi Publisher)
                }
            }
            
            // --- POLA C: Definition Lists ---
            const dls = area.querySelectorAll('dl');
            for (const dl of dls) {
                if (this._isNoise(dl)) continue;
                const dts = dl.querySelectorAll('dt');
                for (const dt of dts) {
                    const dd = dt.nextElementSibling;
                    if (!dd || dd.tagName !== 'DD') continue;
                    this._mapLabelValue(dt.textContent, dd.textContent, 65);
                }
            }
            
            // --- POLA D: WooCommerce short-description <br> separated ---
            const shortDesc = area.querySelector('.product-short-description, .short-description');
            if (shortDesc) {
                const html = shortDesc.innerHTML;
                const lines = html.split(/<br\s*\/?>/i).map(l => l.trim()).filter(Boolean);
                for (const line of lines) {
                    const div = document.createElement('div');
                    div.innerHTML = line;
                    const text = div.textContent;
                    const parts = text.split(/:\s*/);
                    if (parts.length >= 2) {
                        const label = parts[0].trim();
                        const value = parts.slice(1).join(':').trim();
                        this._mapLabelValue(label, value, 60);
                    }
                }
            }
        } catch (e) {
            console.warn('[Book Scraper] Table extraction failed:', e);
        }
    }

    _parseTableTwoColumn(rows) {
        for (const row of rows) {
            const cells = row.querySelectorAll('td, th');
            if (cells.length < 2) continue;
            const label = cells[0].textContent.trim();
            const value = cells[1].textContent.trim();
            if (label && value) this._mapLabelValue(label, value, 70);
        }
    }

    _parseTableTwoRow(rows) {
        for (let i = 0; i < rows.length - 1; i += 2) {
            const labelCell = rows[i].querySelector('td, th');
            const valueCell = rows[i + 1].querySelector('td, th');
            if (!labelCell || !valueCell) continue;
            
            const labelText = labelCell.textContent.trim();
            const valueText = valueCell.textContent.trim();
            
            // Validasi: label pendek, value ada isi
            if (labelText.length < 40 && valueText.length > 0 && valueText.length < 500) {
                const hasBold = labelCell.querySelector('b, strong') !== null;
                this._mapLabelValue(labelText, valueText, hasBold ? 70 : 60);
            }
        }
    }

    _mapLabelValue(label, value, confidence) {
        const l = label.toLowerCase();
        const v = value.trim();
        if (!v) return;
        
        if (this.config.KEYWORDS.author.some(kw => l.includes(kw))) {
            this.setData('author', this.utils.cleanAuthor(v, this.config.KEYWORDS.author), confidence);
        } else if (this.config.KEYWORDS.publishedYear.some(kw => l.includes(kw))) {
            this.setData('publicationYear', this.utils.normalizeYear(v), confidence);
        } else if (this.config.KEYWORDS.isbn.some(kw => l.includes(kw))) {
            this.setData('isbn', v.replace(/-/g, ''), confidence);
        } else if (this.config.KEYWORDS.pages.some(kw => l.includes(kw))) {
            this.setData('pages', this.utils.extractNumber(v), confidence);
        } else if (['penerbit', 'publisher'].some(kw => l.includes(kw))) {
            this.setData('publisher', v, confidence - 5);
        }
    }

    extractPriceIndonesian() {
        try {
            if (this.confidence.price > 50) return;
            
            const area = this._getProductArea();
            const candidates = [];
            const seen = new Set();
            
            // Strategy 1: TreeWalker semua text node di product area
            const walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while (node = walker.nextNode()) {
                const parent = node.parentElement;
                if (!parent || this._isNoise(parent)) continue;
                
                const style = window.getComputedStyle(parent);
                if (style.display === 'none' || style.visibility === 'hidden') continue;
                
                const text = node.textContent;
                // Match: Rp 50.000 | Rp. 50.000 | Rp50.000
                const matches = text.match(/Rp\.?\s*[\d.,]+/gi);
                if (!matches) continue;
                
                for (const m of matches) {
                    const price = this.utils.normalizePrice(m);
                    if (!price || price < 1000 || price > 100000000) continue;
                    
                    const isStrike = !!parent.closest('s, del, strike') ||
                        window.getComputedStyle(parent).textDecoration.includes('line-through');
                    
                    const key = `${price}-${isStrike}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    
                    candidates.push({ price, isStrike, el: parent });
                }
            }
            
            // Strategy 2: data-price attribute
            area.querySelectorAll('[data-price]').forEach(el => {
                if (this._isNoise(el)) return;
                const price = this.utils.normalizePrice(el.getAttribute('data-price'));
                if (price && price >= 1000) {
                    candidates.push({ price, isStrike: false, el, fromAttr: true });
                }
            });
            
            if (candidates.length === 0) return;
            
            const normals = candidates.filter(c => !c.isStrike).map(c => c.price);
            const strikes = candidates.filter(c => c.isStrike).map(c => c.price);
            
            // Pilih harga non-strike terendah (asumsi: diskon = harga lebih rendah)
            if (normals.length > 0) {
                const bestPrice = Math.min(...normals);
                this.setData('price', bestPrice, 45);
                this.setPriceVariant?.('discountPrice', bestPrice, 45);
                
                if (strikes.length > 0) {
                    const origPrice = Math.max(...strikes);
                    if (origPrice > bestPrice) {
                        this.setData('originalPrice', origPrice, 40);
                        this.setPriceVariant?.('originalPrice', origPrice, 40);
                    }
                }
            } else if (strikes.length > 0) {
                // Fallback: hanya ada harga coret (jarang)
                this.setData('price', Math.min(...strikes), 35);
            }
        } catch (e) {
            console.warn('[Book Scraper] Price extraction failed:', e);
        }
    }

    extractFromLabels() {
        try {
            const area = this._getProductArea();
            
            // HANYA scan elemen structural di product area
            // JANGAN scan 'p', 'div' bebas, atau 'body *'
            const elements = area.querySelectorAll(
                'td, th, dt, dd, label, li, ' +
                'span[class*="spec"] *, span[class*="detail"] *, ' +
                'div[class*="spec"] *, div[class*="detail"] *, ' +
                'div[class*="info"] *, div[class*="meta"] *'
            );
            
            for (const node of elements) {
                if (this._isNoise(node)) continue;
                if (node.children.length > 3) continue;
                
                const text = this.utils.cleanText(node.textContent);
                if (text.length > 80 || text.length < 3) continue;
                
                for (const field in this.config.KEYWORDS) {
                    const kws = this.config.KEYWORDS[field];
                    const matched = kws.find(kw => {
                        // Hanya match di awal text, bukan di tengah paragraf
                        const re = new RegExp(`^\\s*${kw}\\s*[:\\-]\\s*(.+)$`, 'i');
                        return re.test(text);
                    });
                    
                    if (!matched) continue;
                    
                    let value = '';
                    let conf = 15;
                    
                    // Pattern: "Penulis: John" dalam 1 elemen
                    const m = text.match(new RegExp(`${matched}\\s*[:\\-]\\s*(.+)$`, 'i'));
                    if (m) {
                        value = m[1].trim();
                        conf = 40;
                    }
                    
                    // Pattern: sibling
                    if (!value && node.nextElementSibling) {
                        const next = node.nextElementSibling;
                        if (['DD','TD','SPAN','DIV','STRONG','B'].includes(next.tagName)) {
                            value = next.textContent.trim();
                            conf = 50;
                        }
                    }
                    
                    // Pattern: table row
                    if (!value && ['TD','TH'].includes(node.tagName)) {
                        const tr = node.closest('tr');
                        if (tr) {
                            const nextTr = tr.nextElementSibling;
                            if (nextTr && nextTr.querySelector('td')) {
                                value = nextTr.querySelector('td').textContent.trim();
                                conf = 65;
                            }
                            // Atau next sibling cell
                            const nextTd = node.nextElementSibling;
                            if (!value && nextTd && nextTd.tagName === 'TD') {
                                value = nextTd.textContent.trim();
                                conf = 60;
                            }
                        }
                    }
                    
                    if (!value || value.length > 300) continue;
                    
                    switch(field) {
                        case 'author':
                            this.setData('author', this.utils.cleanAuthor(value, kws), conf);
                            break;
                        case 'publicationYear':
                            this.setData('publicationYear', this.utils.normalizeYear(value), conf);
                            break;
                        case 'pages':
                            this.setData('pages', this.utils.extractNumber(value), conf);
                            break;
                        case 'isbn':
                            this.setData('isbn', value.replace(/-/g, ''), conf);
                            break;
                        case 'price':
                            const p = this.utils.normalizePrice(value);
                            if (p) this.setData('price', p, conf);
                            break;
                    }
                }
            }
        } catch (e) {
            console.warn('[Book Scraper] Label extraction failed:', e);
        }
    }

    extractFromVisibleText() {
        try {
            // Point 4c: Defensive checks
            if (typeof this.getVisibleText !== 'function' || typeof this.getPriceValue !== 'function') {
                return;
            }

            const area = this._getProductArea();

            // Threshold tinggi agar selalu override
            if (this.confidence.title < 60) {
                // Cari heading yang paling spesifik
                const headingSelectors = [
                    'h1.title', 'h2.title', 'h3.title', 'h4.title',
                    'h1.product-title', 'h2.product-title', 'h3.product-title',
                    'h1.entry-title', 'h1.product_title', 'h1.product-name',
                    '[class*="product-title"]', '[class*="product_name"]',
                    '[class*="productTitle"]', '[data-testid="productDetailTitle"]'
                ];
                
                for (const sel of headingSelectors) {
                    const el = area.querySelector(sel);
                    if (!el || this._isNoise(el)) continue;
                    const text = this.utils.cleanTitle(el.textContent);
                    // Validasi: bukan kata umum, panjang masuk akal
                    if (text.length >= 8 && text.length <= 200 &&
                        !/^(home|product|detail|item|buku|book|shop|store|produk)$/i.test(text)) {
                        this.setData('title', text, 60);
                        break;
                    }
                }
                
                // Fallback: h1/h2 pertama di product area yang panjangnya OK
                if (this.confidence.title < 60) {
                    const headings = area.querySelectorAll('h1, h2');
                    for (const h of headings) {
                        if (this._isNoise(h)) continue;
                        const text = this.utils.cleanTitle(h.textContent);
                        if (text.length >= 10 && text.length <= 200 &&
                            !/^(home|product|detail|shop)$/i.test(text)) {
                            this.setData('title', text, 55);
                            break;
                        }
                    }
                }
            }

            if (this.confidence.author < 10) {
                const authorText = this.getVisibleText('[data-testid="productDetailAuthor"]', 'author');
                if (authorText) this.setData('author', authorText, 10);
            }

            if (this.confidence.price < 10) {
                const priceCandidates = [];
                area.querySelectorAll(this.config.PRICE_SELECTORS.join(', ')).forEach(el => {
                    const priceText = el.textContent || el.getAttribute('data-price');
                    const price = this.utils.normalizePrice(priceText);
                    if (price) {
                        const isStrikethrough = window.getComputedStyle(el).textDecoration.includes('line-through') || el.closest('del, s');
                        if (!isStrikethrough) {
                            priceCandidates.push(price);
                        }
                    }
                });

                // Point 4a: Filter prices
                const VALID_PRICE_RANGE = { min: 1000, max: 50000000 };
                const validPrices = priceCandidates.filter(p => p >= VALID_PRICE_RANGE.min && p <= VALID_PRICE_RANGE.max);

                if (validPrices.length > 0) {
                    // Point 4b: Use median strategy
                    validPrices.sort((a, b) => a - b);
                    const median = validPrices[Math.floor(validPrices.length / 2)];
                    this.setData('price', median, 10);
                }
            }
        } catch (e) {
            console.warn('[Book Scraper] Failed during Visible Text extraction:', e);
        }
    }

    extractFromWooCommerce() {
        try {
            // Pola dari deepublish.js & minhaj-pustaka.js
            const specTableContainer = document.querySelector('.woocommerce-product-details__short-description');
            if (specTableContainer) {
                const specTable = specTableContainer.querySelector('table.table-striped');
                if (specTable) {
                    const specData = {};
                    specTable.querySelectorAll('tr').forEach(row => {
                        const cells = row.querySelectorAll('td');
                        if (cells.length >= 2) {
                            const label = this.utils.cleanText(cells[0].textContent).toLowerCase();
                            const value = this.utils.cleanText(cells[1].textContent);
                            specData[label] = value;
                        }
                    });

                    if (specData['penulis']) this.setData('author', this.utils.cleanAuthor(specData['penulis'], this.config.KEYWORDS.author), 70);
                    if (specData['tahun']) this.setData('publicationYear', this.utils.normalizeYear(specData['tahun']), 70);
                    if (specData['halaman']) this.setData('pages', this.utils.extractNumber(specData['halaman']), 70);
                    if (specData['isbn']) this.setData('isbn', specData['isbn'].replace(/-/g, ''), 75);
                    if (specData['penerbit']) this.setData('publisher', specData['penerbit'], 65);
                }
            }

            // Pola dari minhaj-pustaka.js
            const shortDescriptionEl = document.querySelector('.product-short-description p');
            if (shortDescriptionEl) {
                const textContent = shortDescriptionEl.innerHTML;
                const lines = textContent.split(/<br\s*\/?>/i).map(line => line.trim()).filter(Boolean);
                lines.forEach(line => {
                    const parts = line.split(':');
                    if (parts.length >= 2) {
                        const label = this.utils.cleanText(parts[0]).toLowerCase();
                        const value = this.utils.cleanText(parts.slice(1).join(':'));
                        
                        if (this.config.KEYWORDS.author.some(kw => label.includes(kw))) {
                            this.setData('author', this.utils.cleanAuthor(value, this.config.KEYWORDS.author), 70);
                        } else if (this.config.KEYWORDS.publishedYear.some(kw => label.includes(kw))) {
                            this.setData('publicationYear', this.utils.normalizeYear(value), 70);
                        } else if (this.config.KEYWORDS.pages.some(kw => label.includes(kw))) {
                            this.setData('pages', this.utils.extractNumber(value), 70);
                        }
                    }
                });
            }
        } catch (e) {
            console.warn('[Book Scraper] Failed during WooCommerce extraction:', e);
        }
    }

    extractFromNextData() {
        try {
            // Pola dari gramedia.js
            const nextData = this.readNextData();
            if (nextData) {
                const meta = nextData?.props?.pageProps?.productDetailMeta || nextData?.props?.pageProps?.product_meta;
                if (meta) {
                    if ('title' in meta) this.setData('title', this.utils.cleanTitle(meta.title), 65);
                    if ('author' in meta) this.setData('author', this.utils.cleanAuthor(meta.author, this.config.KEYWORDS.author), 65);
                }
            }

            // Cek juga atribut data-testid yang umum
            const titleText = this.getVisibleText('[data-testid="productDetailTitle"]', 'title');
            if (titleText) this.setData('title', titleText, 75);

            const authorText = this.getVisibleText('[data-testid="productDetailAuthor"]', 'author');
            if (authorText) this.setData('author', authorText, 75);

            const priceText = this.getVisibleText('[data-testid="productDetailFinalPrice"]');
            const priceValue = this.getPriceValue(priceText);
            if (priceValue) this.setData('price', priceValue, 75);
            
            // Blok detail Gramedia
            const detailsContainer = document.querySelector('[data-testid="productDetailSpecificationContainer"]');
            if (detailsContainer && !detailsContainer.querySelector('[data-sentry-component="Skeleton"]')) {
                const detailItems = detailsContainer.querySelectorAll('.shrink-0.grow-0.basis-1\\/2');
                const specData = {};
                detailItems.forEach(item => {
                    const labelEl = item.querySelector('div:first-child');
                    const valueEl = item.querySelector('div:last-child');
                    if (labelEl && valueEl) {
                        const label = this.utils.cleanText(labelEl.textContent).toLowerCase();
                        const value = this.utils.cleanText(valueEl.textContent);
                        specData[label] = value;
                    }
                });

                for (const kw of this.config.KEYWORDS.author) {
                    if (specData[kw]) this.setData('author', this.utils.cleanAuthor(specData[kw], this.config.KEYWORDS.author), 80);
                }
                for (const kw of this.config.KEYWORDS.publishedYear) {
                    if (specData[kw]) this.setData('publicationYear', this.utils.normalizeYear(specData[kw]), 80);
                }
                for (const kw of this.config.KEYWORDS.pages) {
                    if (specData[kw]) this.setData('pages', this.utils.extractNumber(specData[kw]), 80);
                }
            }
        } catch (e) {
            console.warn('[Book Scraper] Failed during Next.js data extraction:', e);
        }
    }

    extractFromOpenCart() {
        try {
            // Pola dari anak-hebat.js
            const productInfo = document.querySelector('#product-info');
            if (productInfo) {
                const titleText = this.getVisibleText('#product-info h1', 'title');
                if (titleText) this.setData('title', titleText, 70);

                const authorText = this.getVisibleText('#product-info > div.inner > strong > a', 'author');
                if (authorText) this.setData('author', authorText, 70);

                const priceContainer = document.querySelector('#product-info .price');
                if (priceContainer) {
                    const priceFromContainer = this.getPriceValue(priceContainer.textContent);
                    if (priceFromContainer) this.setData('price', priceFromContainer, 70);
                }
            }

            const detailTable = document.querySelector('#tab-detail table.box-table');
            if (detailTable) {
                const specData = {};
                detailTable.querySelectorAll('tr').forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 2) {
                        const label = this.utils.cleanText(cells[0].textContent).toLowerCase();
                        const value = this.utils.cleanText(cells[1].textContent);
                        specData[label] = value;
                    }
                });
                for (const kw of this.config.KEYWORDS.author) {
                    if (specData[kw]) this.setData('author', this.utils.cleanAuthor(specData[kw], this.config.KEYWORDS.author), 75);
                }
                for (const kw of this.config.KEYWORDS.pages) {
                    if (specData[kw]) this.setData('pages', this.utils.extractNumber(specData[kw]), 75);
                }
            }
        } catch (e) {
            console.warn('[Book Scraper] Failed during OpenCart theme extraction:', e);
        }
    }

    // Dipanggil langsung oleh extractor situs manapun sebagai lapis fallback
    // terakhir, setelah logika khusus situsnya sendiri dijalankan.
    runGenericFallback() {
        // Urutan: Data terstruktur -> Pola platform -> Visual -> Pola umum -> Meta
        this.extractFromJsonLd();           // 1. Paling reliable (JSON-LD)
        this.extractFromNextData();         // 2. Pola Next.js (Gramedia)
        this.extractFromWooCommerce();      // 3. Pola WooCommerce (Deepublish, etc.)
        this.extractFromOpenCart();         // 4. Pola OpenCart (Anak Hebat)
        this.extractFromVisibleText();      // 5. Judul dari Heading (Visual)
        this.extractFromTableSpecs();       // 6. Tabel & DL generik
        this.extractPriceIndonesian();      // 7. Harga generik
        this.extractFromLabels();           // 8. Pola label:value umum
        this.extractFromOpenGraph();        // 9. Fallback ke Open Graph
        this.extractFromMeta();             // 10. Fallback ke Meta Tags
        this.extractFromSemanticHtml();     // 11. Fallback ke Semantic HTML (jarang ada)
    }

    // Dipakai apa adanya untuk situs yang TIDAK dikenal (lihat registry.js)
    async run() {
        // Point 5: Early exit if it's not a book page
        if (!this.isBookPage()) {
            console.log('[Book Scraper] Not a book page, skipping extraction.');
            const result = this.buildResult();
            result.confidence = 0; // Override calculated confidence
            return result;
        }

        await this.waitForPageSignals();
        this.runGenericFallback();
        this.extractPriceVariants();
        this.finalizePriceVariants();
        return this.buildResult();
    }
}
