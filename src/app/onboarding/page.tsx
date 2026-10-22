import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { resolveAccountHome } from "@/lib/account-routing";
import { getAuthUser, getCurrentUser, getMyAccount } from "@/lib/supabase/request-cache";

export const metadata = {
  title: "Şirket Seçimi",
};

export default async function OnboardingPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const [profile, account] = await Promise.all([getCurrentUser(), getMyAccount()]);
  const home = resolveAccountHome(profile, account);
  if (home !== "/onboarding") redirect(home);

  // Kayıt formunda seçilen şirket bilgisi e-posta doğrulamasından sonra burada tamamlanır.
  const metadata = user.user_metadata ?? {};
  return (
    <OnboardingForm
      initialValues={{
        signup_mode: metadata.signup_mode === "join" ? "join" : "create",
        company_name: typeof metadata.company_name === "string" ? metadata.company_name : "",
        join_code: typeof metadata.join_code === "string" ? metadata.join_code : "",
      }}
    />
  );
}
