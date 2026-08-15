// scripts/extractor.js
// Entrypoint yang di-import dinamis oleh popup.js lewat chrome.runtime.getURL().
// Tugasnya sekarang cuma satu: tentukan situs mana yang sedang dibuka, lalu
// serahkan ke extractor yang sesuai. Logika ekstraksi per-situs sudah
// dipindah ke ./extractors/*.js — lihat registry.js untuk peta hostname.
//
// PENTING: nama export performScraping() sengaja dipertahankan sama
// persis dengan versi lama, karena popup.js memanggilnya lewat nama ini.

import { resolveExtractorClass } from './extractors/registry.js';

export async function performScraping(utilsModule, configModule) {
    const hostname = window.location.hostname;
    const ExtractorClass = resolveExtractorClass(hostname);
    const extractor = new ExtractorClass(utilsModule, configModule);
    const result = await extractor.run();

    console.log('[Book Scraper debug]', {
        hostname,
        extractor: ExtractorClass.name,
        price: result.price,
        originalPrice: result.originalPrice,
        discountPrice: result.discountPrice,
        confidence: result.confidence,
    });

    return result;
}
