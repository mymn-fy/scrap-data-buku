// scripts/extractors/base.js
// Kelas dasar berisi state (data/confidence) dan method util yang dipakai
// oleh SEMUA extractor (generic maupun per-situs). Tidak ada logika khusus
// satu situs di file ini — kalau butuh tambah field/util baru yang lintas
// situs, di sinilah tempatnya.

export class BaseExtractor {
    constructor(utilsModule, configModule) {
        this.utils = utilsModule;
        this.config = configModule;
        this.data = {
            title: '',
            author: '',
            publicationYear: null,
            price: null,
            pages: null,
            originalPrice: null,
            discountPrice: null,
            isbn: '',
            publisher: '',
        };
        this.confidence = {
            title: 0,
            author: 0,
            publicationYear: 0,
            price: 0,
            pages: 0,
            originalPrice: 0,
            discountPrice: 0,
            isbn: 0,
            publisher: 0,
        };
    }

    // Subclass WAJIB override ini kalau punya sinyal loading yang lebih akurat
    // (mis. skeleton loader spesifik situs). Default: tunggu sebentar saja.
    async waitForPageSignals(timeoutMs = 4000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const hasAnySignal = Boolean(
                document.querySelector('h1') ||
                document.querySelector(this.config.PRICE_SELECTORS.join(', '))
            );
            if (hasAnySignal) break;
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }

    setData(field, value, score) {
        if (score > this.confidence[field]) {
            this.data[field] = value;
            this.confidence[field] = score;
        } else if (score === this.confidence[field]) {
            if ((this.data[field] === null || this.data[field] === '' || this.data[field] === undefined) &&
                (value !== null && value !== undefined && value !== '')) {
                this.data[field] = value;
            } else if (value !== null && value !== undefined && value !== '' &&
                     this.data[field] !== null && this.data[field] !== undefined && this.data[field] !== '' &&
                     String(this.data[field]).toLowerCase() === String(value).toLowerCase()) {
                this.confidence[field] = Math.min(100, this.confidence[field] + Math.round(score / 4));
            }
        } else if (score < this.confidence[field]) {
            if ((this.data[field] === null || this.data[field] === '' || this.data[field] === undefined) &&
                (value !== null && value !== undefined && value !== '')) {
                this.data[field] = value;
                this.confidence[field] = score;
            }
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

        const priceRegex = /(?:Rp\s*\.?\s*)?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/i;
        const match = clean.match(priceRegex);

        if (match && match[1]) {
            return this.utils.normalizePrice(match[1]);
        }
        return null;
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

    setPriceVariant(field, value, score) {
        if (score > this.confidence[field]) {
            this.data[field] = value;
            this.confidence[field] = score;
        } else if (score === this.confidence[field] && this.data[field] === null && value !== null) {
            this.data[field] = value;
        }
    }

    // Scan generik lintas situs (selector .price/.harga/dst yang lebar).
    // Ini yang dulu jadi sumber bug "badge diskon kebaca sebagai harga",
    // makanya dijaga dengan MIN_PLAUSIBLE_PRICE + deteksi strikethrough.
    extractPriceVariants() {
        const MIN_PLAUSIBLE_PRICE = 1000;

        document.querySelectorAll(this.config.PRICE_SELECTORS.join(', ')).forEach(el => {
            const price = this.getPriceValue(el.textContent || el.getAttribute('data-price'));
            if (!price || price < MIN_PLAUSIBLE_PRICE) return;

            const style = window.getComputedStyle(el);
            const isStruck = style.textDecorationLine?.includes('line-through')
                || el.closest('del, s, strike') !== null;

            const marker = `${el.className} ${el.id} ${el.getAttribute('data-testid') || ''}`.toLowerCase();
            const looksOld = this.config.OLD_PRICE_KEYWORDS.some(kw => marker.includes(kw));
            const looksSale = this.config.SALE_PRICE_KEYWORDS.some(kw => marker.includes(kw));

            if (isStruck || looksOld) {
                this.setPriceVariant('originalPrice', price, isStruck ? 30 : 20);
            } else if (looksSale) {
                this.setPriceVariant('discountPrice', price, 30);
            } else {
                this.setPriceVariant('discountPrice', price, 12);
            }
        });

        document.querySelectorAll('del, s, strike').forEach(el => {
            const price = this.getPriceValue(el.textContent);
            if (price && price >= 1000) this.setPriceVariant('originalPrice', price, 25);
        });
    }

    finalizePriceVariants() {
        if (this.data.discountPrice === null || this.confidence.discountPrice < this.confidence.price) {
            this.data.discountPrice = this.data.price;
        }
        if (this.data.originalPrice === null) this.data.originalPrice = this.data.price;

        if (this.data.originalPrice !== null && this.data.discountPrice !== null
            && this.data.originalPrice !== this.data.discountPrice) {
            const higher = Math.max(this.data.originalPrice, this.data.discountPrice);
            const lower = Math.min(this.data.originalPrice, this.data.discountPrice);
            this.data.originalPrice = higher;
            this.data.discountPrice = lower;
        }
    }

    buildResult() {
        const totalConfidence = Object.values(this.confidence).reduce((sum, value) => sum + value, 0);
        return {
            ...this.data,
            confidence: Math.min(100, totalConfidence),
            sourceUrl: window.location.href,
            sourceDomain: window.location.hostname,
            extractedAt: new Date().toISOString(),
        };
    }
}
