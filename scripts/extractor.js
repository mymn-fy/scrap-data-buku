// This script is injected into the web page, so it needs to import its dependencies.
// The imports will be handled by the content_script.js injector.

class Extractor {
    constructor(utilsModule, configModule) {
        this.utils = utilsModule; // Store as instance property
        this.config = configModule; // Store as instance property
        this.data = {
            title: '',
            author: '',
            publicationYear: null,
            price: null,
            pages: null, // Number of pages
        };
        this.confidence = {
            title: 0, // Initialize confidence for title
            author: 0, // Initialize confidence for author
            publicationYear: 0,
            price: 0,
            pages: 0, // Confidence for pages
        };
    }

    async extractBookData() {
        await this.waitForPageSignals();
        // Order of extraction matters for confidence scores
        this.extractFromSpecTable(); // New primary extraction method from specification table
        this.extractFromPageData();
        this.extractFromJsonLd();
        this.extractFromMeta();
        this.extractFromSemanticHtml();
        this.extractFromLabels();
        this.extractFromVisibleText();
        this.extractFromGramediaDetails(); // New method for Gramedia specific details

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
        // Set data if:
        // 1. The new score is strictly higher than the current confidence.
        // 2. The field hasn't been set yet (confidence is 0) AND the value is not null/undefined.
        // 3. The new score is higher or equal, and the value is explicitly null/empty,
        //    and we want to override a lower-confidence non-empty value with an empty one.
        //    (This is implicitly handled by `score > this.confidence[field]` for null/empty values
        //    if the score is higher, as `value` itself can be null/empty).
        if (score > this.confidence[field] || (this.confidence[field] === 0 && value !== null && value !== undefined && value !== '')) {
            this.data[field] = value;
            this.confidence[field] = score;
        } else if (value && this.confidence[field] > 0) { // Only increase confidence if value is not empty
            // If value is not empty and current confidence is not 0,
            // increase confidence if the new score is not higher but still relevant.
            this.confidence[field] += Math.round(score / 4);
        }
    }

    async waitForPageSignals(timeoutMs = 4000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            // Check for title (generic h1 is already included)
            const titleSignal = document.querySelector('[data-testid="productDetailTitle"], h1');
            // Check for author (specific data-testid)
            const authorSignal = document.querySelector('[data-testid="productDetailAuthor"]');
            // Check for specific price data-testid
            const specificPriceEl = document.querySelector('[data-testid="productDetailFinalPrice"]');
            // Ensure specific price element is present and not a skeleton
            const specificPriceValue = (specificPriceEl && !specificPriceEl.querySelector('[data-testid*="Skeleton"]')) ? this.getPriceValue(specificPriceEl.textContent) : null;

            // Check for generic price selectors from config
            const genericPriceSignal = document.querySelector(this.config.PRICE_SELECTORS.join(', '));

            // Check for Gramedia's "Detail Buku" section to be populated (not a skeleton)
            const gramediaDetailsContainer = document.querySelector('[data-testid="productDetailSpecificationContainer"]');
            const gramediaDetailsPopulated = gramediaDetailsContainer && !gramediaDetailsContainer.querySelector('[data-sentry-component="Skeleton"]');

            const hasSignal = Boolean(titleSignal || authorSignal || specificPriceValue || genericPriceSignal || gramediaDetailsPopulated);
            if (hasSignal) break;
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }

    getVisibleText(selector, field = 'generic') {
        const el = document.querySelector(selector);
        if (!el) return '';

        const rawText = el.textContent.replace(/\s+/g, ' ').trim();
        if (field === 'title') return this.utils.cleanTitle(rawText);
        if (field === 'author') return this.utils.cleanAuthor(rawText, this.config.KEYWORDS.author);
        return this.utils.cleanText(rawText);
    }

