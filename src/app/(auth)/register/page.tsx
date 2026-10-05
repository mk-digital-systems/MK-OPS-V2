import { RegisterForm } from "@/components/auth/register-form";

export const metadata = {
  title: "Kullanıcı Kaydı",
};

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <RegisterForm />
    </div>
  );
}
