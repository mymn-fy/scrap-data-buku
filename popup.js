import { getCopyRules } from './scripts/storage.js';
import { calculateCopies } from './scripts/calculator.js';
import { normalizePrice } from './scripts/utils.js';

// --- DOM Elements ---
const statusText = document.getElementById('status-text');
const confidenceBar = document.getElementById('confidence-bar');
const confidenceText = document.getElementById('confidence-text');
const resultsArea = document.getElementById('results-area');
const resultsTable = document.getElementById('results-table');
const copyBtn = document.getElementById('copy-btn');
const copyTsvBtn = document.getElementById('copy-tsv-btn');
const rescanBtn = document.getElementById('rescan-btn');
const editBtn = document.getElementById('edit-btn');
const saveBtn = document.getElementById('save-btn');
const autoRecalculateCheckbox = document.getElementById('auto-recalculate');
const copyHeaderCheckbox = document.getElementById('copy-header-checkbox');

let currentBookData = null;
let copyRules = [];

// --- Main Logic ---

document.addEventListener('DOMContentLoaded', async () => {
    copyRules = await getCopyRules();
    runScraper();

    rescanBtn.addEventListener('click', runScraper);
    copyBtn.addEventListener('click', () => copyData(false));
    copyTsvBtn.addEventListener('click', () => copyData(true));
    editBtn.addEventListener('click', toggleEditMode);
    saveBtn.addEventListener('click', saveEditedData);
});

async function runScraper() {
    showLoadingState();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Inject and execute the scraper function
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: pageScraper,
        });
        
        if (results && results[0] && results[0].result) {
            processScrapedData(results[0].result);
        } else {
            showError('Tidak ada data yang diterima dari halaman.');
        }
    } catch (e) {
        console.error('Error running scraper:', e);
        showError(`Gagal menjalankan skrip: ${e.message}`);
    }
}

function processScrapedData(data) {
    if (data.error) {
        showError(data.error);
        return;
    }

    currentBookData = data;
    // Calculate recommended copies
    currentBookData.recommendedCopies = calculateCopies(currentBookData.price, copyRules);
    
    updateUI(currentBookData);
}

// --- UI Update Functions ---

function showLoadingState() {
    statusText.textContent = 'Mengekstrak data dari halaman...';
    resultsArea.classList.add('hidden');
    confidenceBar.style.width = '0%';
    confidenceText.textContent = '';
}

function showError(message) {
    statusText.textContent = `Error: ${message}`;
    confidenceBar.style.width = '0%';
    confidenceText.textContent = '';
}

function updateUI(data) {
    if (data.confidence < 40) {
        statusText.textContent = 'Data buku tidak dapat dideteksi dengan yakin.';
        confidenceText.textContent = `Keyakinan: ${data.confidence}% (Rendah)`;
    } else {
        statusText.textContent = '✓ Buku terdeteksi!';
        resultsArea.classList.remove('hidden');
    }

    // Update confidence bar
    confidenceBar.style.width = `${data.confidence}%`;
    if (data.confidence >= 80) {
        confidenceBar.style.backgroundColor = '#188038'; // Green
        confidenceText.textContent = `Keyakinan: ${data.confidence}% (Sangat Baik)`;
    } else if (data.confidence >= 60) {
        confidenceBar.style.backgroundColor = '#fbbc04'; // Yellow
        confidenceText.textContent = `Keyakinan: ${data.confidence}% (Perlu Diperiksa)`;
    } else {
        confidenceBar.style.backgroundColor = '#d93025'; // Red
        confidenceText.textContent = `Keyakinan: ${data.confidence}% (Kurang Meyakinkan)`;
    }

    renderTable(data);
}

function renderTable(data, isEditMode = false) {
    const fields = {
        'Judul': { value: data.title, id: 'title' },
        'Penulis': { value: data.author, id: 'author' },
        'Tahun Terbit': { value: data.publicationYear, id: 'publicationYear', type: 'number' },
        'Harga': { value: data.price, id: 'price', formatted: `Rp${(data.price || 0).toLocaleString('id-ID')}` },
        'Halaman': { value: data.pages, id: 'pages', type: 'number' },
        'Eksemplar': { value: data.recommendedCopies, id: 'recommendedCopies', type: 'number' },
    };

    resultsTable.innerHTML = '';
    for (const [label, item] of Object.entries(fields)) {
        const row = resultsTable.insertRow();
        const cell1 = row.insertCell();
        const cell2 = row.insertCell();
        cell1.textContent = label;

        if (isEditMode && item.id !== 'price') { // Price formatted separately
            const input = document.createElement('input');
            input.type = item.type || 'text';
            input.id = `edit-${item.id}`;
            input.value = item.value || '';
            cell2.appendChild(input);
        } else if (isEditMode && item.id === 'price') {
             const input = document.createElement('input');
             input.type = 'number';
             input.id = 'edit-price';
             input.value = item.value || '';
             cell2.appendChild(input);
             input.addEventListener('input', handlePriceEdit);
        } else {
            let displayValue = item.value;
            if (item.id === 'price') displayValue = item.formatted;
            cell2.textContent = displayValue || 'Tidak ditemukan';
        }
    }
}

