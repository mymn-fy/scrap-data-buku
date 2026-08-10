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
        this.extractFromGramediaDetails(); // Gramedia specific details
        this.extractFromAnakHebatDetails(); // Anak Hebat specific details
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
        // Always update if the new score is strictly higher.
        if (score > this.confidence[field]) {
            this.data[field] = value;
            this.confidence[field] = score;
        }
        // If the scores are equal:
        else if (score === this.confidence[field]) {
            // If the current value is empty/null/undefined, but the new value is not, update.
            // This ensures a non-empty value is preferred over an empty one at the same confidence level.
            if ((this.data[field] === null || this.data[field] === '' || this.data[field] === undefined) &&
                (value !== null && value !== undefined && value !== '')) {
                this.data[field] = value;
            }
            // If both current and new values are non-empty and match, slightly increase confidence.
            else if (value !== null && value !== undefined && value !== '' &&
                     this.data[field] !== null && this.data[field] !== undefined && this.data[field] !== '' &&
                     String(this.data[field]).toLowerCase() === String(value).toLowerCase()) {
                this.confidence[field] = Math.min(100, this.confidence[field] + Math.round(score / 4));
            }
            // If the new value is empty, and the current value is not, do nothing (keep the non-empty value).
        }
        // If the new score is lower, only update if the current value is empty/null/undefined.
        // This allows a lower-confidence non-empty value to fill an empty slot.
        else if (score < this.confidence[field]) {
            if ((this.data[field] === null || this.data[field] === '' || this.data[field] === undefined) &&
                (value !== null && value !== undefined && value !== '')) {
                this.data[field] = value;
                this.confidence[field] = score;
            }
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

            // Check for Anak Hebat's main title and price
            const anakHebatTitle = document.querySelector('#product-info h1');
            const anakHebatPrice = document.querySelector('#product-info .price h4');
            // Check for Anak Hebat's detail table
            // Ensure Anak Hebat price element is present and its text content contains a number that is not just a single digit or two digits,
            // implying it's a full price like 62,000 or 62.000.
            const anakHebatPriceTextContent = anakHebatPrice?.textContent || '';
            const anakHebatPriceHasFullNumber = /\d{3,}|[.,]\d{3}/.test(anakHebatPriceTextContent); // Checks for at least 3 digits, or a thousands separator
            const anakHebatDetailTable = document.querySelector('#tab-detail table.box-table');

            const hasSignal = Boolean(titleSignal || authorSignal || specificPriceValue || genericPriceSignal || gramediaDetailsPopulated ||
                anakHebatTitle || (anakHebatPrice && anakHebatPriceHasFullNumber) || anakHebatDetailTable);
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
        if (!clean || clean.includes('...') || clean.toLowerCase().includes('skeleton')) return null; // Handle loading states

        // Attempt to extract a price-like string from the potentially longer text
        // Look for patterns like "Rp.X,XXX", "Rp X.XXX", "X,XXX", "X.XXX"
        // This regex tries to capture a number that might have thousands separators (comma or dot)
        // and optionally a decimal part (comma or dot followed by 1-2 digits).
        // It also looks for "Rp" prefix.
        const priceRegex = /(?:Rp\s*\.?\s*)?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/i;
        const match = clean.match(priceRegex);

        if (match && match[1]) {
            return this.utils.normalizePrice(match[1]);
        }
        return null; // No price pattern found
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
            if ('title' in meta) this.setData('title', this.utils.cleanTitle(meta.title), 50);
            if ('author' in meta) this.setData('author', this.utils.cleanAuthor(meta.author, this.config.KEYWORDS.author), 50);
        }

        // Fallback/additional extraction from visible elements with data-testid and Anak Hebat specific selectors
        const titleText = this.getVisibleText('[data-testid="productDetailTitle"], #product-info h1', 'title');
        if (titleText && this.confidence.title < 70) this.setData('title', titleText, 70);

        const authorText = this.getVisibleText('[data-testid="productDetailAuthor"], #product-info > div.inner > strong > a', 'author');
        if (authorText && this.confidence.author < 70) this.setData('author', authorText, 70);

        // For Anak Hebat, try to get the price from the full container first, then fallback to h4
        let priceText = null;
        const anakHebatPriceContainer = document.querySelector('#product-info .price');
        if (anakHebatPriceContainer) {
            // Try to extract price from the entire container's text content
            const priceFromContainer = this.getPriceValue(anakHebatPriceContainer.textContent);
            if (priceFromContainer !== null) {
                this.setData('price', priceFromContainer, 70);
                return; // Price found, no need for further extraction in this section
            }
        }
        // If price not found from container, or container not present, try specific h4 or data-testid
        priceText = this.getVisibleText('[data-testid="productDetailFinalPrice"], #product-info .price h4');

        const priceValue = this.getPriceValue(priceText);
        if (priceValue && this.confidence.price < 70) this.setData('price', priceValue, 70);
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
                        if (node['@type'] === 'Book' || node['@type'] === 'Product' || node['@type'] === 'CreativeWork') { // Added CreativeWork for broader matching
                            this.setData('title', this.utils.cleanTitle(node.name), 45); // Confidence 45
                            if (node.author) {
                                const authorName = Array.isArray(node.author) ? node.author.map(a => a.name).filter(Boolean).join(', ') : node.author.name;
                                this.setData('author', this.utils.cleanAuthor(authorName, this.config.KEYWORDS.author), 40); // Confidence 40
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

    /**
     * Extracts data from Anak Hebat Indonesia's specific "Detail" table.
     */
    extractFromAnakHebatDetails() {
        const detailTable = document.querySelector('#tab-detail table.box-table');
        if (!detailTable) return;

        const specData = {};
        const rows = detailTable.querySelectorAll('tr');
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
                const label = this.utils.cleanText(cells[0].textContent).toLowerCase();
                const value = this.utils.cleanText(cells[1].textContent);
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

        // Anak Hebat uses "Ketebalan" for pages
        let pagesValueFromSpec = '';
        for (const kw of this.config.KEYWORDS.pages) { // KEYWORDS.pages now includes 'ketebalan'
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
            if (titleText) this.setData('title', titleText, 10); // Confidence 10
        }

        if (this.confidence.author < 10) {
            const authorText = this.getVisibleText('[data-testid="productDetailAuthor"]', 'author');
            if (authorText) this.setData('author', authorText, 10); // Confidence 10
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
