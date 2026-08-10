// This script is injected into the web page, so it needs to import its dependencies.
// The imports will be handled by the content_script.js injector.

let utils, config;

// --- EXTRACTION ENGINE ---

class Extractor {
    constructor(utilsModule, configModule) {
        utils = utilsModule;
        config = configModule;
        this.data = {
            title: "",
            author: "",
            publicationYear: null,
            price: null,
            pages: null,
        };
        this.confidence = {
            title: 0,
            author: 0,
            publicationYear: 0,
            price: 0,
            pages: 0,
        };
    }

    // Main extraction function
    async extractBookData() {
        this.extractFromJsonLd();
        this.extractFromMeta();
        this.extractFromSemanticHtml();
        this.extractFromLabels();
        this.extractFromVisibleText();

        const totalConfidence = Object.values(this.confidence).reduce((sum, value) => sum + value, 0);

        return {
            ...this.data,
            confidence: Math.min(100, totalConfidence), // Cap at 100
            sourceUrl: window.location.href,
            sourceDomain: window.location.hostname,
            extractedAt: new Date().toISOString(),
        };
    }

    // Helper to set data if confidence is higher
    setData(field, value, score) {
        if (value && this.confidence[field] < score) {
            this.data[field] = value;
            this.confidence[field] = score;
        } else if (value && this.confidence[field] > 0) {
            // Finding the same info from another source boosts confidence
            this.confidence[field] += Math.round(score / 4);
        }
    }

    // Level 1: JSON-LD
    extractFromJsonLd() {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of scripts) {
            try {
                const json = JSON.parse(script.textContent);
                const items = Array.isArray(json) ? json : [json];
                for (const item of items) {
                    const graph = item['@graph'] || [item];
                    for (const node of graph) {
                        if (node['@type'] === 'Book' || node['@type'] === 'Product') {
                            this.setData('title', node.name, 40);
                            if (node.author) {
                                const authorName = Array.isArray(node.author) ? node.author.map(a => a.name).join(', ') : node.author.name;
                                this.setData('author', authorName, 40);
                            }
                            if (node.offers) {
                                const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
                                const price = utils.normalizePrice(String(offer.price));
                                if (price) this.setData('price', price, 40);
                            }
                            this.setData('publicationYear', utils.normalizeYear(node.datePublished), 40);
                            this.setData('pages', utils.extractNumber(String(node.numberOfPages)), 40);
                        }
                    }
                }
            } catch (e) {
                console.warn('[Book Scraper] Failed to parse JSON-LD:', e);
            }
        }
    }

    // Level 2: OpenGraph & Meta Tags
    extractFromMeta() {
        const meta = (prop) => document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`)?.content;
        this.setData('title', meta('og:title') || meta('twitter:title'), 30);
        this.setData('author', meta('book:author') || meta('author'), 30);
        const price = utils.normalizePrice(meta('product:price:amount') || meta('og:price:amount'));
        if (price) this.setData('price', price, 30);
    }

    // Level 3: Semantic HTML (itemprop)
    extractFromSemanticHtml() {
        const prop = (name) => document.querySelector(`[itemprop="${name}"]`)?.textContent;
        this.setData('title', prop('name'), 25);
        this.setData('author', prop('author'), 25);
        this.setData('publicationYear', utils.normalizeYear(prop('datePublished')), 25);
        this.setData('pages', utils.extractNumber(prop('numberOfPages')), 25);
        const price = utils.normalizePrice(prop('price'));
        if (price) this.setData('price', price, 25);
    }

    // Level 4: Label-based Extraction
    extractFromLabels() {
        const allTextNodes = Array.from(document.querySelectorAll('p, span, div, td, li, dt, dd'));
        allTextNodes.forEach(node => {
            const text = node.textContent.trim().toLowerCase();
            if (text.length > 25 || text.length < 3) return; // Skip long paragraphs or tiny texts

            Object.keys(config.KEYWORDS).forEach(field => {
                if (config.KEYWORDS[field].some(kw => text.startsWith(kw))) {
                    let valueNode = node.nextElementSibling || node.parentElement.nextElementSibling;
                    let valueText = valueNode ? valueNode.textContent.trim() : '';

                    // Handle "Label: Value" in the same element
                    if (!valueText && text.includes(':')) {
                        valueText = text.split(':').slice(1).join(':').trim();
                    }
                    
                    if (valueText) {
                        switch (field) {
                            case 'author':
                                this.setData('author', utils.cleanAuthor(valueText, config.KEYWORDS.author), 15);
                                break;
                            case 'publishedYear':
                                this.setData('publicationYear', utils.normalizeYear(valueText), 15);
                                break;
                            case 'pages':
                                this.setData('pages', utils.extractNumber(valueText), 15);
                                break;
                        }
                    }
                }
            });
        });
    }

    // Level 5: Visible Text Heuristics (Fallback)
    extractFromVisibleText() {
        // Title: Often in <h1>
        if (this.confidence.title < 10) {
            const h1 = document.querySelector('h1');
            if (h1) this.setData('title', h1.textContent.trim(), 10);
        }

        // Price: Look for elements with price format
        if (this.confidence.price < 10) {
            const priceCandidates = [];
            document.querySelectorAll(config.PRICE_SELECTORS.join(', ')).forEach(el => {
                const priceText = el.textContent;
                const price = utils.normalizePrice(priceText);
                if (price) {
                    const isStrikethrough = window.getComputedStyle(el).textDecoration.includes('line-through');
                    if (!isStrikethrough) {
                        priceCandidates.push(price);
                    }
                }
            });
            // Assume the lowest price is the sale price
            if (priceCandidates.length > 0) {
                this.setData('price', Math.min(...priceCandidates), 10);
            }
        }
    }
}

// This function will be called by the content script.
async function main() {
    // Dynamically import dependencies
    const utilsModule = await import(chrome.runtime.getURL('scripts/utils.js'));
    const configModule = await import(chrome.runtime.getURL('scripts/config.js'));
    
    const extractor = new Extractor(utilsModule, configModule);
    return await extractor.extractBookData();
}

main();
