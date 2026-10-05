"use client";

import { useEffect, useState } from "react";
import { BellRing, Check, FileDown, Loader2, Pencil, Plus, StickyNote, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { NotesRepository } from "@/modules/notes/notes-repository";
import type { SharedNote } from "@/types/note";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadNotesPdf } from "@/lib/notes-pdf";

function today() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function formatNoteDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

export function QuickNotesPanel({
  initialNotes,
  currentUserId,
}: {
  initialNotes: SharedNote[];
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(initialNotes);
  const [currentDate, setCurrentDate] = useState(today());
  const [title, setTitle] = useState("");
  const [noteDate, setNoteDate] = useState(today());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const scheduleNextDayCleanup = () => {
      const now = new Date();
      const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(async () => {
        try {
          setCurrentDate(today());
          setNotes(await new NotesRepository(createClient()).list());
        } catch (error) {
          console.error("Tarihi geçen notlar temizlenemedi", error);
        } finally {
          scheduleNextDayCleanup();
        }
      }, nextDay.getTime() - now.getTime() + 1000);
    };
    scheduleNextDayCleanup();
    return () => clearTimeout(timer);
  }, []);

  async function refreshNotes() {
    setNotes(await new NotesRepository(createClient()).list());
  }

  async function createNote(event: React.FormEvent) {
    event.preventDefault();
    if (title.trim().length < 2) return void toast.error("Not en az 2 karakter olmalıdır");
    if (!noteDate) return void toast.error("Tarih zorunludur");

    setLoading(true);
    try {
      const repository = new NotesRepository(createClient());
      if (editingId) await repository.update(editingId, { title: title.trim(), note_date: noteDate });
      else await repository.create({ title: title.trim(), note_date: noteDate });
      await refreshNotes();
      setTitle("");
      setNoteDate(today());
      setEditingId(null);
      toast.success(editingId ? "Not güncellendi" : "Not eklendi");
    } catch (error) {
      console.error(error);
      toast.error("Not eklenemedi", { description: (error as Error)?.message });
    } finally {
      setLoading(false);
    }
  }

  function editNote(note: SharedNote) {
    setEditingId(note.id);
    setTitle(note.title);
    setNoteDate(note.note_date);
  }

  function cancelEdit() {
    setEditingId(null);
    setTitle("");
    setNoteDate(today());
  }

  async function downloadPdf() {
    setPdfLoading(true);
    try {
      await downloadNotesPdf(notes);
      toast.success("Notlar A4 PDF olarak indirildi");
    } catch (error) {
      toast.error("PDF oluşturulamadı", { description: (error as Error)?.message });
    } finally {
      setPdfLoading(false);
    }
  }

  async function removeNote(noteId: string) {
    if (!window.confirm("Bu not silinsin mi?")) return;
    try {
      await new NotesRepository(createClient()).remove(noteId);
      setNotes((current) => current.filter((note) => note.id !== noteId));
      toast.success("Not silindi");
    } catch (error) {
      toast.error("Not silinemedi", { description: (error as Error)?.message });
    }
  }

  const todaysNotes = notes.filter((note) => note.note_date === currentDate);

  return (
    <>
      {todaysNotes.length > 0 && (
        <section
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") setOpen(true);
          }}
          role="button"
          tabIndex={0}
          className="fixed right-4 top-16 z-40 w-[min(22rem,calc(100vw-2rem))] cursor-pointer overflow-hidden rounded-xl border border-amber-300 bg-amber-50/95 text-left shadow-lg backdrop-blur transition hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-700 dark:bg-amber-950/95 md:top-4 print:hidden"
          aria-label={`Bugüne ait ${todaysNotes.length} notu aç`}
        >
          <div className="flex items-center gap-2 border-b border-amber-200 px-3 py-2 text-amber-900 dark:border-amber-800 dark:text-amber-100">
            <BellRing className="h-4 w-4 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wide">Bugünün Notları</span>
            <span className="ml-auto rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold dark:bg-amber-800">
              {todaysNotes.length}
            </span>
          </div>
          <ul className="max-h-40 space-y-1 overflow-y-auto px-3 py-2">
            {todaysNotes.map((note) => (
              <li key={note.id} className="flex gap-2 text-sm font-medium text-amber-950 dark:text-amber-50">
                <span className="text-amber-600 dark:text-amber-400">•</span>
                <span className="min-w-0 break-words">{note.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="fixed bottom-4 right-4 z-50 print:hidden">
      {open && (
        <section className="mb-3 flex h-[50vh] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl sm:h-[33.333vh] sm:min-h-[280px] sm:w-[25vw] sm:min-w-[320px] sm:max-w-[420px]">
          <header className="flex items-center justify-between border-b bg-muted/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Notlar</h2>
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={!notes.length || pdfLoading} onClick={() => void downloadPdf()} aria-label="Notları A4 PDF indir" title="A4 PDF indir">
                {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Notları kapat">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </header>

          <form onSubmit={createNote} className="grid grid-cols-[minmax(0,1fr)_120px_36px] items-end gap-2 border-b p-3">
            <div className="space-y-1">
              <Label htmlFor="quick-note-title" className="text-xs">Not</Label>
              <Input id="quick-note-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ekip kontrol" maxLength={150} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quick-note-date" className="text-xs">Tarih</Label>
              <Input id="quick-note-date" type="date" value={noteDate} onChange={(event) => setNoteDate(event.target.value)} />
            </div>
            <Button type="submit" size="icon" disabled={loading} aria-label={editingId ? "Notu güncelle" : "Not ekle"}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </Button>
          </form>
          {editingId && <button type="button" onClick={cancelEdit} className="border-b px-3 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground">Düzenlemeyi iptal et</button>}

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {notes.length ? (
              <ul className="divide-y">
                {notes.map((note) => (
                  <li key={note.id} className="group flex items-start gap-2 py-2 first:pt-0 last:pb-0">
                    <span className="mt-0.5 text-sm text-primary">•</span>
                    <p className="min-w-0 flex-1 break-words text-sm font-medium">
                      {note.title} <span className="whitespace-nowrap text-muted-foreground">({formatNoteDate(note.note_date)})</span>
                    </p>
                    {note.created_by === currentUserId && (
                      <div className="flex shrink-0">
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => editNote(note)} aria-label="Notu düzenle">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => void removeNote(note.id)} aria-label="Notu sil">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Henüz not eklenmedi.</p>
            )}
          </div>
        </section>
      )}

      {!open && (
        <Button type="button" size="icon" className="h-11 w-11 rounded-full shadow-lg" onClick={() => setOpen(true)} aria-label="Notları aç" title="Notlar">
          <StickyNote className="h-5 w-5" />
        </Button>
      )}
      </div>
    </>
  );
}