// --- Interaction Handlers ---

function toggleEditMode() {
    renderTable(currentBookData, true);
    editBtn.classList.add('hidden');
    saveBtn.classList.remove('hidden');
    document.querySelector('.edit-controls').classList.remove('hidden');
}

function saveEditedData() {
    // Update currentBookData from input fields
    currentBookData.title = document.getElementById('edit-title').value;
    currentBookData.author = document.getElementById('edit-author').value;
    currentBookData.publicationYear = parseInt(document.getElementById('edit-publicationYear').value) || null;
    currentBookData.price = parseInt(document.getElementById('edit-price').value) || null;
    currentBookData.pages = parseInt(document.getElementById('edit-pages').value) || null;
    
    if (autoRecalculateCheckbox.checked) {
        currentBookData.recommendedCopies = calculateCopies(currentBookData.price, copyRules);
    } else {
        currentBookData.recommendedCopies = parseInt(document.getElementById('edit-recommendedCopies').value) || 0;
    }

    renderTable(currentBookData, false);
    editBtn.classList.remove('hidden');
    saveBtn.classList.add('hidden');
    document.querySelector('.edit-controls').classList.add('hidden');
}

function handlePriceEdit(event) {
    if (autoRecalculateCheckbox.checked) {
        const newPrice = parseInt(event.target.value) || 0;
        const newCopies = calculateCopies(newPrice, copyRules);
        document.getElementById('edit-recommendedCopies').value = newCopies;
    }
}

function copyData(asTsv = false) {
    const separator = asTsv ? '\t' : ' | ';
    const headerOrder = ['Judul Buku', 'Nama Penulis', 'Tahun Terbit', 'Harga Buku', 'Halaman', 'Eksemplar'];
    const dataOrder = ['title', 'author', 'publicationYear', 'price', 'pages', 'recommendedCopies'];
    
    let dataArray = dataOrder.map(key => {
        if (key === 'price') {
            return `Rp${(currentBookData[key] || 0).toLocaleString('id-ID')}`;
        }
        return currentBookData[key] || '';
    });

    let textToCopy = dataArray.join(separator);

    if (copyHeaderCheckbox.checked) {
        const headerString = headerOrder.join(separator);
        textToCopy = `${headerString}\n${textToCopy}`;
    }

    navigator.clipboard.writeText(textToCopy).then(() => {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Tersalin!';
        copyTsvBtn.textContent = 'Tersalin!';
        setTimeout(() => {
            copyBtn.textContent = 'Salin Data';
            copyTsvBtn.textContent = 'Salin sebagai TSV';
        }, 1500);
    }).catch(err => {
        console.error('Gagal menyalin:', err);
    });
}


