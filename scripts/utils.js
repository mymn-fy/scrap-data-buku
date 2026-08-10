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
    return Number.isFinite(priceValue) ? priceValue : null; // Return as is if already a number
  }

  let cleaned = String(priceValue)
    .replace(/[^0-9,.]/g, '') // Remove all non-numeric characters except commas and dots
    .trim();

  if (!cleaned) return null;

  // Determine the decimal separator
  const lastCommaIndex = cleaned.lastIndexOf(',');
  const lastDotIndex = cleaned.lastIndexOf('.');

  let thousandsSeparator = '';
  let decimalSeparator = '';

  // Case 1: Both comma and dot exist
  if (lastCommaIndex > -1 && lastDotIndex > -1) {
    if (lastCommaIndex > lastDotIndex) {
      // Example: "1.234.567,89" -> comma is decimal, dot is thousands
      decimalSeparator = ',';
      thousandsSeparator = '.';
    } else {
      // Example: "1,234,567.89" -> dot is decimal, comma is thousands
      decimalSeparator = '.';
      thousandsSeparator = ',';
    }
  }
  // Case 2: Only commas exist
  else if (lastCommaIndex > -1) {
    // If the part after the comma has exactly 2 digits, it's likely a decimal (e.g., "62,50")
    // Otherwise, it's likely a thousands separator (e.g., "62,000")
    if (cleaned.substring(lastCommaIndex + 1).length === 2) {
      decimalSeparator = ',';
    } else {
      thousandsSeparator = ',';
    }
  }
  // Case 3: Only dots exist
  else if (lastDotIndex > -1) {
    // If the part after the dot has exactly 2 digits, it's likely a decimal (e.g., "62.50")
    // Otherwise, it's likely a thousands separator (e.g., "62.000")
    if (cleaned.substring(lastDotIndex + 1).length === 2) {
      decimalSeparator = '.';
    } else {
      thousandsSeparator = '.';
    }
  }

  // Remove thousands separators
  if (thousandsSeparator) {
    cleaned = cleaned.replace(new RegExp('\\' + thousandsSeparator, 'g'), '');
  }

  // Replace decimal separator with a dot for parseFloat
  if (decimalSeparator) {
    cleaned = cleaned.replace(decimalSeparator, '.');
  }

  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeYear(dateValue) {
  if (!dateValue) return null;
  const match = String(dateValue).match(/\b(19|20)\d{2}\b/);
  return match ? Number.parseInt(match[0], 10) : null;
}

export function cleanTitle(titleValue) {
  if (!titleValue) return '';

  let cleaned = String(titleValue).trim();
  if (!cleaned) return '';

  cleaned = cleaned.replace(/\s+/g, ' ');

  const separatorParts = cleaned
    .split(/\s*(?:\||\/|-|–|—)\s*/)
    .map(part => part.trim())
    .filter(Boolean);

  const siteRegex = /\b(toko buku online terbesar|gramedia|gramedia\.com|tokopedia|shopee|bukalapak|blibli|lazada|amazon)\b/i;
  const leadActionRegex = /^(jual|beli|pesan|order)\s+/i;

  if (separatorParts.length > 1) {
    const preferred = separatorParts.find(part => !siteRegex.test(part) && !leadActionRegex.test(part));
    if (preferred) {
      cleaned = preferred;
    }
  }

  cleaned = cleaned.replace(leadActionRegex, '');
  cleaned = cleaned.replace(/\b(promo|diskon|terbaru|terlaris|best seller)\b/gi, '');
  cleaned = cleaned.replace(siteRegex, '');
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  return cleaned;
}

export function cleanAuthor(authorValue, authorKeywords = []) {
  if (!authorValue) return '';

  let cleaned = String(authorValue).trim();
  for (const keyword of authorKeywords) {
    let regex;
    if (keyword.toLowerCase() === 'by') {
      // Specific regex for 'by' to ensure it's a standalone prefix, not part of a name like 'Byzka'
      regex = new RegExp(`^${keyword}\\b\\s*:?\\s*`, 'i');
    } else {
      // General regex for other keywords
      regex = new RegExp(`^${keyword}\\s*:?\\s*`, 'i');
    }
    if (regex.test(cleaned)) {
      cleaned = cleaned.replace(regex, '').trim();
      break;
    }
  }

  cleaned = cleaned.replace(/\s*\|\s*/g, ' ')
    .replace(/\b(toko buku online terbesar|gramedia|gramedia\.com)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return cleaned;
}

export function cleanText(value) {
  if (!value) return '';
  return String(value)
    .replace(/\s*\|\s*/g, ' ')
    .replace(/\b(toko buku online terbesar|gramedia|gramedia\.com)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function extractNumber(value) {
  if (!value) return null;
  const match = String(value).match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
}
