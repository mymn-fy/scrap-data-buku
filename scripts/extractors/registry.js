// scripts/extractors/registry.js
// Satu-satunya tempat yang tahu "hostname mana pakai extractor mana".
// Menambah situs baru = tambah satu entri di sini + satu file extractor
// baru. Tidak perlu sentuh file situs lain.

import { GenericExtractor } from './generic.js';
import { MinhajPustakaExtractor } from './minhaj-pustaka.js';
import { GramediaExtractor } from './gramedia.js';
import { AnakHebatExtractor } from './anak-hebat.js';
import { DeepublishExtractor } from './deepublish.js';

// urutan tidak penting karena setiap pattern harus unik per domain,
// tapi ditaruh dari yang paling sering dipakai untuk memudahkan baca.
const SITE_EXTRACTORS = [
    { pattern: /(^|\.)gramedia\.com$/i, ExtractorClass: GramediaExtractor },
    { pattern: /(^|\.)deepublishstore\.com$/i, ExtractorClass: DeepublishExtractor },
    { pattern: /(^|\.)minhajpustaka\.id$/i, ExtractorClass: MinhajPustakaExtractor },
    // TODO: pastikan domain ini benar (lihat catatan di anak-hebat.js)
    { pattern: /(^|\.)anakhebatindonesia\.com$/i, ExtractorClass: AnakHebatExtractor },
];

export function resolveExtractorClass(hostname) {
    const found = SITE_EXTRACTORS.find(({ pattern }) => pattern.test(hostname));
    return found ? found.ExtractorClass : GenericExtractor;
}