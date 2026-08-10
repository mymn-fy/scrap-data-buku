import { getCopyRules, saveCopyRules } from './scripts/storage.js';

const rulesContainer = document.getElementById('rules-container');
const addRuleBtn = document.getElementById('add-rule-btn');
const saveBtn = document.getElementById('save-btn');
const statusMessage = document.getElementById('status-message');

document.addEventListener('DOMContentLoaded', loadRules);
addRuleBtn.addEventListener('click', () => createRuleElement({ maxPrice: 150000, copies: 1 }));
saveBtn.addEventListener('click', saveRules);

async function loadRules() {
    const rules = await getCopyRules();
    rulesContainer.innerHTML = '';
    rules.forEach(createRuleElement);
}

function createRuleElement(rule) {
    const ruleDiv = document.createElement('div');
    ruleDiv.className = 'rule-item';

    const isLastRule = rule.maxPrice === Infinity;

    ruleDiv.innerHTML = `
        <label>${isLastRule ? 'Harga di atas:' : 'Harga sampai:'}</label>
        <input type="number" class="price-input" value="${isLastRule ? '' : rule.maxPrice}" ${isLastRule ? 'disabled' : ''} placeholder="e.g., 70000">
        <label>→ Eksemplar:</label>
        <input type="number" class="copies-input" value="${rule.copies}" min="0">
        <button class="delete-rule-btn" title="Hapus Aturan">×</button>
    `;

    ruleDiv.querySelector('.delete-rule-btn').addEventListener('click', () => {
        ruleDiv.remove();
    });

    rulesContainer.appendChild(ruleDiv);
}

async function saveRules() {
    const ruleElements = rulesContainer.querySelectorAll('.rule-item');
    let rules = [];
    let lastPrice = -1;

    ruleElements.forEach((el, index) => {
        const priceInput = el.querySelector('.price-input');
        const copiesInput = el.querySelector('.copies-input');
        
        // The last rule is always "Infinity"
        if (index === ruleElements.length - 1) {
            rules.push({
                maxPrice: Infinity,
                copies: parseInt(copiesInput.value) || 1
            });
        } else {
            const price = parseInt(priceInput.value);
            if (!isNaN(price) && price > lastPrice) {
                rules.push({
                    maxPrice: price,
                    copies: parseInt(copiesInput.value) || 0
                });
                lastPrice = price;
            }
        }
    });

    // Sort rules to ensure they are in correct order before saving
    rules.sort((a, b) => a.maxPrice - b.maxPrice);

    await saveCopyRules(rules);
    
    statusMessage.textContent = 'Pengaturan berhasil disimpan!';
    setTimeout(() => statusMessage.textContent = '', 3000);

    // Reload the UI to reflect sorted and cleaned state
    loadRules();
}
