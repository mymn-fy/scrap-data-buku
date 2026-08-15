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

import { BaseExtractor } from './base.js';

export class GenericExtractor extends BaseExtractor {
    async waitForPageSignals(timeoutMs = 4000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const titleSignal = document.querySelector('[data-testid="productDetailTitle"], h1');
            const genericPriceSignal = document.querySelector(this.config.PRICE_SELECTORS.join(', '));
            if (titleSignal || genericPriceSignal) break;
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }

    extractFromJsonLd() {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of scripts) {
            try {
                const json = JSON.parse(script.textContent);
                const items = Array.isArray(json) ? json : [json];
                for (const item of items) {
                    const graph = item['@graph'] || [item];
                    for (const node of graph) {
                        if (node['@type'] === 'Book' || node['@type'] === 'Product' || node['@type'] === 'CreativeWork') {
                            this.setData('title', this.utils.cleanTitle(node.name), 45);
                            if (node.author) {
                                const authorName = Array.isArray(node.author) ? node.author.map(a => a.name).filter(Boolean).join(', ') : node.author.name;
                                this.setData('author', this.utils.cleanAuthor(authorName, this.config.KEYWORDS.author), 40);
                            }
                            if (node.offers) {
                                const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
                                const price = this.utils.normalizePrice(String(offer.price));
                                if (price) this.setData('price', price, 40);
                            }
                            this.setData('publicationYear', this.utils.normalizeYear(node.datePublished), 40);
                            this.setData('pages', this.utils.extractNumber(String(node.numberOfPages)), 40);
                        }
                    }
                }
            } catch (e) {
                console.warn('[Book Scraper] Failed to parse JSON-LD:', e);
            }
        }
    }

    extractFromMeta() {
        const meta = (prop) => document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`)?.content;
        const titleMeta = meta('og:title') || meta('twitter:title') || document.title;
        const authorMeta = meta('books:author') || meta('book:author') || meta('author');
        this.setData('title', this.utils.cleanTitle(titleMeta), 35);
        this.setData('author', this.utils.cleanAuthor(authorMeta, this.config.KEYWORDS.author), 35);
        const price = this.utils.normalizePrice(meta('product:price:amount') || meta('og:price:amount') || meta('price'));
        if (price) this.setData('price', price, 30);
    }

    extractFromSemanticHtml() {
        const prop = (name) => document.querySelector(`[itemprop="${name}"]`)?.textContent;
        this.setData('title', this.utils.cleanTitle(prop('name')), 25);
        this.setData('author', this.utils.cleanAuthor(prop('author'), this.config.KEYWORDS.author), 25);
        this.setData('publicationYear', this.utils.normalizeYear(prop('datePublished')), 25);
        this.setData('pages', this.utils.extractNumber(prop('numberOfPages')), 25);
        const price = this.utils.normalizePrice(prop('price'));
        if (price) this.setData('price', price, 25);
    }

    extractFromLabels() {
        const allTextNodes = Array.from(document.querySelectorAll('p, span, div, td, li, dt, dd, label'));
        allTextNodes.forEach(node => {
            const nodeTextContent = node.textContent.trim(); // Keep original case for colon check
            const text = nodeTextContent.toLowerCase(); // For keyword matching
            if (text.length > 25 || text.length < 3) return;

            Object.keys(this.config.KEYWORDS).forEach(field => {
                const keywordsForField = this.config.KEYWORDS[field];
                let matchedKeyword = null;

                // Determine if the node's text matches any keyword for the current field
                // Be more strict for non-LABEL elements by requiring a colon
                if (node.tagName === 'LABEL') {
                    matchedKeyword = keywordsForField.find(kw => text.startsWith(kw));
                } else {
                    // For other elements, require the keyword to be followed by a colon
                    // This prevents matching "penulis" in "Daftar Isi Penulis" if it's not a label
                    matchedKeyword = keywordsForField.find(kw => nodeTextContent.includes(kw + ':'));
                }

                if (matchedKeyword) {
                    let valueText = '';
                    let confidenceScore = 15; // Default low confidence

                    // Scenario 1: Node is a <label> and its next sibling is the value element
                    // This is the most reliable pattern for the user's HTML
                    if (node.tagName === 'LABEL' && node.nextElementSibling) {
                        const nextEl = node.nextElementSibling;
                        // Check if the next element is a common container for values
                        if (['A', 'SPAN', 'STRONG', 'P', 'DIV', 'TD', 'LI', 'DD'].includes(nextEl.tagName)) {
                            valueText = nextEl.textContent.trim();
                            confidenceScore = 65; // Very high confidence
                        }
                    }

                    // Scenario 2: Keyword and value are in the same text node, separated by a colon
                    // This handles cases like "Penulis: John Doe" within a single <div> or <p>
                    if (!valueText && nodeTextContent.includes(matchedKeyword + ':')) {
                        valueText = nodeTextContent.split(matchedKeyword + ':').slice(1).join(':').trim();
                        confidenceScore = Math.max(confidenceScore, 40); // Medium confidence
                    }

                    // Only proceed if a valueText was successfully extracted by the specific scenarios above
                    if (valueText) {
                        switch (field) {
                            case 'author':
                                console.log(`[Book Scraper Debug] extractFromLabels - Field: ${field}, Node Tag: ${node.tagName}, Node Text: "${nodeTextContent}", Matched Keyword: "${matchedKeyword}", Extracted Value: "${valueText}", Confidence: ${confidenceScore}`);
                                this.setData('author', this.utils.cleanAuthor(valueText, this.config.KEYWORDS.author), confidenceScore);
                                break;
                            case 'publishedYear':
                                this.setData('publicationYear', this.utils.normalizeYear(valueText), confidenceScore);
                                const pagesMatch = valueText.match(/(\d+)\s*(halaman|pages)/i);
                                if (pagesMatch && pagesMatch[1]) {
                                    this.setData('pages', parseInt(pagesMatch[1], 10), confidenceScore);
                                }
                                break;
                            case 'pages':
                                this.setData('pages', this.utils.extractNumber(valueText), confidenceScore);
                                break;
                            case 'isbn':
                                this.setData('isbn', valueText, confidenceScore);
                                break;
                        }
                    }
                }
            });
        });
    }

    extractFromVisibleText() {
        if (this.confidence.title < 10) {
            const titleText = this.getVisibleText('[data-testid="productDetailTitle"], h1', 'title');
            if (titleText) this.setData('title', titleText, 10);
        }

        if (this.confidence.author < 10) {
            const authorText = this.getVisibleText('[data-testid="productDetailAuthor"]', 'author');
            if (authorText) this.setData('author', authorText, 10);
        }

        if (this.confidence.price < 10) {
            const priceCandidates = [];
            document.querySelectorAll(this.config.PRICE_SELECTORS.join(', ')).forEach(el => {
                const priceText = el.textContent || el.getAttribute('data-price');
                const price = this.getPriceValue(priceText);
                if (price) {
                    const isStrikethrough = window.getComputedStyle(el).textDecoration.includes('line-through');
                    if (!isStrikethrough) {
                        priceCandidates.push(price);
                    }
                }
            });
            if (priceCandidates.length > 0) {
                this.setData('price', Math.min(...priceCandidates), 10);
            }
        }
    }

    // Dipanggil langsung oleh extractor situs manapun sebagai lapis fallback
    // terakhir, setelah logika khusus situsnya sendiri dijalankan.
    runGenericFallback() {
        this.extractFromJsonLd();
        this.extractFromMeta();
        this.extractFromSemanticHtml();
        this.extractFromLabels();
        this.extractFromVisibleText();
    }

    // Dipakai apa adanya untuk situs yang TIDAK dikenal (lihat registry.js)
    async run() {
        await this.waitForPageSignals();
        this.runGenericFallback();
        this.extractPriceVariants();
        this.finalizePriceVariants();
        return this.buildResult();
    }
}
