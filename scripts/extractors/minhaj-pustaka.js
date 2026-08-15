// scripts/extractors/minhaj-pustaka.js
// Hanya jalan di minhajpustaka.id (WooCommerce). Ada dua variasi template
// yang pernah ditemukan di kode lama, jadi dua-duanya tetap dicoba:
// 1) tabel spesifikasi (.woocommerce-product-details__short-description table.table-striped)
// 2) deskripsi singkat berbaris <br> (.product-short-description p)

import { GenericExtractor } from './generic.js';

export class MinhajPustakaExtractor extends GenericExtractor {
    // Belum ada sinyal loading spesifik yang ditemukan untuk situs ini di
    // kode lama, jadi pakai default generik dari BaseExtractor/GenericExtractor.

    extractFromSpecTable() {
        const specTableContainer = document.querySelector('.woocommerce-product-details__short-description');
        if (!specTableContainer) return;

        const specTable = specTableContainer.querySelector('table.table-striped');
        if (!specTable) return;

        const specData = {};
        const rows = specTable.querySelectorAll('tr');
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
                const label = this.utils.cleanText(cells[0].textContent).toLowerCase();
                const valueCell = cells[1];
                let value;

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

        let authorValueFromSpec = '';
        for (const kw of this.config.KEYWORDS.author) {
            if (specData[kw]) {
                authorValueFromSpec = specData[kw];
                break;
            }
        }

        if (authorValueFromSpec) {
            this.setData('author', this.utils.cleanAuthor(authorValueFromSpec, this.config.KEYWORDS.author), 90);
        } else if (this.config.KEYWORDS.author.some(kw => kw in specData)) {
            this.setData('author', '', 90);
        }
        if (specData['tahun']) this.setData('publicationYear', this.utils.normalizeYear(specData['tahun']), 80);
        if (specData['halaman']) this.setData('pages', this.utils.extractNumber(specData['halaman']), 80);
    }

    extractFromMinhajPustakaShortDescription() {
        const shortDescriptionEl = document.querySelector('.product-short-description p');
        if (!shortDescriptionEl) return;

        const textContent = shortDescriptionEl.innerHTML;
        const lines = textContent.split(/<br\s*\/?>/i).map(line => line.trim()).filter(Boolean);

        const specData = {};
        lines.forEach(line => {
            const parts = line.split(':');
            if (parts.length >= 2) {
                const label = this.utils.cleanText(parts[0]).toLowerCase();
                const value = this.utils.cleanText(parts.slice(1).join(':'));
                specData[label] = value;
            }
        });

        let authorValue = '';
        for (const kw of this.config.KEYWORDS.author) {
            if (specData[kw]) {
                authorValue = specData[kw];
                break;
            }
        }
        if (authorValue) {
            this.setData('author', this.utils.cleanAuthor(authorValue, this.config.KEYWORDS.author), 90);
        } else if (this.config.KEYWORDS.author.some(kw => kw in specData)) {
            this.setData('author', '', 90);
        }

        let yearValue = '';
        for (const kw of this.config.KEYWORDS.publishedYear) {
            if (specData[kw]) {
                yearValue = specData[kw];
                break;
            }
        }
        if (yearValue) {
            this.setData('publicationYear', this.utils.normalizeYear(yearValue), 90);
        } else if (this.config.KEYWORDS.publishedYear.some(kw => kw in specData)) {
            this.setData('publicationYear', null, 90);
        }

        let pagesValue = '';
        for (const kw of this.config.KEYWORDS.pages) {
            if (specData[kw]) pagesValue = specData[kw];
        }
        if (pagesValue) this.setData('pages', this.utils.extractNumber(pagesValue), 90);
        else if (this.config.KEYWORDS.pages.some(kw => kw in specData)) this.setData('pages', null, 90);
    }

    async run() {
        await this.waitForPageSignals();
        this.extractFromSpecTable();
        this.extractFromMinhajPustakaShortDescription();
        this.runGenericFallback();
        this.extractPriceVariants();
        this.finalizePriceVariants();
        return this.buildResult();
    }
}