    getPriceValue(text) {
        if (!text) return null;
        const clean = text.replace(/\s+/g, ' ').trim();
        if (!clean || clean.includes('...') || clean.toLowerCase().includes('skeleton')) return null;
        return this.utils.normalizePrice(clean);
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

        if (meta) { // If meta object exists, try to extract from it
            if ('title' in meta) this.setData('title', this.utils.cleanTitle(meta.title), 50); // Increased confidence
            if ('author' in meta) this.setData('author', this.utils.cleanAuthor(meta.author, this.config.KEYWORDS.author), 50); // Increased confidence
        }

        // Fallback/additional extraction from visible elements with data-testid
        const titleText = this.getVisibleText('[data-testid="productDetailTitle"], h1', 'title');
        if (titleText && this.confidence.title < 50) this.setData('title', titleText, 50);

        const authorText = this.getVisibleText('[data-testid="productDetailAuthor"]', 'author');
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
        const authorMeta = meta('books:author') || meta('book:author') || meta('author'); // Gramedia uses books:author
        this.setData('title', this.utils.cleanTitle(titleMeta), 35); // Increased confidence
        this.setData('author', this.utils.cleanAuthor(authorMeta, this.config.KEYWORDS.author), 35); // Increased confidence
        const price = this.utils.normalizePrice(meta('product:price:amount') || meta('og:price:amount') || meta('price')); // Added generic 'price'
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

    /**
     * Extracts data from the specification table found within .woocommerce-product-details__short-description.
     * This is the primary source for Author, Publication Year, ISBN, Pages, and Institution.
     */
    extractFromSpecTable() {
        const specTableContainer = document.querySelector('.woocommerce-product-details__short-description');
        if (!specTableContainer) return; // No short description, so no spec table expected

        const specTable = specTableContainer.querySelector('table.table-striped');
        if (!specTable) return; // No spec table found

        const specData = {};
        const rows = specTable.querySelectorAll('tr');
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
                const label = this.utils.cleanText(cells[0].textContent).toLowerCase();
                const valueCell = cells[1];
                let value;

                // Check if the label (after cleaning and lowercasing) is one of the author keywords
                const isAuthorLabel = this.config.KEYWORDS.author.some(kw => label.includes(kw));

                if (isAuthorLabel) {
                    const authorParts = [];
                    valueCell.childNodes.forEach(node => {
                        if (node.nodeType === Node.TEXT_NODE) {
                            const text = node.textContent.trim();
                            if (text) authorParts.push(text);
                        } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'A') {
                            const text = node.textContent.trim();
                            if (text) authorParts.push(text);
                        }
                    });
                    value = authorParts.join(', ');
                } else {
                    value = this.utils.cleanText(valueCell.textContent);
                }
                specData[label] = value;
            }
        });

        // Apply mapping and set data with high confidence (80)
        let authorValueFromSpec = '';
        // Check for all possible author keywords in specData
        for (const kw of this.config.KEYWORDS.author) {
            if (specData[kw]) {
                authorValueFromSpec = specData[kw];
                break; // Found an author value, use the first one
            }
        }

        if (authorValueFromSpec) { // If an author value was found
            this.setData('author', this.utils.cleanAuthor(authorValueFromSpec, this.config.KEYWORDS.author), 90);
        } else if (this.config.KEYWORDS.author.some(kw => kw in specData)) {
            // If an author label was present but the value was empty, set author to empty string with high confidence
            this.setData('author', '', 90);
        }
        if (specData['tahun']) this.setData('publicationYear', this.utils.normalizeYear(specData['tahun']), 80);
        if (specData['halaman']) this.setData('pages', this.utils.extractNumber(specData['halaman']), 80);
    }

    /**
     * Extracts data from Gramedia's specific "Detail Buku" section.
     * This section is typically a series of divs with label and value.
     */
    extractFromGramediaDetails() {
        const detailsContainer = document.querySelector('[data-testid="productDetailSpecificationContainer"]');
        // Return if container not found or still contains skeleton elements
        if (!detailsContainer || detailsContainer.querySelector('[data-sentry-component="Skeleton"]')) {
            return;
        }

        const detailItems = detailsContainer.querySelectorAll('.shrink-0.grow-0.basis-1\\/2'); // Select each key-value pair div
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

        // Map extracted data to book fields with high confidence (85)
        let authorValueFromSpec = '';
        for (const kw of this.config.KEYWORDS.author) {
            if (specData[kw]) {
                authorValueFromSpec = specData[kw];
                break;
            }
        }
        if (authorValueFromSpec) {
            this.setData('author', this.utils.cleanAuthor(authorValueFromSpec, this.config.KEYWORDS.author), 85);
        } else if (this.config.KEYWORDS.author.some(kw => kw in specData)) {
            this.setData('author', '', 85);
        }

        let yearValueFromSpec = '';
        for (const kw of this.config.KEYWORDS.publishedYear) {
            if (specData[kw]) yearValueFromSpec = specData[kw];
        }
        if (yearValueFromSpec) this.setData('publicationYear', this.utils.normalizeYear(yearValueFromSpec), 85);
        else if (this.config.KEYWORDS.publishedYear.some(kw => kw in specData)) this.setData('publicationYear', null, 85);

        let pagesValueFromSpec = '';
        for (const kw of this.config.KEYWORDS.pages) {
            if (specData[kw]) pagesValueFromSpec = specData[kw];
        }
        if (pagesValueFromSpec) this.setData('pages', this.utils.extractNumber(pagesValueFromSpec), 85);
        else if (this.config.KEYWORDS.pages.some(kw => kw in specData)) this.setData('pages', null, 85);
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

                    if (valueText) { // Use this.config.KEYWORDS.author
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
}

export async function performScraping(utilsModule, configModule) {
    const extractor = new Extractor(utilsModule, configModule); // Pass modules to constructor
    return await extractor.extractBookData(); // Return extracted data
}

// The immediate call to main() is removed.
// The popup.js will now explicitly call performScraping.
