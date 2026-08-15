// scripts/extractors/anak-hebat.js
// Selector di sini spesifik ke template toko "Anak Hebat Indonesia"
// (struktur #product-info, #tab-detail table.box-table — gaya OpenCart).
//
// CATATAN: saya belum bisa memastikan 100% domain resmi yang memakai
// struktur DOM ini (kemungkinan besar anakhebatindonesia.com atau reseller
// bertema OpenCart seperti grobmart.com — silakan cek & sesuaikan pola di
// registry.js kalau ternyata beda).

import { GenericExtractor } from './generic.js';

export class AnakHebatExtractor extends GenericExtractor {
    async waitForPageSignals(timeoutMs = 4000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const anakHebatTitle = document.querySelector('#product-info h1');
            const anakHebatPrice = document.querySelector('#product-info .price h4');
            const anakHebatPriceTextContent = anakHebatPrice?.textContent || '';
            const anakHebatPriceHasFullNumber = /\d{3,}|[.,]\d{3}/.test(anakHebatPriceTextContent);
            const anakHebatDetailTable = document.querySelector('#tab-detail table.box-table');

            const hasSignal = Boolean(anakHebatTitle || (anakHebatPrice && anakHebatPriceHasFullNumber) || anakHebatDetailTable);
            if (hasSignal) break;
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }

    // Bagian #product-info dari extractFromPageData() lama.
    extractFromProductInfo() {
        const titleText = this.getVisibleText('#product-info h1', 'title');
        if (titleText && this.confidence.title < 70) this.setData('title', titleText, 70);

        const authorText = this.getVisibleText('#product-info > div.inner > strong > a', 'author');
        if (authorText && this.confidence.author < 70) this.setData('author', authorText, 70);

        const priceContainer = document.querySelector('#product-info .price');
        if (priceContainer) {
            const priceFromContainer = this.getPriceValue(priceContainer.textContent);
            if (priceFromContainer !== null) {
                this.setData('price', priceFromContainer, 70);
                return;
            }
        }
        const priceText = this.getVisibleText('#product-info .price h4');
        const priceValue = this.getPriceValue(priceText);
        if (priceValue && this.confidence.price < 70) this.setData('price', priceValue, 70);
    }

    // Tabel "Detail" (Penulis/Ketebalan) — persis dari
    // extractFromAnakHebatDetails() di kode lama.
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

        // Anak Hebat pakai "Ketebalan" untuk halaman (sudah ada di KEYWORDS.pages)
        let pagesValueFromSpec = '';
        for (const kw of this.config.KEYWORDS.pages) {
            if (specData[kw]) pagesValueFromSpec = specData[kw];
        }
        if (pagesValueFromSpec) this.setData('pages', this.utils.extractNumber(pagesValueFromSpec), 85);
        else if (this.config.KEYWORDS.pages.some(kw => kw in specData)) this.setData('pages', null, 85);
    }

    async run() {
        await this.waitForPageSignals();
        this.extractFromProductInfo();
        this.extractFromAnakHebatDetails();
        this.runGenericFallback();
        this.extractPriceVariants();
        this.finalizePriceVariants();
        return this.buildResult();
    }
}
