// scripts/extractors/deepublish.js
// Hanya jalan di deepublishstore.com (lihat registry.js).
//
// CATATAN PENTING (revisi ke-2, berdasar HTML asli yang dikirim user):
// - Detail buku (Penulis/Tahun/Halaman) TIDAK ada di class generik seperti
//   .book-detail/.product_meta/.specs/.book-info (versi lama nebak salah).
//   Yang benar-benar ada: `.woocommerce-product-details__short-description
//   table.table-striped` -- persis struktur yang sama dipakai Minhaj Pustaka,
//   karena dua-duanya WooCommerce dengan widget short-description yang sama.
// - Harga SENGAJA tidak ditangani manual di sini. Versi sebelumnya pakai
//   `.woocommerce-Price-amount` yang ambigu (cocok baik ke <del> harga lama
//   MAUPUN <ins> harga sekarang) -- querySelector cuma ambil yang pertama
//   ketemu di DOM, yaitu <del> (harga lama), jadi salah. GenericExtractor
//   (base.js: extractPriceVariants) sudah benar menangani pola <del>/<ins>
//   WooCommerce ini via deteksi strikethrough, jadi biarkan itu yang bekerja.

import { GenericExtractor } from './generic.js';

export class DeepublishExtractor extends GenericExtractor {
    async waitForPageSignals(timeoutMs = 4000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const titleSignal = document.querySelector('h1.product_title');
            const specTable = document.querySelector('.woocommerce-product-details__short-description table.table-striped');
            const priceSignal = document.querySelector('p.price');
            if (titleSignal || specTable || priceSignal) break;
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }

    // Tabel "Detail dan Spesifikasi" -- sumber Penulis/Tahun/Halaman yang
    // sebenarnya. Logikanya sengaja sama dengan minhaj-pustaka.js karena
    // markup-nya memang identik (WooCommerce short-description widget).
    extractFromSpecTable() {
        const specTableContainer = document.querySelector('.woocommerce-product-details__short-description');
        if (!specTableContainer) return;

        const specTable = specTableContainer.querySelector('table.table-striped');
        if (!specTable) return;

        const specData = {};
        specTable.querySelectorAll('tr').forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
                const label = this.utils.cleanText(cells[0].textContent).toLowerCase();
                const value = this.utils.cleanText(cells[1].textContent);
                specData[label] = value;
            }
        });

        if (specData['penulis']) {
            this.setData('author', this.utils.cleanAuthor(specData['penulis'], this.config.KEYWORDS.author), 90);
        }
        if (specData['tahun']) {
            this.setData('publicationYear', this.utils.normalizeYear(specData['tahun']), 90);
        }
        if (specData['halaman']) {
            this.setData('pages', this.utils.extractNumber(specData['halaman']), 90);
        }
    }

    // Judul dari h1.product_title -- stabil, confidence lebih tinggi
    // daripada fallback generik.
    extractTitle() {
        const titleText = this.getVisibleText('h1.product_title', 'title');
        if (titleText) this.setData('title', titleText, 90);
    }

    async run() {
        await this.waitForPageSignals();
        this.extractTitle();
        this.extractFromSpecTable();
        this.runGenericFallback();
        this.extractPriceVariants();
        this.finalizePriceVariants();
        return this.buildResult();
    }
}