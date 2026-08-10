import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePrice, normalizeYear, cleanAuthor, extractNumber } from './utils.js';

test('utility helpers expose expected parsing functions', () => {
  assert.equal(normalizePrice('Rp 125.000'), 125000);
  assert.equal(normalizePrice('Rp.62,000'), 62000, 'normalizePrice with comma thousands');
  assert.equal(normalizePrice('62,50'), 62.50, 'normalizePrice with comma decimal');
  assert.equal(normalizePrice('62.50'), 62.50, 'normalizePrice with dot decimal');
  assert.equal(normalizePrice('62'), 62, 'normalizePrice with integer');
  assert.equal(normalizePrice('Rp 1.234.567,89'), 1234567.89, 'normalizePrice with mixed thousands and decimal');
  assert.equal(normalizePrice('1234567.89'), 1234567.89, 'normalizePrice with dot decimal and no thousands');
  assert.equal(normalizePrice('1234567,89'), 1234567.89, 'normalizePrice with comma decimal and no thousands');
  assert.equal(normalizeYear('Terbit 2021'), 2021, 'normalizeYear extracts year');
  assert.equal(cleanAuthor('Penulis: Budi', ['penulis']), 'Budi', 'cleanAuthor cleans author text with "Penulis" keyword');
  assert.equal(cleanAuthor('Byzka Wibisono', ['by']), 'Byzka Wibisono', 'cleanAuthor should not remove "by" if it\'s part of the name');
  assert.equal(cleanAuthor('By John Doe', ['by']), 'John Doe', 'cleanAuthor should remove "by" prefix');
  assert.equal(cleanAuthor('By: Jane Doe', ['by']), 'Jane Doe', 'cleanAuthor should remove "by:" prefix');
  assert.equal(extractNumber('Halaman 320'), 320, 'extractNumber extracts number');
});
