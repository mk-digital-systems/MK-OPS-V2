import { redirect } from "next/navigation";

export const metadata = {
  title: "Notlar",
};

export default async function NotesPage() {
  redirect("/");
}