// --- Injected Scraper Function ---
// This function will be serialized and executed on the web page.
// It CANNOT access variables from the popup.js scope.
function pageScraper() {
    // This function is injected, so it needs its own logic.
    // It simulates the modular loading for the injection context.
    
    // --- Start of embedded utils.js ---
    const utils = {
        normalizePrice: (priceStr) => {
            if (!priceStr || typeof priceStr !== 'string') return null;
            const numStr = priceStr.replace(/[Rp|IDR|\s|\.,-]/g, '');
            const price = parseInt(numStr.replace(/00$/, ''), 10); // Also remove trailing ,00
            return isNaN(price) ? null : price;
        },
        normalizeYear: (dateStr) => {
            if (!dateStr || typeof dateStr !== 'string') return null;
            const match = dateStr.match(/\b(19|20)\d{2}\b/);
            return match ? parseInt(match[0], 10) : null;
        },
        cleanAuthor: (authorStr, authorKeywords) => {
            if (!authorStr) return '';
            let cleaned = authorStr.trim();
            for (const keyword of authorKeywords) {
                const regex = new RegExp(`^${keyword}\\s*:?\\s*`, 'i');
                if (regex.test(cleaned)) {
                    cleaned = cleaned.replace(regex, '').trim();
                    break;
                }
            }
            return cleaned;
        },
        extractNumber: (str) => {
            if (!str || typeof str !== 'string') return null;
            const match = str.match(/\d+/);
            return match ? parseInt(match[0], 10) : null;
        }
    };
    // --- End of embedded utils.js ---

    // --- Start of embedded config.js ---
    const config = {
        KEYWORDS: {
            author: ['penulis', 'pengarang', 'author', 'by', 'oleh'],
            publishedYear: ['tahun terbit', 'tanggal terbit', 'terbit', 'publication date', 'published', 'published date', 'year published'],
            pages: ['halaman', 'jumlah halaman', 'pages', 'number of pages'],
            isbn: ['isbn'],
        },
        PRICE_SELECTORS: ['.price', '[class*="price"]', '[id*="price"]', '.harga', '[class*="harga"]', '[id*="harga"]', '[itemprop="price"]'],
        SALE_PRICE_KEYWORDS: ['sale', 'discount', 'promo', 'offer', 'jual'],
        OLD_PRICE_KEYWORDS: ['old', 'list', 'retail', 'coret', 'normal']
    };
    // --- End of embedded config.js ---

    // --- Start of embedded extractor.js ---
    class Extractor {
        constructor() {
            this.data = { title: "", author: "", publicationYear: null, price: null, pages: null };
            this.confidence = { title: 0, author: 0, publicationYear: 0, price: 0, pages: 0 };
        }

        extractBookData() {
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
            if (value && (!this.data[field] || this.confidence[field] < score)) {
                this.data[field] = value;
                this.confidence[field] = score;
            } else if (value && this.confidence[field] > 0) {
                this.confidence[field] += Math.round(score / 5);
            }
        }

        extractFromJsonLd() {
            const scripts = document.querySelectorAll('script[type="application/ld+json"]');
            scripts.forEach(script => {
                try {
                    const json = JSON.parse(script.textContent);
                    const graph = json['@graph'] || (Array.isArray(json) ? json : [json]);
                    graph.forEach(node => {
                        if (node['@type'] === 'Book' || (node['@type'] === 'Product' && (node.isbn || node.numberOfPages))) {
                            this.setData('title', node.name, 40);
                            if (node.author) {
                                const authorName = Array.isArray(node.author) ? node.author.map(a => a.name || a).join(', ') : (node.author.name || node.author);
                                this.setData('author', authorName, 40);
                            }
                            if (node.offers) {
                                const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
                                const price = utils.normalizePrice(String(offer.price || offer.priceSpecification?.price));
                                if (price) this.setData('price', price, 40);
                            }
                            this.setData('publicationYear', utils.normalizeYear(node.datePublished), 40);
                            this.setData('pages', utils.extractNumber(String(node.numberOfPages)), 40);
                        }
                    });
                } catch (e) {}
            });
        }

        extractFromMeta() {
            const meta = (prop) => document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`)?.content;
            this.setData('title', meta('og:title') || meta('twitter:title'), 30);
            this.setData('author', meta('book:author') || meta('author'), 30);
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
            document.querySelectorAll('p, span, div, td, li, dt, dd').forEach(node => {
                const text = node.textContent.trim().toLowerCase();
                if (text.length > 35 || text.length < 3) return;

                Object.keys(config.KEYWORDS).forEach(field => {
                    if (config.KEYWORDS[field].some(kw => text.startsWith(kw))) {
                        let valueNode = node.nextElementSibling || node.parentElement.nextElementSibling;
                        let valueText = valueNode ? valueNode.textContent.trim() : '';

                        if (!valueText && text.includes(':')) {
                            valueText = text.split(':').slice(1).join(':').trim();
                        }
                        
                        if (valueText) {
                            switch (field) {
                                case 'author': this.setData('author', utils.cleanAuthor(valueText, config.KEYWORDS.author), 15); break;
                                case 'publishedYear': this.setData('publicationYear', utils.normalizeYear(valueText), 15); break;
                                case 'pages': this.setData('pages', utils.extractNumber(valueText), 15); break;
                            }
                        }
                    }
                });
            });
        }

        extractFromVisibleText() {
            if (this.confidence.title < 10) {
                const h1 = document.querySelector('h1');
                if (h1) this.setData('title', h1.textContent.trim(), 10);
            }
            if (this.confidence.price < 10) {
                const candidates = [];
                document.querySelectorAll(config.PRICE_SELECTORS.join(', ')).forEach(el => {
                    const price = utils.normalizePrice(el.textContent);
                    if (price) {
                        const isStrikethrough = window.getComputedStyle(el).textDecoration.includes('line-through') || el.closest('s, del');
                        if (!isStrikethrough) candidates.push(price);
                    }
                });
                if (candidates.length > 0) this.setData('price', Math.min(...candidates), 10);
            }
        }
    }
    // --- End of embedded extractor.js ---

    try {
        const extractor = new Extractor();
        return extractor.extractBookData();
    } catch (e) {
        return { error: e.toString() };
    }
}
