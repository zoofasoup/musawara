# Satu kode, satu Salinan per Bisnis

CRM yang dijual memakai repo yang sama dengan platform agensi, dalam mode CRM-saja, dan tiap Bisnis mendapat aplikasi serta database sendiri (26 Nov 2026). Alasannya: satu orang mengerjakan sekitar sehari seminggu, perbaikan cukup sekali, dan data antar-Bisnis terpisah tanpa harus membangun multi-tenant.

## Considered Options

- **Repo terpisah:** lebih bersih, tetapi setiap perbaikan dikerjakan dua kali.
- **Satu aplikasi multi-tenant:** ditunda sampai pemasukan Rp 3.000.000 per bulan selama 3 bulan (lihat `docs/plan-crm-for-others.md`).

## Consequences

Biaya pemasangan dan pembaruan naik seiring jumlah Salinan, jadi pemasangan harus bisa diulang dengan skrip. Perubahan untuk mode CRM-saja tidak boleh mengubah perilaku platform agensi.
