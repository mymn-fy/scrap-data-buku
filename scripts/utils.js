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
