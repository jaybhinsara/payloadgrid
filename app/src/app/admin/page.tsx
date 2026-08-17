import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminConsole } from "@/components/admin/admin-console";
import { getSessionContext } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/operator";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login?next=/admin");
  if (!isPlatformAdmin(context.user.email)) redirect("/dashboard");
  return <AdminConsole user={context.user} />;
}
