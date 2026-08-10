import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePrice, normalizeYear, cleanAuthor, extractNumber } from './utils.js';

test('utility helpers expose expected parsing functions', () => {
  assert.equal(normalizePrice('Rp 125.000'), 125000);
  assert.equal(normalizeYear('Terbit 2021'), 2021);
  assert.equal(cleanAuthor('Penulis: Budi', ['penulis', 'pengarang']), 'Budi');
  assert.equal(extractNumber('Halaman 320'), 320);
});
