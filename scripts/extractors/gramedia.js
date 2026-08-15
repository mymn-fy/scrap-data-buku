// scripts/extractors/gramedia.js
// Hanya jalan di gramedia.com (lihat registry.js).
// Selector di sini spesifik ke struktur Next.js Gramedia:
// __NEXT_DATA__, data-testid="productDetail...", dan blok "Detail Buku".

import { GenericExtractor } from './generic.js';

export class GramediaExtractor extends GenericExtractor {
    async waitForPageSignals(timeoutMs = 4000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const titleSignal = document.querySelector('[data-testid="productDetailTitle"], h1');
            const authorSignal = document.querySelector('[data-testid="productDetailAuthor"]');
            const specificPriceEl = document.querySelector('[data-testid="productDetailFinalPrice"]');
            const specificPriceValue = (specificPriceEl && !specificPriceEl.querySelector('[data-testid*="Skeleton"]')) ? this.getPriceValue(specificPriceEl.textContent) : null;
            const genericPriceSignal = document.querySelector(this.config.PRICE_SELECTORS.join(', '));
            const detailsContainer = document.querySelector('[data-testid="productDetailSpecificationContainer"]');
            const detailsPopulated = detailsContainer && !detailsContainer.querySelector('[data-sentry-component="Skeleton"]');

            const hasSignal = Boolean(titleSignal || authorSignal || specificPriceValue || genericPriceSignal || detailsPopulated);
            if (hasSignal) break;
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }

    // Bagian __NEXT_DATA__ + data-testid dari extractFromPageData() lama
    // (bagian #product-info-nya Anak Hebat sudah dipindah ke anak-hebat.js).
    extractFromNextData() {
        const nextData = this.readNextData();
        const meta = nextData?.props?.pageProps?.productDetailMeta || nextData?.props?.pageProps?.product_meta;

        if (meta) {
            if ('title' in meta) this.setData('title', this.utils.cleanTitle(meta.title), 50);
            if ('author' in meta) this.setData('author', this.utils.cleanAuthor(meta.author, this.config.KEYWORDS.author), 50);
        }

        const titleText = this.getVisibleText('[data-testid="productDetailTitle"]', 'title');
        if (titleText && this.confidence.title < 70) this.setData('title', titleText, 70);

        const authorText = this.getVisibleText('[data-testid="productDetailAuthor"]', 'author');
        if (authorText && this.confidence.author < 70) this.setData('author', authorText, 70);

        const priceText = this.getVisibleText('[data-testid="productDetailFinalPrice"]');
        const priceValue = this.getPriceValue(priceText);
        if (priceValue && this.confidence.price < 70) this.setData('price', priceValue, 70);
    }

    // Blok "Detail Buku" (Penulis/Tahun Terbit/Halaman) — persis dari
    // extractFromGramediaDetails() di kode lama.
    extractFromGramediaDetails() {
        const detailsContainer = document.querySelector('[data-testid="productDetailSpecificationContainer"]');
        if (!detailsContainer || detailsContainer.querySelector('[data-sentry-component="Skeleton"]')) {
            return;
        }

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

    async run() {
        await this.waitForPageSignals();
        this.extractFromNextData();
        this.extractFromGramediaDetails();
        this.runGenericFallback(); // fallback kalau ada field yang masih kosong
        this.extractPriceVariants();
        this.finalizePriceVariants();
        return this.buildResult();
    }
}
