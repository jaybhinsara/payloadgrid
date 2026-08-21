import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountSetupForm } from "@/components/account-setup-form";
import { Brand } from "@/components/brand";
import { getSessionContext } from "@/lib/auth";
import { requireSql } from "@/lib/db";

export const metadata: Metadata = { title: "Account setup", robots: { index: false, follow: false } };

export default async function AccountSetupPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login?next=/account/setup");
  const [organization] = await requireSql()`select name, legal_name, website, country_code from organizations where id = ${context.organization.id}`;
  return <main className="account-setup-shell"><nav><Brand /></nav><AccountSetupForm initial={{ name: context.user.name, accountType: context.user.accountType, organizationName: String(organization?.name || context.organization.name), legalName: String(organization?.legal_name || ""), website: String(organization?.website || ""), countryCode: String(organization?.country_code || "") }} /></main>;
}
