# Book Scraper & Smart Copy Calculator

![Extension Icon](Icons/icon128-dark.png)

Ekstensi Chrome ini dirancang untuk membantu pengguna mengekstrak data buku dari halaman produk e-commerce tertentu dan menghitung jumlah eksemplar yang direkomendasikan berdasarkan aturan harga yang dapat dikonfigurasi. Data yang diekstrak dapat dengan mudah disalin ke clipboard untuk analisis lebih lanjut.

## Fitur

- **Ekstraksi Data Buku Otomatis:** Secara cerdas mengidentifikasi dan mengekstrak informasi penting buku seperti Judul, Penulis, Tahun Terbit, Harga, dan Jumlah Halaman dari halaman produk.
- **Dukungan Multi-Situs:** Dirancang untuk bekerja dengan situs e-commerce buku populer seperti Minhaj Pustaka, Gramedia, dan Anak Hebat Indonesia.
- **Kalkulator Eksemplar Cerdas:** Menghitung jumlah eksemplar buku yang direkomendasikan berdasarkan harga buku dan seperangkat aturan yang dapat disesuaikan.
- **Antarmuka Pengguna Interaktif:** Menampilkan data yang diekstrak dalam tabel yang jelas di popup ekstensi.
- **Mode Edit:** Memungkinkan pengguna untuk mengedit data yang diekstrak secara manual sebelum menyalinnya.
- **Salin ke Clipboard:** Menyalin data buku yang diekstrak (tanpa header) ke clipboard dalam format tab-separated, siap untuk ditempelkan ke spreadsheet atau aplikasi lain.
- **Sistem Kepercayaan (Confidence Score):** Menunjukkan seberapa yakin ekstensi dalam keakuratan data yang diekstrak.
- **Pengaturan yang Dapat Disesuaikan:** Atur aturan perhitungan eksemplar Anda sendiri melalui halaman pengaturan ekstensi.

## Situs Web yang Didukung

Ekstensi ini memiliki logika ekstraksi khusus untuk:

- Minhaj Pustaka
- Gramedia
- Anak Hebat Indonesia

Ekstraksi generik juga diterapkan untuk situs lain, meskipun dengan tingkat kepercayaan yang lebih rendah.

## Instalasi

Untuk menginstal ekstensi ini di Google Chrome:

1.  Unduh repositori ini sebagai file ZIP dan ekstrak isinya.
2.  Buka Chrome dan navigasikan ke `chrome://extensions`.
3.  Aktifkan "Developer mode" (Mode Pengembang) di sudut kanan atas.
4.  Klik "Load unpacked" (Muat ekstensi yang belum dikemas) dan pilih folder tempat Anda mengekstrak repositori ini.
5.  Ekstensi "Book Scraper & Smart Copy Calculator" akan muncul di daftar ekstensi Anda.

## Penggunaan

1.  **Navigasi:** Buka halaman produk buku di salah satu situs web yang didukung (misalnya, Minhaj Pustaka, Gramedia, Anak Hebat Indonesia).
2.  **Buka Ekstensi:** Klik ikon ekstensi "Book Scraper & Smart Copy Calculator" di bilah alat Chrome Anda.
3.  **Ekstraksi Otomatis:** Ekstensi akan secara otomatis mencoba mengekstrak data buku dari halaman yang sedang aktif. Anda akan melihat status dan skor kepercayaan.
4.  **Lihat Data:** Data yang diekstrak akan ditampilkan dalam tabel di popup.
5.  **Edit Data (Opsional):**
    - Klik tombol "Edit" untuk masuk ke mode edit.
    - Ubah nilai apa pun yang diperlukan.
    - Jika "Auto Recalculate" dicentang, mengubah harga akan secara otomatis memperbarui jumlah eksemplar yang direkomendasikan.
    - Klik "Simpan" untuk menyimpan perubahan Anda.
6.  **Salin Data:** Klik tombol "Salin" untuk menyalin semua data buku yang ditampilkan (tanpa header) ke clipboard Anda. Data akan disalin dalam format tab-separated, cocok untuk ditempelkan ke spreadsheet.
7.  **Rescan:** Jika Anda beralih ke halaman produk lain atau data tidak terdeteksi dengan benar, klik tombol "Rescan" untuk mencoba mengekstrak data lagi.

## Pengaturan (Rules Configuration)

Anda dapat menyesuaikan aturan untuk perhitungan eksemplar yang direkomendasikan:

1.  Klik kanan ikon ekstensi dan pilih "Options" (Opsi), atau navigasikan ke `chrome://extensions`, temukan ekstensi ini, dan klik "Details" (Detail) lalu "Extension options" (Opsi ekstensi).
2.  Di halaman pengaturan, Anda dapat:
    - Menambahkan aturan baru dengan mengklik "Tambah Aturan".
    - Mengubah `Harga sampai` dan `Eksemplar` untuk setiap aturan.
    - Menghapus aturan yang ada.
    - Aturan terakhir harus selalu memiliki `Harga sampai` kosong (mewakili `Infinity`) dan akan berlaku untuk semua harga di atas aturan sebelumnya.
3.  Klik "Simpan Pengaturan" untuk menerapkan perubahan Anda.

## Struktur Proyek

- `manifest.json`: File konfigurasi utama ekstensi Chrome.
- `popup.html`: Antarmuka pengguna untuk popup ekstensi.
- `popup.js`: Logika JavaScript untuk popup, termasuk memicu scraping dan menampilkan data.
- `content_script.js`: Skrip yang berjalan di setiap halaman web untuk mengelola injeksi modul scraping.
- `scripts/`:
  - `extractor.js`: Berisi kelas `Extractor` yang bertanggung jawab untuk logika scraping data buku dari DOM.
  - `utils.js`: Berisi fungsi utilitas untuk membersihkan dan menormalisasi data (harga, tahun, judul, penulis, dll.).
  - `config.js`: Mendefinisikan kata kunci, selektor CSS, dan aturan default untuk ekstraksi dan perhitungan.
  - `calculator.js`: Logika untuk menghitung jumlah eksemplar yang direkomendasikan berdasarkan aturan harga.
  - `storage.js`: Menangani penyimpanan dan pengambilan aturan dari `chrome.storage.local`.
- `settings.html`: Antarmuka pengguna untuk mengelola aturan perhitungan eksemplar.
- `settings.js`: Logika JavaScript untuk halaman pengaturan.
- `Icons/`: Berisi ikon ekstensi dalam berbagai ukuran.

## Kontribusi

Kontribusi disambut baik! Jika Anda memiliki saran, perbaikan bug, atau ingin menambahkan dukungan untuk situs e-commerce baru, jangan ragu untuk membuka _issue_ atau mengirimkan _pull request_.

## Lisensi

Proyek ini dilisensikan di bawah MIT License.
