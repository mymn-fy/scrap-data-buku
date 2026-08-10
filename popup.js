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
    copyBtn.addEventListener('click', () => copyData());
    editBtn.addEventListener('click', toggleEditMode);
    saveBtn.addEventListener('click', saveEditedData);
});

async function runScraper() {
    showLoadingState();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Inject and execute the scraper function
    try {
        // Inject all necessary module files first into the isolated world
        await chrome.scripting.executeScript({
            target: { tabId: tab.id }, // Target the current active tab
            files: ['scripts/utils.js', 'scripts/config.js', 'scripts/extractor.js'],
        });

        // Now, execute a function that dynamically imports and calls the exported scraping function
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

    if (copyHeaderCheckbox?.checked) {
        const headerString = headerOrder.join(separator);
        textToCopy = `${headerString}\n${textToCopy}`;
    }

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
