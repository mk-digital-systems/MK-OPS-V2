# MK OPS — Proje Takip Sistemi

Production kalitesinde şantiye proje aşama takip uygulaması.

## Teknoloji

- Next.js 15 (App Router) + TypeScript
- TailwindCSS + shadcn/ui tarzı bileşenler
- Supabase (Auth + PostgreSQL + RLS)
- React Hook Form + Zod
- TanStack Query + TanStack Table
- Framer Motion + Lucide + Sonner



## Özellikler (v1)

- Login / Logout / Şifre sıfırlama / Session koruması
- Dashboard istatistik kartları
- Proje CRUD + firma Proje ID (manuel)
- Mevki manuel giriş + öneri
- 4 sabit + 4 manuel proje türü
- Durumlar: Bekliyor, Devam Ediyor, Kazı İzni Bekliyor, Gecikmiş, Tamamlandı
- Tamamlanan projeler otomatik arşiv
- Arama, filtre, pagination, indexler
- Dark mode, toast, skeleton, responsive

## Mimari

```
src/
  app/           # Route katmanı (server components)
  components/    # UI bileşenleri
  modules/       # Domain repository'leri (SOLID)
  lib/           # Supabase, validasyon, sabitler
  providers/     # Theme + React Query
  types/         # Paylaşılan tipler

