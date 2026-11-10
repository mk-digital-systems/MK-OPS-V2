import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { mfaVerifyHref, shouldRedirectToMfa } from "@/lib/mfa";

/**
 * 1) Sayfa yolunu sunucu bileşenlerine `x-app-pathname` başlığıyla iletir (panel/layout.tsx kullanır).
 * 2) Supabase oturumunu yeniler: süresi dolmak üzere olan erişim anahtarı burada yenilenir ve yeni
 *    çerezler hem bu isteğe (sunucu bileşenleri güncel oturumu görsün) hem yanıta (tarayıcı alsın) yazılır.
 *
 * 3) TEK yönlendirme: doğrulanmış iki adımlı doğrulaması (MFA) olan ama oturumu henüz aal1 olan kullanıcı
 *    (süper admin) uygulama bölümlerinde /mfa-dogrulama sayfasına alınır. Yetki kararının kendisi
 *    veritabanındadır (is_super_admin() aal2 ister); bu yalnızca kullanıcıyı doğru ekrana taşır.
 *    Başka yetki/rol yönlendirmesi burada YAPILMAZ (layout / sayfa / RLS düzeyinde). Hata olursa istek
 *    olduğu gibi devam eder, site açılmaya devam eder.
 */
export async function middleware(request: NextRequest) {
  const buildResponse = () => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-app-pathname", request.nextUrl.pathname);
    return NextResponse.next({ request: { headers: requestHeaders } });
  };

  let response = buildResponse();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Oturum çerezi olmayan ziyaretçi (landing sayfaları) için ağ çağrısı yapma.
  const hasSession = request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-"));
  if (!url || !anonKey || !hasSession) return response;

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = buildResponse();
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    });
    // getUser() jetonu doğrular ve gerekirse yeniler (getSession() sunucuda güvenilmez).
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const { data: levels } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const { pathname, search } = request.nextUrl;
      if (shouldRedirectToMfa(pathname, request.method, levels)) {
        const redirect = NextResponse.redirect(new URL(mfaVerifyHref(pathname, search), request.url));
        // Yenilenen oturum çerezlerini yönlendirme yanıtına da taşı.
        for (const cookie of response.headers.getSetCookie()) redirect.headers.append("set-cookie", cookie);
        return redirect;
      }
    }
  } catch (error) {
    console.error("Oturum yenileme atlandı", error instanceof Error ? error.message : error);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|auth/callback|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\..*).*)",
  ],
};
