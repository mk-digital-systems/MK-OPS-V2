import { UpdatePasswordForm } from "@/components/auth/update-password-form";

export const metadata = {
  title: "Yeni Şifre",
};

export default function UpdatePasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-100 via-background to-background p-4 dark:from-slate-900">
      <UpdatePasswordForm />
    </div>
  );
}
