"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Loader2, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import type { UserProfile } from "@/types/auth";
import { USER_ROLE_LABELS } from "@/types/auth";
import {
  profileSchema,
  type ProfileFormValues,
} from "@/lib/validations/auth";
import { createClient } from "@/lib/supabase/client";
import { UserRepository } from "@/modules/users/user-repository";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 3 * 1024 * 1024;

export function ProfileForm({
  initialProfile,
  initialAvatarUrl,
}: {
  initialProfile: UserProfile;
  initialAvatarUrl: string | null;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState(initialProfile);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: profile.full_name ?? "",
      job_title: profile.job_title ?? "",
    },
  });

  function selectPhoto(file: File | undefined) {
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Yalnız JPG, PNG veya WEBP fotoğraf yüklenebilir");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Profil fotoğrafı en fazla 3 MB olabilir");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function save(values: ProfileFormValues) {
    setLoading(true);
    const supabase = createClient();
    const repository = new UserRepository(supabase);
    let newAvatarPath = profile.avatar_path;

    try {
      if (selectedFile) {
        const extension =
          selectedFile.name.split(".").pop()?.toLowerCase() ||
          selectedFile.type.split("/")[1] ||
          "jpg";
        newAvatarPath = `${profile.id}/avatar-${Date.now()}.${extension}`;
        const { error } = await supabase.storage
          .from("profile-avatars")
          .upload(newAvatarPath, selectedFile, {
            cacheControl: "3600",
            contentType: selectedFile.type,
            upsert: false,
          });
        if (error) throw error;
      }

      const updated = await repository.updateOwnProfile({
        ...values,
        avatar_path: newAvatarPath,
      });
      if (
        selectedFile &&
        profile.avatar_path &&
        profile.avatar_path !== newAvatarPath
      ) {
        await supabase.storage
          .from("profile-avatars")
          .remove([profile.avatar_path]);
      }
      setProfile(updated);
      setSelectedFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setAvatarUrl(await repository.createAvatarUrl(updated.avatar_path));
      toast.success("Profil güncellendi");
      router.refresh();
    } catch (error) {
      if (selectedFile && newAvatarPath !== profile.avatar_path) {
        await supabase.storage
          .from("profile-avatars")
          .remove([newAvatarPath!]);
      }
      console.error(error);
      toast.error("Profil güncellenemedi", {
        description: (error as Error)?.message,
      });
    } finally {
      setLoading(false);
    }
  }

  async function removePhoto() {
    if (!profile.avatar_path) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const repository = new UserRepository(supabase);
      const oldPath = profile.avatar_path;
      const updated = await repository.updateOwnProfile({
        full_name: form.getValues("full_name"),
        job_title: form.getValues("job_title"),
        avatar_path: null,
      });
      await supabase.storage.from("profile-avatars").remove([oldPath]);
      setProfile(updated);
      setAvatarUrl(null);
      setSelectedFile(null);
      setPreviewUrl(null);
      if (fileInput.current) fileInput.current.value = "";
      toast.success("Profil fotoğrafı kaldırıldı");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("Profil fotoğrafı kaldırılamadı");
    } finally {
      setLoading(false);
    }
  }

  const shownAvatar = previewUrl || avatarUrl;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Profilim</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kişisel bilgilerinizi ve profil fotoğrafınızı yönetin
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3 text-base">
            Kullanıcı Bilgileri
            <Badge>{USER_ROLE_LABELS[profile.role]}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(save)} className="space-y-6">
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
                {shownAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shownAvatar}
                    alt={`${profile.full_name || "Kullanıcı"} profil fotoğrafı`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <UserRound className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInput.current?.click()}
                >
                  <Camera className="h-4 w-4" />
                  Fotoğraf Seç
                </Button>
                {(profile.avatar_path || selectedFile) && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={
                      selectedFile
                        ? () => {
                            setSelectedFile(null);
                            setPreviewUrl(null);
                            if (fileInput.current)
                              fileInput.current.value = "";
                          }
                        : removePhoto
                    }
                    disabled={loading}
                  >
                    <Trash2 className="h-4 w-4" />
                    Fotoğrafı Kaldır
                  </Button>
                )}
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => selectPhoto(event.target.files?.[0])}
                />
                <p className="w-full text-center text-xs text-muted-foreground sm:text-left">
                  JPG, PNG veya WEBP · En fazla 3 MB
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="profile_full_name">Ad Soyad</Label>
                <Input
                  id="profile_full_name"
                  {...form.register("full_name")}
                />
                {form.formState.errors.full_name && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.full_name.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile_job_title">Görev</Label>
                <Input
                  id="profile_job_title"
                  placeholder="Örn. Saha Sorumlusu"
                  {...form.register("job_title")}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>E-posta</Label>
                <Input value={profile.email ?? ""} disabled />
              </div>
            </div>

            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Profili Kaydet
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
