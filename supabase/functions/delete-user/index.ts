import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders as supabaseCorsHeaders } from "npm:@supabase/supabase-js@2/cors";

const corsHeaders = {
  ...supabaseCorsHeaders,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Desteklenmeyen istek yöntemi" }, 405);
  }

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) {
      return jsonResponse({ error: "Oturum gerekli" }, 401);
    }

    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const anonKey = getRequiredEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Geçersiz oturum" }, 401);
    }

    const { data: callerProfile } = await userClient
      .from("profiles")
      .select("role, is_approved")
      .eq("id", user.id)
      .single();
    if (
      callerProfile?.role !== "site_chief" ||
      callerProfile.is_approved !== true
    ) {
      return jsonResponse(
        { error: "Yalnız şantiye şefi kullanıcı silebilir" },
        403
      );
    }

    const body = await request.json();
    const targetUserId =
      typeof body?.user_id === "string" ? body.user_id : "";
    const dryRun = body?.dry_run === true;
    if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) {
      return jsonResponse({ error: "Geçersiz kullanıcı" }, 400);
    }
    if (targetUserId === user.id) {
      return jsonResponse({ error: "Kendi hesabınızı silemezsiniz" }, 403);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { data: targetAuth, error: targetAuthError } =
      await adminClient.auth.admin.getUserById(targetUserId);
    if (targetAuthError || !targetAuth.user) {
      return jsonResponse({ error: "Silinecek kullanıcı bulunamadı" }, 404);
    }

    const { data: targetProfile, error: targetProfileError } = await adminClient
      .from("profiles")
      .select("role, avatar_path")
      .eq("id", targetUserId)
      .maybeSingle();
    if (targetProfileError) throw targetProfileError;
    if (targetProfile?.role === "site_chief") {
      return jsonResponse(
        { error: "Birincil Şantiye Şefi hesabı silinemez" },
        403
      );
    }

    if (dryRun) {
      return jsonResponse({
        success: true,
        dry_run: true,
        message: "Kullanıcı silme kontrolleri başarılı; hiçbir kayıt silinmedi.",
      });
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(
      targetUserId,
      false
    );
    if (deleteError) throw deleteError;

    // auth.users silindikten sonra profiles kaydı ON DELETE CASCADE ile kalkar.
    // Geçmiş operasyon kayıtlarındaki kullanıcı referansları SET NULL ile korunur.
    if (targetProfile?.avatar_path) {
      const { error: avatarError } = await adminClient.storage
        .from("profile-avatars")
        .remove([targetProfile.avatar_path]);
      if (avatarError) console.error("Avatar temizlenemedi", avatarError);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: toPublicErrorMessage(error) }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Eksik Edge Function secret: ${name}`);
  return value;
}

function toPublicErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("foreign key") || message.includes("constraint")) {
    return "Kullanıcıya bağlı kayıtlar güvenli biçimde ayrıştırılamadığı için hesap silinemedi. Veritabanı migration durumunu kontrol edin.";
  }
  if (message.startsWith("Eksik Edge Function secret:")) return message;
  return "Kullanıcı hesabı silinemedi. Edge Function loglarını kontrol edin.";
}
