// scripts/extractors/andi.js
// Extractor khusus untuk andipublisher.com.
// Kode ini disalin dari generic.js untuk memastikan stabilitas
// dan tidak terpengaruh oleh perubahan pada extractor generik.

import { BaseExtractor } from './base.js';

export class AndiExtractor extends BaseExtractor {
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

            // Title: clean from suffixes
            let titleMeta = meta('twitter:title') || document.title;
            if (titleMeta) {
                // Split by common delimiters and take the first (usually most important) part
                const titleParts = titleMeta.split(/\s*(\||-|—|:|›)\s*/);
                this.setData('title', this.utils.cleanTitle(titleParts[0]), 35);
            }

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
            // Cari tabel yang mengandung pola label-value per 2 baris (e.g., Andi Publisher)
            // Baris ganjil = <td><b>Label</b></td>
            // Baris genap = <td>Value</td>
            const tables = document.querySelectorAll('table.table-striped, table[class*="spec"], table[class*="detail"]');
            for (const table of tables) {
                const rows = table.querySelectorAll('tr');
                // Pola ini memiliki label di baris i, dan value di baris i+1. Iterasi per 2 baris.
                for (let i = 0; i < rows.length - 1; i += 2) {
                    const labelRow = rows[i];
                    const valueRow = rows[i + 1];

                    const labelElement = labelRow.querySelector('td b, th b');
                    const labelCell = labelRow.querySelector('td, th'); // Original line, for context
                    if (!labelCell || !valueRow) continue;

                    const valueCell = valueRow.querySelector('td'); // Original line, for context
                    if (!valueCell) continue;
                    
                    const labelText = (labelElement || labelCell).textContent.trim().toLowerCase();
                    const valueText = valueCell.textContent.trim();

                    if (!labelText || !valueText) continue;
                    
                    // Map label ke field
                    if (this.config.KEYWORDS.author.some(kw => labelText.includes(kw))) {
                        this.setData('author', this.utils.cleanAuthor(valueText, this.config.KEYWORDS.author), 70);
                    } else if (this.config.KEYWORDS.publishedYear.some(kw => labelText.includes(kw))) {
                        this.setData('publicationYear', this.utils.normalizeYear(valueText), 70);
                    } else if (this.config.KEYWORDS.isbn.some(kw => labelText.includes(kw))) {
                        this.setData('isbn', valueText.replace(/-/g, ''), 75);
                    } else if (this.config.KEYWORDS.pages.some(kw => labelText.includes(kw))) {
                        this.setData('pages', this.utils.extractNumber(valueText), 70);
                    } else if (['penerbit', 'publisher'].some(kw => labelText.includes(kw))) {
                        this.setData('publisher', valueText, 60);
                    }
                }
            }
        } catch (e) {
            console.warn('[Book Scraper] Failed during Table Specs extraction:', e);
        }
    }

    extractPriceIndonesian() {
        try {
            if (this.confidence.price > 50 && this.confidence.originalPrice > 50) return;
            
            const candidates = [];
            const seenPrices = new Set();
            
            const mainProductArea = document.querySelector('.product-single-info, .product-info, .summary.entry-summary, .product-view, [role="main"]');
            const scope = mainProductArea || document.body;

            // Scan container harga
            const priceContainers = scope.querySelectorAll(
                '[class*="harga"], [class*="price"], [id*="harga"], [id*="price"]'
            );
            
            for (const container of priceContainers) {
                // SKIP hidden elements
                const style = window.getComputedStyle(container);
                if (style.display === 'none' || style.visibility === 'hidden') continue;
                
                // Cari semua teks "Rp" dalam container ini
                const walker = document.createTreeWalker(
                    container, NodeFilter.SHOW_TEXT, null, false
                );
                
                let node;
                while (node = walker.nextNode()) {
                    const parentEl = node.parentElement;
                    if (!parentEl) continue;
                    
                    // SKIP jika parent adalah <s>, <del>, atau line-through
                    const parentStyle = window.getComputedStyle(parentEl);
                    const isStrikethrough = 
                        !!parentEl.closest('s, del, strike') ||
                        parentStyle.textDecoration.includes('line-through');
                    
                    const text = node.textContent;
                    const matches = text.match(/Rp\s*[\d.,]+/g);
                    if (!matches) continue;
                    
                    for (const match of matches) {
                        const price = this.utils.normalizePrice(match);
                        if (!price || price < 1000 || price > 50000000) continue;
                        
                        const key = `${price}-${isStrikethrough}`;
                        if (seenPrices.has(key)) continue;
                        seenPrices.add(key);
                        
                        candidates.push({
                            price,
                            isStrikethrough,
                            element: parentEl
                        });
                    }
                }
            }
            
            if (candidates.length === 0) return;
            
            const normalPrices = candidates.filter(c => c.isStrikethrough).map(c => c.price);
            const discountPrices = candidates.filter(c => !c.isStrikethrough).map(c => c.price);
            
            if (discountPrices.length > 0) {
                const bestPrice = Math.min(...discountPrices);
                this.setData('price', bestPrice, 45);
                this.setPriceVariant('discountPrice', bestPrice, 45);
                
                if (normalPrices.length > 0) {
                    const originalPrice = Math.max(...normalPrices, bestPrice);
                    this.setData('originalPrice', originalPrice, 40);
                    this.setPriceVariant('originalPrice', originalPrice, 40);
                }
            } else if (normalPrices.length > 0) {
                const bestPrice = Math.min(...normalPrices);
                this.setData('price', bestPrice, 40);
            }
        } catch (e) {
            console.warn('[Book Scraper] Failed during Indonesian Price extraction:', e);
        }
    }

    extractFromLabels() {
        try {
            // Point 6c: Prioritize relevant containers
            const containers = document.querySelectorAll(
                '[class*="detail" i], [class*="info" i], [class*="spec" i], ' +
                '[class*="meta" i], [class*="attribute" i], [id*="detail" i], ' +
                'table, dl, .product-info, #product-details'
            );

            const elementsToScan = containers.length > 0
                ? Array.from(containers).flatMap(c => Array.from(c.querySelectorAll('p, span, div, td, li, dt, dd, label')))
                : Array.from(document.querySelectorAll('body *:not(script):not(style)')); // Wider fallback

            // Point 6a: Limit elements to process for performance
            const MAX_ELEMENTS = 750;
            const relevantNodes = elementsToScan.slice(0, MAX_ELEMENTS);

            for (const node of relevantNodes) {
                // Early break if we have enough data (Point 6d)
                if (this.confidence.author > 50 && this.confidence.publicationYear > 50 && this.confidence.pages > 50) {
                    break;
                }
                
                // Check only elements with some text content
                if (!node.textContent || node.children.length > 5) continue; // Avoid large container nodes

                const nodeTextContent = this.utils.cleanText(node.textContent);
                if (nodeTextContent.length > 100) continue; // Avoid long paragraphs

                for (const field in this.config.KEYWORDS) {
                    const keywordsForField = this.config.KEYWORDS[field];
                    
                    // Point 1a: Use case-insensitive matching with word boundary
                    const matchedKeyword = keywordsForField.find(kw => {
                        const regex = new RegExp(`\\b${kw}\\b:?`, 'i'); // Optional colon
                        return regex.test(nodeTextContent);
                    });

                    if (matchedKeyword) {
                        let valueText = '';
                        let confidenceScore = 15;

                        // Point 1c: Expanded sibling/parent pattern
                        // Pattern 1: "Label: Value" in the same element
                        const regex = new RegExp(`\\b${matchedKeyword}\\b\\s*:\\s*(.+)`, 'i');
                        const match = nodeTextContent.match(regex);
                        if (match && match[1]) {
                            valueText = match[1].trim();
                            confidenceScore = 40;
                        }

                        // Pattern 2: Label in one element, value in the next
                        if (!valueText && node.nextElementSibling) {
                            const nextEl = node.nextElementSibling;
                            if (['DD', 'TD', 'SPAN', 'DIV', 'P', 'STRONG'].includes(nextEl.tagName)) {
                                valueText = nextEl.textContent.trim();
                                confidenceScore = 50;
                            }
                        }

                        // Pattern 3: Label in <td>, value in next <td>
                        if (!valueText && node.tagName === 'TD' && node.nextElementSibling?.tagName === 'TD') {
                            valueText = node.nextElementSibling.textContent.trim();
                            confidenceScore = 60;
                        }
                        
                        // Pattern 4: Label in <dt>, value in next <dd>
                        if (!valueText && node.tagName === 'DT' && node.nextElementSibling?.tagName === 'DD') {
                            valueText = node.nextElementSibling.textContent.trim();
                            confidenceScore = 65;
                        }

                        // Pattern 5: <td><b>Label</b></td> diikuti <td>Value</td> di TR berikutnya
                        if (!valueText && ['TD', 'TH'].includes(node.tagName)) {
                            const parentTr = node.closest('tr');
                            // Pastikan label adalah satu-satunya sel di barisnya, untuk menghindari salah deteksi
                            if (parentTr && parentTr.cells.length === 1) {
                                const nextTr = parentTr.nextElementSibling;
                                if (nextTr) {
                                    const valueTd = nextTr.querySelector('td');
                                    // Dan baris value juga hanya punya satu sel
                                    if (valueTd && nextTr.cells.length === 1) {
                                        valueText = valueTd.textContent.trim();
                                        confidenceScore = 68;
                                    }
                                }
                            }
                        }

                        if (valueText) {
                            // Point 1d, 1e: Handle all fields
                            switch (field) {
                                case 'title':
                                    // Turunkan confidence label deskripsi jadi 20 (di bawah heading)
                                    this.setData('title', this.utils.cleanTitle(valueText), 20);
                                    break;
                                case 'author':
                                    this.setData('author', this.utils.cleanAuthor(valueText, this.config.KEYWORDS.author), confidenceScore);
                                    break;
                                case 'publicationYear':
                                    this.setData('publicationYear', this.utils.normalizeYear(valueText), confidenceScore);
                                    break;
                                case 'pages':
                                    this.setData('pages', this.utils.extractNumber(valueText), confidenceScore);
                                    break;
                                case 'price':
                                    const price = this.utils.normalizePrice(valueText);
                                    if (price) this.setData('price', price, confidenceScore);
                                    break;
                                case 'isbn':
                                    this.setData('isbn', valueText.replace(/-/g, ''), confidenceScore);
                                    break;
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[Book Scraper] Failed during Label extraction:', e);
        }
    }

    extractFromVisibleText() {
        try {
            // Point 4c: Defensive checks
            if (typeof this.getVisibleText !== 'function' || typeof this.getPriceValue !== 'function') {
                return;
            }

            const mainProductArea = document.querySelector('.product-single-info, .product-info, .summary.entry-summary, .product-view, [role="main"]');
            const scope = mainProductArea || document.body;

            // Threshold dinaikkan ke 55 agar metode ini tetap berjalan meskipun
            // og:title (confidence 50) sudah ditemukan. Ini memastikan judul dari
            // heading yang terlihat (lebih akurat) bisa meng-override meta tag.
            if (this.confidence.title < 55) {
                const titleEl = scope.querySelector(
                    'h1.title, h2.title, h3.title, h4.title, ' +
                    '[class*="product-title"], [class*="product_name"], ' +
                    'h1.entry-title, h1.product_title'
                );
                if (titleEl) {
                    const titleText = this.utils.cleanTitle(titleEl.textContent);
                    if (titleText) this.setData('title', titleText, 55);
                }
            }

            if (this.confidence.author < 10) {
                const authorText = this.getVisibleText('[data-testid="productDetailAuthor"]', 'author');
                if (authorText) this.setData('author', authorText, 10);
            }

            if (this.confidence.price < 10) {
                const priceCandidates = [];
                scope.querySelectorAll(this.config.PRICE_SELECTORS.join(', ')).forEach(el => {
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

    // Dipanggil langsung oleh extractor situs manapun sebagai lapis fallback
    // terakhir, setelah logika khusus situsnya sendiri dijalankan.
    runGenericFallback() {
        // Run extractors from most reliable to least reliable
        this.extractFromJsonLd();
        this.extractFromOpenGraph();
        this.extractFromMeta();
        this.extractFromSemanticHtml();
        this.extractFromTableSpecs();
        this.extractPriceIndonesian();
        this.extractFromLabels();
        this.extractFromVisibleText();
    }

    // Dipakai apa adanya untuk situs yang TIDAK dikenal (lihat registry.js)
    async run() {
        console.log('[Book Scraper Debug] Using AndiExtractor.');

        // Cek isBookPage() tetap berguna untuk halaman non-produk di andipublisher.com
        // (mis. halaman kategori, kontak, dll) agar tidak salah ekstrak.
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