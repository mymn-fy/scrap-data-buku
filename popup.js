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
const rescanBtn = document.getElementById('rescan-btn');
const editBtn = document.getElementById('edit-btn');
const priceModeRow = document.getElementById('price-mode-row');
const useDiscountPriceCheckbox = document.getElementById('use-discount-price');
const autoRecalculateCheckbox = document.getElementById('auto-recalculate');

const DRAFT_KEY = 'bookScraperDraft';
let saveDraftTimeout = null;

let currentBookData = null;
let copyRules = [];
let isEditMode = false;

// --- Main Logic ---

document.addEventListener('DOMContentLoaded', async () => {
    copyRules = await getCopyRules();

    const draft = await loadDraft();
    if (draft && draft.bookData && 'originalPrice' in draft.bookData) {
        restoreDraft(draft);
    } else {
        if (draft) await clearDraft();
        runScraper();
    }

    rescanBtn.addEventListener('click', async () => {
        await clearDraft();
        runScraper();
    });
    copyBtn.addEventListener('click', () => copyData());
    editBtn.addEventListener('click', handleEditButtonClick);
    useDiscountPriceCheckbox.addEventListener('change', () => {
        if (!currentBookData) return;
        currentBookData.price = resolvePrice(currentBookData);
        currentBookData.recommendedCopies = calculateCopies(currentBookData.price, copyRules);
        renderTable(currentBookData, isEditMode);
        saveSnapshot();
    });
});

async function runScraper() {
    showLoadingState();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    try {
        // Muat modul secara dinamis dan jalankan fungsi ekstraksi
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: async () => {
                const utilsModule = await import(chrome.runtime.getURL('scripts/utils.js'));
                const configModule = await import(chrome.runtime.getURL('scripts/config.js'));
                const extractorModule = await import(chrome.runtime.getURL('scripts/extractor.js'));
                return await extractorModule.performScraping(utilsModule, configModule);
            },
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
    currentBookData.price = resolvePrice(currentBookData);
    currentBookData.recommendedCopies = calculateCopies(currentBookData.price, copyRules);

    const hasBothPrices = currentBookData.originalPrice != null && currentBookData.discountPrice != null
        && currentBookData.originalPrice !== currentBookData.discountPrice;
    priceModeRow.classList.toggle('hidden', !hasBothPrices);

    updateUI(currentBookData);
    saveSnapshot();
}

function resolvePrice(data) {
    const useDiscount = useDiscountPriceCheckbox.checked;
    if (useDiscount && data.discountPrice != null) return data.discountPrice;
    if (data.originalPrice != null) return data.originalPrice;
    return data.discountPrice ?? data.price ?? null;
}

// --- UI Update Functions ---

function showLoadingState() {
    statusText.textContent = 'Mengekstrak data dari halaman...';
    resultsArea.classList.add('hidden');
    confidenceBar.style.width = '0%';
    confidenceText.textContent = '';
    editBtn.textContent = 'Edit Data';
    editBtn.classList.remove('save-mode');
    document.querySelector('.edit-controls').classList.add('hidden');
    isEditMode = false;
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

function handleEditButtonClick() {
    if (!isEditMode) {
        enterEditMode();
    } else {
        saveEditedData();
    }
}

function enterEditMode() {
    renderTable(currentBookData, true);
    editBtn.textContent = 'Simpan';
    editBtn.classList.add('save-mode');
    document.querySelector('.edit-controls').classList.remove('hidden');
    isEditMode = true;
    attachDraftListeners();
    saveSnapshot();
}

function saveEditedData() {
    currentBookData.title = document.getElementById('edit-title').value;
    currentBookData.author = document.getElementById('edit-author').value;
    currentBookData.publicationYear = parseInt(document.getElementById('edit-publicationYear').value) || null;
    currentBookData.price = parseFloat(document.getElementById('edit-price').value) || null;
    currentBookData.pages = parseInt(document.getElementById('edit-pages').value) || null;

    if (autoRecalculateCheckbox.checked) {
        currentBookData.recommendedCopies = calculateCopies(currentBookData.price, copyRules);
    } else {
        currentBookData.recommendedCopies = parseInt(document.getElementById('edit-recommendedCopies').value) || 0;
    }

    renderTable(currentBookData, false);
    editBtn.textContent = 'Edit Data';
    editBtn.classList.remove('save-mode');
    document.querySelector('.edit-controls').classList.add('hidden');
    isEditMode = false;
    saveSnapshot();
}

// --- Persistensi draf ke chrome.storage ---

function collectDraftValues() {
    return {
        title: document.getElementById('edit-title')?.value ?? '',
        author: document.getElementById('edit-author')?.value ?? '',
        publicationYear: document.getElementById('edit-publicationYear')?.value ?? '',
        price: document.getElementById('edit-price')?.value ?? '',
        pages: document.getElementById('edit-pages')?.value ?? '',
        recommendedCopies: document.getElementById('edit-recommendedCopies')?.value ?? '',
    };
}

function attachDraftListeners() {
    resultsTable.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', scheduleDraftSave);
    });
}

