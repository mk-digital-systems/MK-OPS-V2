# Veritabanı testleri

`supabase/migrations` klasöründeki bütün migration'ları PGlite (tarayıcı/Node içinde çalışan
Postgres) üzerinde, Supabase'in `auth` şeması ve rolleri taklit edilerek sırayla kurar ve
gerçek kullanıcı rolleriyle (`authenticated`, `anon`) sorgular çalıştırır.

```bash
npm run test:db              # hepsi
npm run test:db -- hakedis   # adı "hakedis" ile başlayanlar
node tests/db/vault.test.mjs # tek dosya, ayrıntılı çıktı
```

| Dosya | Kapsam |
|---|---|
| `tenancy` | Firmalar arası veri ayrımı, yazma koruması, roller, anon erişimi |
| `roles` | Firma yöneticisi / şantiye şefi / muhasebe yetkileri, kurucu koruması, kullanıcı limiti |
| `approvals` | Muhasebenin eklediği personel/araç onayı, ay sonu puantaj onayı ve kilidi |
| `subcontractors` | Ekipler, taşeron payı, ekstre, harcama/ödeme ve bakiye, maaş dökümü ayrımı |
| `bulk-records` | Personel/araç toplu ekleme, toplu şube tayini, toplu taşeron ataması |
| `branches` | Merkez, şube açma ve atama, şef/muhasebe yalnızca kendi şubesi (RLS ve fonksiyon içi yazma) |
| `onboarding` | Firma kurma, kodla katılma, deneme süresi, erişim durumu |
| `projects` | Proje türleri, iş kalemleri, bölümler, metraj |
| `project-stage-lists` | Projeye göre iş kalemleri (şablondan seçim, projeye özel kalem), poz kodu |
| `kesif-imalat` | Keşif, imalatta poz seçimi, iş tarihindeki fiyat, keşif ≠ tamamlama, HP'de pafta |
| `poz-first-price` | İlk poz fiyatı başlangıçtan, sonraki tarihsiz fiyat bugünden; geçmiş imalatın fiyatlanması |
| `poz-list` | Firma poz listesi: elle/Excel/katalogdan ekleme, yetkiler, yürürlük tarihli fiyat, toplu yüzde, pasife alma |
| `catalogs` | Süper admin katalogları, türlerin firmaya kurulması, eklentiden geçiş |
| `corporate-projects` | Kurumsal proje eklentisi, elle durum, ekip başı, toplam proje tarihi |
| `hp-projects` | Süper admin proje eklentisi, HP odaklı tür, paftalar, paftadan proje durumu, HP raporu |
| `hakedis` | Birim fiyat, fiyat sabitleme, rapor, yetki |
| `production` | İmalat → proje iş kaydı → hakediş, ek iş fiyatı |
| `production-extra-approval` | İmalattaki özel iş kalemi: fiyat onayı, bildirim, hakedişe girişi |
| `inventory` | Kategoriler, çoklu depo, sevkiyat, eski verinin taşınması |
| `audit` | İşlem geçmişi |
| `logo` | Firma logosu deposu yetkileri |
| `vault` | Gizli alan şifresi, oturum, deneme sınırı |

**Yeni migration yazarken:** önce burada test edin, testler geçince Supabase'de çalıştırın.
Kurulmuş bir migration dosyası asla değiştirilmez; her değişiklik yeni dosyadır.
