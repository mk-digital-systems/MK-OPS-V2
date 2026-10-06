"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, KeyRound, Loader2, Lock, LockKeyhole, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { CompanyVaultRepository, isVaultLockedError } from "@/modules/notes/company-vault-repository";
import { PrivateNotesRepository } from "@/modules/notes/private-notes-repository";
import type { CompanyVaultNote, CompanyVaultStatus, PrivateNote } from "@/types/note";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const vault = () => new CompanyVaultRepository(createClient());

/**
 * Firmanın ortak "Önemli ve Gizli Notlar" alanı. Ana yöneticinin Ayarlar'da belirlediği
 * firma şifresiyle açılır; koruma sunucudadır. Oturum anahtarı yalnızca bellekte tutulur.
 */
export function PrivateNotesPanel() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<CompanyVaultStatus | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState<CompanyVaultNote[]>([]);
  const [legacyNotes, setLegacyNotes] = useState<PrivateNote[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function openPanel() {
    setOpen(true);
    try {
      setStatus(await vault().status());
    } catch (error) {
      toast.error("Gizli alan bilgisi alınamadı", { description: (error as Error).message });
    }
  }

  function relock(message = "Gizli alan kilitlendi; şifreyi yeniden girin") {
    setToken(null);
    setNotes([]);
    setLegacyNotes([]);
    resetForm();
    toast.info(message);
  }

  /** Oturum düşmüşse paneli kilitler; değilse hatayı gösterir. */
  function handleError(error: unknown, fallback: string) {
    if (isVaultLockedError(error)) relock();
    else toast.error(fallback, { description: (error as Error)?.message });
  }

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const nextToken = await vault().unlock(password);
      const [shared, legacy] = await Promise.all([
        vault().list(nextToken),
        new PrivateNotesRepository(createClient()).list().catch(() => []),
      ]);
      setToken(nextToken);
      setNotes(shared);
      setLegacyNotes(legacy);
      setPassword("");
    } catch (error) {
      toast.error((error as Error).message || "Şifre doğrulanamadı");
    } finally {
      setLoading(false);
    }
  }

  async function refresh(currentToken: string) {
    setNotes(await vault().list(currentToken));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    if (title.trim().length < 2) return void toast.error("Başlık en az 2 karakter olmalıdır");
    setLoading(true);
    try {
      await vault().save(token, editingId, { title, content });
      await refresh(token);
      toast.success(editingId ? "Gizli not güncellendi" : "Gizli not eklendi");
      resetForm();
    } catch (error) {
      handleError(error, "İşlem tamamlanamadı");
    } finally {
      setLoading(false);
    }
  }

  function edit(note: CompanyVaultNote) {
    setEditingId(note.id);
    setTitle(note.title);
    setContent(note.content);
  }

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setContent("");
  }

  async function remove(id: string) {
    if (!token || !window.confirm("Bu gizli not firmadaki herkes için kalıcı olarak silinsin mi?")) return;
    try {
      await vault().remove(token, id);
      setNotes((current) => current.filter((note) => note.id !== id));
      if (editingId === id) resetForm();
      toast.success("Gizli not silindi");
    } catch (error) {
      handleError(error, "Not silinemedi");
    }
  }

  async function moveLegacy(note: PrivateNote) {
    if (!token) return;
    try {
      await vault().moveLegacyNote(token, note.id);
      setLegacyNotes((current) => current.filter((item) => item.id !== note.id));
      await refresh(token);
      toast.success("Not ortak gizli alana taşındı");
    } catch (error) {
      handleError(error, "Not taşınamadı");
    }
  }

  async function removeLegacy(note: PrivateNote) {
    if (!window.confirm("Bu kişisel not kalıcı olarak silinsin mi?")) return;
    try {
      await new PrivateNotesRepository(createClient()).remove(note.id);
      setLegacyNotes((current) => current.filter((item) => item.id !== note.id));
      toast.success("Kişisel not silindi");
    } catch (error) {
      toast.error("Not silinemedi", { description: (error as Error).message });
    }
  }

  function close() {
    if (token) void vault().lock(token);
    setOpen(false);
    setToken(null);
    setPassword("");
    setNotes([]);
    setLegacyNotes([]);
    resetForm();
  }

  return <div className="fixed bottom-4 right-[4.75rem] z-50 print:hidden">
    {open && <section className="mb-3 flex h-[55vh] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl sm:min-h-[360px] sm:w-[25vw] sm:min-w-[340px] sm:max-w-[440px]">
      <header className="flex items-center justify-between border-b bg-amber-50 px-4 py-3 dark:bg-amber-950/30">
        <div className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-amber-700 dark:text-amber-300" /><h2 className="font-semibold">Önemli ve Gizli Notlar</h2></div>
        <div className="flex items-center">
          {token && <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => { void vault().lock(token); relock("Gizli alan kilitlendi"); }} aria-label="Kilitle" title="Kilitle"><Lock className="h-4 w-4" /></Button>}
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={close} aria-label="Gizli notları kapat"><X className="h-4 w-4" /></Button>
        </div>
      </header>

      {!status ? <div className="m-auto"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      : !status.can_use ? <p className="m-auto max-w-xs p-5 text-center text-sm text-muted-foreground">Gizli alanı yalnızca onaylı firma kullanıcıları açabilir.</p>
      : !status.configured ? <div className="m-auto max-w-xs space-y-3 p-5 text-center">
          <KeyRound className="mx-auto h-8 w-8 text-amber-600" />
          <p className="text-sm text-muted-foreground">Bu alan firmanın ortak gizli notları içindir ve firma şifresiyle açılır. Henüz şifre belirlenmemiş.</p>
          {status.can_manage
            ? <Button asChild size="sm"><Link href="/panel/settings#gizli-alan" onClick={() => setOpen(false)}>Ayarlar&apos;dan şifre belirle</Link></Button>
            : <p className="text-sm font-medium">Şifreyi ana yöneticiniz Ayarlar&apos;dan belirleyebilir.</p>}
        </div>
      : !token ? <form onSubmit={unlock} className="m-auto w-full max-w-xs space-y-4 p-5">
          <div className="text-center"><KeyRound className="mx-auto mb-2 h-8 w-8 text-amber-600" /><p className="text-sm text-muted-foreground">Firmanın ortak gizli notları. Açmak için firma gizli alan şifresini girin.</p></div>
          <div className="space-y-2"><Label htmlFor="vault-password">Gizli Alan Şifresi</Label><Input id="vault-password" type="password" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus /></div>
          <Button className="w-full" disabled={loading || !password}>{loading && <Loader2 className="animate-spin" />}Gizli Notları Aç</Button>
          {status.can_manage && <p className="text-center text-xs text-muted-foreground">Şifreyi <Link href="/panel/settings#gizli-alan" className="underline" onClick={() => setOpen(false)}>Ayarlar</Link>&apos;dan değiştirebilirsiniz.</p>}
        </form>
      : <>
          <form onSubmit={save} className="space-y-2 border-b p-3">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1"><Label htmlFor="vault-note-title" className="text-xs">Başlık</Label><Input id="vault-note-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={150} placeholder="Önemli bilgi başlığı" /></div>
              <Button type="submit" size="icon" disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : editingId ? <Check /> : <Plus />}</Button>
            </div>
            <Textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={5000} rows={3} placeholder="Gizli not içeriği..." />
            {editingId && <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={resetForm}>Düzenlemeyi iptal et</button>}
          </form>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {notes.length ? <ul className="divide-y">{notes.map((note) => <li key={note.id} className="py-3"><div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-semibold">{note.title}</p>
                {note.content && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{note.content}</p>}
                <p className="mt-1 text-[11px] text-muted-foreground">{note.updated_by_name ? `${note.updated_by_name} · ` : ""}{new Date(note.updated_at).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}</p>
              </div>
              <div className="flex shrink-0">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => edit(note)} aria-label="Gizli notu düzenle"><Pencil className="h-3.5 w-3.5" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={() => void remove(note.id)} aria-label="Gizli notu sil"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div></li>)}</ul> : <p className="py-8 text-center text-sm text-muted-foreground">Henüz gizli not eklenmedi.</p>}

            {legacyNotes.length > 0 && <div className="mt-4 rounded-xl border border-dashed p-3">
              <p className="text-xs font-semibold">Eski kişisel notlarınız</p>
              <p className="mt-1 text-xs text-muted-foreground">Bunları yalnızca siz görüyorsunuz. Ortak alana taşıyabilir ya da silebilirsiniz.</p>
              <ul className="mt-2 divide-y">{legacyNotes.map((note) => <li key={note.id} className="flex items-start gap-2 py-2">
                <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{note.title}</p>{note.content && <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{note.content}</p>}</div>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => void moveLegacy(note)} aria-label="Ortak alana taşı" title="Ortak alana taşı"><ArrowUpRight className="h-3.5 w-3.5" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={() => void removeLegacy(note)} aria-label="Kişisel notu sil"><Trash2 className="h-3.5 w-3.5" /></Button>
              </li>)}</ul>
            </div>}
          </div>
        </>}
    </section>}
    {!open && <Button type="button" size="icon" variant="destructive" className="h-11 w-11 rounded-full bg-amber-600 shadow-lg hover:bg-amber-700" onClick={() => void openPanel()} aria-label="Gizli notları aç" title="Önemli ve Gizli Notlar"><LockKeyhole className="h-5 w-5" /></Button>}
  </div>;
}
