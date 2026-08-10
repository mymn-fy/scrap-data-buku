// Default copy calculation rules
export const DEFAULT_RULES = [
  { maxPrice: 49999, copies: 3 },
  { maxPrice: 130000, copies: 2 },
  { maxPrice: Infinity, copies: 1 },
];

// Keywords for data extraction (Indonesian & English)
export const KEYWORDS = {
  author: ['penulis', 'pengarang', 'author', 'by', 'oleh'],
  publishedYear: ['tahun terbit', 'tanggal terbit', 'terbit', 'publication date', 'published', 'published date', 'year published'],
  pages: ['halaman', 'jumlah halaman', 'pages', 'number of pages'],
  isbn: ['isbn'],
};

// CSS selectors for potential price elements
export const PRICE_SELECTORS = [
  '.price', '[class*="price"]', '[id*="price"]',
  '.harga', '[class*="harga"]', '[id*="harga"]',
  '[itemprop="price"]'
];

// Words indicating a sale price (priority)
export const SALE_PRICE_KEYWORDS = [
  'sale', 'discount', 'promo', 'offer', 'jual'
];

// Words indicating an old/strikethrough price (to avoid)
export const OLD_PRICE_KEYWORDS = [
  'old', 'list', 'retail', 'coret', 'normal'
];

export function normalizePrice(priceValue) {
  if (priceValue === null || priceValue === undefined) return null;

  if (typeof priceValue === 'number') {
    return Number.isFinite(priceValue) ? Math.round(priceValue) : null;
  }

  const sanitized = String(priceValue)
    .replace(/[^0-9,.-]/g, '')
    .trim();

  if (!sanitized) return null;

  const hasComma = sanitized.includes(',');
  const hasDot = sanitized.includes('.');

  let normalized = sanitized;
  if (hasComma && hasDot) {
    const lastComma = sanitized.lastIndexOf(',');
    const lastDot = sanitized.lastIndexOf('.');
    if (lastComma > lastDot) {
      normalized = sanitized.replace(/\./g, '').replace(/,/g, '.');
    } else {
      normalized = sanitized.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = sanitized.split(',');
    if (parts.length > 1 && parts[1].length === 3) {
      normalized = parts.join('');
    } else {
      normalized = sanitized.replace(/,/g, '.');
    }
  } else if (hasDot) {
    const parts = sanitized.split('.');
    if (parts.length > 1 && parts[1].length === 3) {
      normalized = parts.join('');
    } else {
      normalized = sanitized.replace(/\./g, '');
    }
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

export function normalizeYear(dateValue) {
  if (!dateValue) return null;
  const match = String(dateValue).match(/\b(19|20)\d{2}\b/);
  return match ? Number.parseInt(match[0], 10) : null;
}

export function cleanAuthor(authorValue, authorKeywords = []) {
  if (!authorValue) return '';

  let cleaned = String(authorValue).trim();
  for (const keyword of authorKeywords) {
    const regex = new RegExp(`^${keyword}\\s*:?\\s*`, 'i');
    if (regex.test(cleaned)) {
      cleaned = cleaned.replace(regex, '').trim();
      break;
    }
  }

  return cleaned;
}

export function extractNumber(value) {
  if (!value) return null;
  const match = String(value).match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
}
