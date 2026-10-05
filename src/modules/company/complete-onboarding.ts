import type { SupabaseClient } from "@supabase/supabase-js";
import type { SignupMode } from "@/types/auth";
import { CompanyRepository } from "@/modules/company/company-repository";

export type OnboardingInput = {
  signup_mode: SignupMode;
  company_name: string;
  join_code: string;
};

/** Şirket kurar veya şirkete katılır; kullanıcının gideceği sayfayı döndürür. */
export async function completeOnboarding(
  supabase: SupabaseClient,
  input: OnboardingInput
): Promise<{ path: string; message: string }> {
  const repository = new CompanyRepository(supabase);
  if (input.signup_mode === "create") {
    const account = await repository.createCompany(input.company_name);
    return {
      path: "/panel",
      message: `${account.company?.name ?? input.company_name} kuruldu. 48 saatlik deneme başladı.`,
    };
  }
  const companyName = await repository.joinCompany(input.company_name, input.join_code);
  return {
    path: "/pending-approval",
    message: `${companyName} şirketine katılma isteğiniz gönderildi.`,
  };
}
