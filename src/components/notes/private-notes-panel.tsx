"use client";

import { useState } from "react";
import { Check, KeyRound, Loader2, LockKeyhole, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { PrivateNotesRepository } from "@/modules/notes/private-notes-repository";
import type { PrivateNote } from "@/types/note";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function PrivateNotesPanel() {
  const [open, setOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState<PrivateNote[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("Şifre ile giriş destekleyen kullanıcı e-postası bulunamadı");
      const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
      if (error) throw error;
      setNotes(await new PrivateNotesRepository(supabase).list());
      setPassword("");
      setUnlocked(true);
    } catch {
      toast.error("Şifre doğrulanamadı");
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setNotes(await new PrivateNotesRepository(createClient()).list());
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (title.trim().length < 2) return void toast.error("Başlık en az 2 karakter olmalıdır");
    setLoading(true);
    try {
      const repository = new PrivateNotesRepository(createClient());
      if (editingId) await repository.update(editingId, { title, content });
      else await repository.create({ title, content });
      await refresh();
      resetForm();
      toast.success(editingId ? "Gizli not güncellendi" : "Gizli not eklendi");
    } catch (error) {
      toast.error("İşlem tamamlanamadı", { description: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }

  function edit(note: PrivateNote) {
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
    if (!window.confirm("Bu gizli not kalıcı olarak silinsin mi?")) return;
    try {
      await new PrivateNotesRepository(createClient()).remove(id);
      setNotes((current) => current.filter((note) => note.id !== id));
      if (editingId === id) resetForm();
      toast.success("Gizli not silindi");
    } catch (error) {
      toast.error("Not silinemedi", { description: (error as Error).message });
    }
  }

  function close() {
    setOpen(false);
    setUnlocked(false);
    setPassword("");
    setNotes([]);
    resetForm();
  }

  return <div className="fixed bottom-4 right-[4.75rem] z-50 print:hidden">
    {open && <section className="mb-3 flex h-[55vh] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl sm:min-h-[360px] sm:w-[25vw] sm:min-w-[340px] sm:max-w-[440px]"><header className="flex items-center justify-between border-b bg-amber-50 px-4 py-3 dark:bg-amber-950/30"><div className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-amber-700 dark:text-amber-300" /><h2 className="font-semibold">Önemli ve Gizli Notlar</h2></div><Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={close} aria-label="Gizli notları kapat"><X className="h-4 w-4" /></Button></header>
      {!unlocked ? <form onSubmit={unlock} className="m-auto w-full max-w-xs space-y-4 p-5"><div className="text-center"><KeyRound className="mx-auto mb-2 h-8 w-8 text-amber-600" /><p className="text-sm text-muted-foreground">Bu alanı açmak için mevcut kullanıcı şifrenizi girin.</p></div><div className="space-y-2"><Label htmlFor="private-notes-password">Kullanıcı Şifresi</Label><Input id="private-notes-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus /></div><Button className="w-full" disabled={loading || !password}>{loading && <Loader2 className="animate-spin" />}Gizli Notları Aç</Button></form> : <><form onSubmit={save} className="space-y-2 border-b p-3"><div className="flex items-end gap-2"><div className="min-w-0 flex-1 space-y-1"><Label htmlFor="private-note-title" className="text-xs">Başlık</Label><Input id="private-note-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={150} placeholder="Önemli bilgi başlığı" /></div><Button type="submit" size="icon" disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : editingId ? <Check /> : <Plus />}</Button></div><Textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={5000} rows={3} placeholder="Gizli not içeriği..." />{editingId && <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={resetForm}>Düzenlemeyi iptal et</button>}</form><div className="min-h-0 flex-1 overflow-y-auto p-3">{notes.length ? <ul className="divide-y">{notes.map((note) => <li key={note.id} className="group py-3"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{note.title}</p>{note.content && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{note.content}</p>}</div><div className="flex shrink-0"><Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => edit(note)} aria-label="Gizli notu düzenle"><Pencil className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={() => void remove(note.id)} aria-label="Gizli notu sil"><Trash2 className="h-3.5 w-3.5" /></Button></div></div></li>)}</ul> : <p className="py-8 text-center text-sm text-muted-foreground">Henüz gizli not eklenmedi.</p>}</div></>}
    </section>}
    {!open && <Button type="button" size="icon" variant="destructive" className="h-11 w-11 rounded-full bg-amber-600 shadow-lg hover:bg-amber-700" onClick={() => setOpen(true)} aria-label="Gizli notları aç" title="Önemli ve Gizli Notlar"><LockKeyhole className="h-5 w-5" /></Button>}
  </div>;
}
