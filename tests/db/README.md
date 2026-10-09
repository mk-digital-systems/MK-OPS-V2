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
| `onboarding` | Firma kurma, kodla katılma, deneme süresi, erişim durumu |
| `projects` | Proje türleri, iş kalemleri, bölümler, metraj |
| `hakedis` | Birim fiyat, fiyat sabitleme, rapor, yetki |
| `production` | İmalat → proje iş kaydı → hakediş, ek iş fiyatı |
| `inventory` | Kategoriler, çoklu depo, sevkiyat, eski verinin taşınması |
| `audit` | İşlem geçmişi |
| `logo` | Firma logosu deposu yetkileri |
| `vault` | Gizli alan şifresi, oturum, deneme sınırı |

**Yeni migration yazarken:** önce burada test edin, testler geçince Supabase'de çalıştırın.
Kurulmuş bir migration dosyası asla değiştirilmez; her değişiklik yeni dosyadır.
