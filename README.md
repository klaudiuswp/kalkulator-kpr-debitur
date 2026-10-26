# Kalkulator KPR — Versi Debitur

Kalkulator KPR (Kredit Pemilikan Rumah) yang ramah pengguna untuk **debitur/nasabah**.
Versi sederhana dari kalkulator internal Consumer Loan Group (CSL), tanpa perlu
proses *build* — cukup HTML, CSS, dan JavaScript biasa.

🔗 **Demo:** https://mine2710.github.io/kalkulator-kpr-debitur/

## Fitur

- **Pilihan tipe KPR**: Fix & Float, Fix All Tenor, Jenjang (Graduated), Promo Fix 3/5 Tahun, atau Custom
- **Suku bunga bertahap** (sampai 7 tahap) dengan hitung ulang angsuran otomatis
- **Simulasi Take Over (TO)** — bandingkan skema lama vs skema baru:
  - Biaya TO bisa **nominal** atau **persen (%)**
  - Plafon skema lama bisa berbeda dari pinjaman baru
  - Deteksi otomatis titik impas (BEP) dan selisih total pembayaran
- **Output lengkap**: IRR tahunan, total jangka waktu, total pembayaran, total bunga,
  sisa saldo akhir, grafik saldo, grafik kumulatif baru vs lama, tabel ringkasan tahap,
  dan jadwal amortisasi lengkap
- Responsif (HP & desktop) + mode gelap/terang otomatis

## Struktur File

```
kalkulator-kpr-debitur/
├── index.html    # Halaman utama
├── style.css     # Tampilan / styling
├── script.js     # Logika kalkulator (matematika KPR, grafik, tabel)
└── README.md
```

## Cara Menjalankan (Lokal)

Cukup **klik dua kali `index.html`** → terbuka di browser. Tidak perlu install apa pun.

Atau lewat VS Code: install ekstensi **Live Server**, klik kanan `index.html` → *Open with Live Server*.

## Cara Deploy ke GitHub Pages

1. Buat repo baru bernama `kalkulator-kpr-debitur` di akun GitHub kamu.
2. Upload ketiga file (`index.html`, `style.css`, `script.js`) ke repo tersebut.
3. Buka **Settings → Pages**.
4. Bagian *Source*, pilih branch `main` dan folder `/ (root)`, lalu **Save**.
5. Tunggu 1–2 menit. Situs tayang di `https://<username>.github.io/kalkulator-kpr-debitur/`.

## Teknologi

- HTML + CSS + JavaScript (tanpa framework, tanpa build)
- [Chart.js](https://www.chartjs.org/) untuk grafik (via CDN)

## Catatan

Simulasi ini bersifat **estimasi** untuk edukasi debitur. Angka resmi tetap mengacu
pada ketentuan bank.