function scheduleDraftSave() {
    clearTimeout(saveDraftTimeout);
    saveDraftTimeout = setTimeout(saveSnapshot, 300);
}

async function saveSnapshot() {
    if (!currentBookData) return;
    const snapshot = {
        bookData: currentBookData,
        isEditMode,
        values: isEditMode ? collectDraftValues() : null,
        autoRecalculate: autoRecalculateCheckbox.checked,
        useDiscount: useDiscountPriceCheckbox.checked,
    };
    await chrome.storage.local.set({ [DRAFT_KEY]: snapshot });
}

async function loadDraft() {
    const stored = await chrome.storage.local.get(DRAFT_KEY);
    return stored[DRAFT_KEY] || null;
}

async function clearDraft() {
    await chrome.storage.local.remove(DRAFT_KEY);
}

function restoreDraft(draft) {
    currentBookData = draft.bookData;
    autoRecalculateCheckbox.checked = draft.autoRecalculate;
    useDiscountPriceCheckbox.checked = draft.useDiscount ?? false;

    const hasBothPrices = currentBookData.originalPrice != null && currentBookData.discountPrice != null
        && currentBookData.originalPrice !== currentBookData.discountPrice;
    priceModeRow.classList.toggle('hidden', !hasBothPrices);

    currentBookData.price = resolvePrice(currentBookData);

    statusText.textContent = '✓ Buku terdeteksi! (melanjutkan editan sebelumnya)';
    resultsArea.classList.remove('hidden');
    confidenceBar.style.width = `${currentBookData.confidence || 0}%`;
    confidenceText.textContent = '';

    if (draft.isEditMode) {
        renderTable(currentBookData, true);
        document.getElementById('edit-title').value = draft.values.title;
        document.getElementById('edit-author').value = draft.values.author;
        document.getElementById('edit-publicationYear').value = draft.values.publicationYear;
        document.getElementById('edit-price').value = draft.values.price;
        document.getElementById('edit-pages').value = draft.values.pages;
        document.getElementById('edit-recommendedCopies').value = draft.values.recommendedCopies;

        editBtn.textContent = 'Simpan';
        editBtn.classList.add('save-mode');
        document.querySelector('.edit-controls').classList.remove('hidden');
        isEditMode = true;
        attachDraftListeners();
    } else {
        renderTable(currentBookData, false);
    }
}

function handlePriceEdit(event) {
    if (autoRecalculateCheckbox.checked) {
        const newPrice = parseInt(event.target.value) || 0;
        const newCopies = calculateCopies(newPrice, copyRules);
        document.getElementById('edit-recommendedCopies').value = newCopies;
    }
}

function copyData() {
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Tersalin!';
    copyBtn.disabled = true;

    if (!currentBookData) {
        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.disabled = false;
        }, 1500);
        return;
    }

    const separator = '\t';
    const headerOrder = ['Judul Buku', 'Nama Penulis', 'Tahun Terbit', 'Harga Buku', 'Halaman', 'Eksemplar'];
    const dataOrder = ['title', 'author', 'publicationYear', 'price', 'pages', 'recommendedCopies'];

    const normalizeForClipboard = (value) => {
        if (value === null || value === undefined) return '';
        return String(value).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
    };

    let dataArray = dataOrder.map(key => {
        if (key === 'price') {
            return normalizeForClipboard(`Rp${(currentBookData[key] || 0).toLocaleString('id-ID')}`);
        }
        return normalizeForClipboard(currentBookData[key]);
    });

    let textToCopy = dataArray.join(separator);
    // Menghapus bagian ini agar header tidak ikut tersalin.
    // Jika Anda ingin mengaktifkan kembali opsi penyalinan header, Anda bisa mengembalikan baris kode di atas.
    navigator.clipboard.writeText(textToCopy).then(() => {
        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.disabled = false;
        }, 1500);
    }).catch(err => {
        console.error('Gagal menyalin:', err);
        copyBtn.textContent = 'Gagal';
        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.disabled = false;
        }, 1500);
    });
}
