// This script is injected into the web page, so it needs to import its dependencies.
// The imports will be handled by the content_script.js injector.

let utils, config;

// --- EXTRACTION ENGINE ---

class Extractor {
    constructor(utilsModule, configModule) {
        utils = utilsModule;
        config = configModule;
        this.data = {
            title: '',
            author: '',
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

    async extractBookData() {
        await this.waitForPageSignals();
        this.extractFromPageData();
        this.extractFromJsonLd();
        this.extractFromMeta();
        this.extractFromSemanticHtml();
        this.extractFromLabels();
        this.extractFromVisibleText();

        const totalConfidence = Object.values(this.confidence).reduce((sum, value) => sum + value, 0);

        return {
            ...this.data,
            confidence: Math.min(100, totalConfidence),
            sourceUrl: window.location.href,
            sourceDomain: window.location.hostname,
            extractedAt: new Date().toISOString(),
        };
    }

    setData(field, value, score) {
        if (value && this.confidence[field] < score) {
            this.data[field] = value;
            this.confidence[field] = score;
        } else if (value && this.confidence[field] > 0) {
            this.confidence[field] += Math.round(score / 4);
        }
    }

    async waitForPageSignals(timeoutMs = 4000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const title = this.getVisibleText('[data-testid="productDetailTitle"], h1');
            const author = this.getVisibleText('[data-testid="productDetailAuthor"]');
            const price = this.getVisibleText('[data-testid="productDetailFinalPrice"]');
            const hasSignal = Boolean(title || author || this.getPriceValue(price));
            if (hasSignal) break;
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }

    getVisibleText(selector) {
        const el = document.querySelector(selector);
        return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
    }

    getPriceValue(text) {
        if (!text) return null;
        const clean = text.replace(/\s+/g, ' ').trim();
        if (!clean || clean.includes('...') || clean.toLowerCase().includes('skeleton')) return null;
        return utils.normalizePrice(clean);
    }

    readNextData() {
        const script = document.getElementById('__NEXT_DATA__');
        if (!script?.textContent) return null;
        try {
            return JSON.parse(script.textContent);
        } catch (error) {
            return null;
        }
    }

    extractFromPageData() {
        const nextData = this.readNextData();
        const meta = nextData?.props?.pageProps?.productDetailMeta || nextData?.props?.pageProps?.product_meta;
        if (meta?.title) this.setData('title', meta.title, 45);
        if (meta?.author) this.setData('author', meta.author, 45);

        const titleText = this.getVisibleText('[data-testid="productDetailTitle"], h1');
        if (titleText && this.confidence.title < 20) this.setData('title', titleText, 20);

        const authorText = this.getVisibleText('[data-testid="productDetailAuthor"]');
        if (authorText && this.confidence.author < 20) this.setData('author', authorText, 20);

        const priceText = this.getVisibleText('[data-testid="productDetailFinalPrice"]');
        const priceValue = this.getPriceValue(priceText);
        if (priceValue && this.confidence.price < 20) this.setData('price', priceValue, 20);
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

    extractFromMeta() {
        const meta = (prop) => document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`)?.content;
        const titleMeta = meta('og:title') || meta('twitter:title') || document.title;
        const authorMeta = meta('books:author') || meta('book:author') || meta('author');
        this.setData('title', titleMeta, 30);
        this.setData('author', authorMeta, 30);
        const price = utils.normalizePrice(meta('product:price:amount') || meta('og:price:amount'));
        if (price) this.setData('price', price, 30);
    }

    extractFromSemanticHtml() {
        const prop = (name) => document.querySelector(`[itemprop="${name}"]`)?.textContent;
        this.setData('title', prop('name'), 25);
        this.setData('author', prop('author'), 25);
        this.setData('publicationYear', utils.normalizeYear(prop('datePublished')), 25);
        this.setData('pages', utils.extractNumber(prop('numberOfPages')), 25);
        const price = utils.normalizePrice(prop('price'));
        if (price) this.setData('price', price, 25);
    }

    extractFromLabels() {
        const allTextNodes = Array.from(document.querySelectorAll('p, span, div, td, li, dt, dd'));
        allTextNodes.forEach(node => {
            const text = node.textContent.trim().toLowerCase();
            if (text.length > 25 || text.length < 3) return;

            Object.keys(config.KEYWORDS).forEach(field => {
                if (config.KEYWORDS[field].some(kw => text.startsWith(kw))) {
                    let valueNode = node.nextElementSibling || node.parentElement.nextElementSibling;
                    let valueText = valueNode ? valueNode.textContent.trim() : '';

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

    extractFromVisibleText() {
        if (this.confidence.title < 10) {
            const titleText = this.getVisibleText('[data-testid="productDetailTitle"], h1');
            if (titleText) this.setData('title', titleText, 10);
        }

        if (this.confidence.author < 10) {
            const authorText = this.getVisibleText('[data-testid="productDetailAuthor"]');
            if (authorText) this.setData('author', authorText, 10);
        }

        if (this.confidence.price < 10) {
            const priceCandidates = [];
            document.querySelectorAll(config.PRICE_SELECTORS.join(', ')).forEach(el => {
                const priceText = el.textContent || el.getAttribute('data-price');
                const price = utils.normalizePrice(priceText);
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
}

async function main() {
    const utilsModule = await import(chrome.runtime.getURL('scripts/utils.js'));
    const configModule = await import(chrome.runtime.getURL('scripts/config.js'));

    const extractor = new Extractor(utilsModule, configModule);
    return await extractor.extractBookData();
}

main();
