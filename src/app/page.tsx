import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role === "INSTALLER") redirect("/my-guides");
  redirect("/dashboard");
}
