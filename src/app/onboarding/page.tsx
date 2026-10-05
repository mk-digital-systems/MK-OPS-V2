import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { createClient } from "@/lib/supabase/server";
import { UserRepository } from "@/modules/users/user-repository";
import { CompanyRepository } from "@/modules/company/company-repository";
import { resolveAccountHome } from "@/lib/account-routing";

export const metadata = {
  title: "Şirket Seçimi",
};

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await new UserRepository(supabase).getCurrent();
  const account = await new CompanyRepository(supabase).getMyAccount();
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
