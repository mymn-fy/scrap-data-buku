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
        this.setData('title', this.utils.stripSiteSuffixFromPageTitle(titleMeta), 35);
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
        const allTextNodes = Array.from(document.querySelectorAll('p, span, div, td, li, dt, dd'));
        allTextNodes.forEach(node => {
            const text = node.textContent.trim().toLowerCase();
            if (text.length > 25 || text.length < 3) return;

            Object.keys(this.config.KEYWORDS).forEach(field => {
                if (this.config.KEYWORDS[field].some(kw => text.startsWith(kw))) {
                    let valueNode = node.nextElementSibling || node.parentElement.nextElementSibling;
                    let valueText = valueNode ? valueNode.textContent.trim() : '';

                    if (!valueText && text.includes(':')) {
                        valueText = text.split(':').slice(1).join(':').trim();
                    }

                    if (valueText) {
                        switch (field) {
                            case 'author':
                                this.setData('author', this.utils.cleanAuthor(valueText, this.config.KEYWORDS.author), 15);
                                break;
                            case 'publishedYear':
                                this.setData('publicationYear', this.utils.normalizeYear(valueText), 15);
                                break;
                            case 'pages':
                                this.setData('pages', this.utils.extractNumber(valueText), 15);
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
                const price = this.utils.normalizePrice(priceText);
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