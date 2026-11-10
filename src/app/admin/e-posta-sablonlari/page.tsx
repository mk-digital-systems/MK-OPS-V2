import { createClient } from "@/lib/supabase/server";
import { AdminRepository } from "@/modules/admin/admin-repository";
import { EmailTemplateEditor } from "@/components/admin/email-template-editor";

export const metadata = {
  title: "E-posta Şablonu",
};

export default async function AdminEmailTemplatesPage() {
  const templates = await new AdminRepository(await createClient()).emailTemplates();
  const welcome = templates.find((item) => item.kind === "welcome");
  return <EmailTemplateEditor template={welcome ?? null} />;
}
