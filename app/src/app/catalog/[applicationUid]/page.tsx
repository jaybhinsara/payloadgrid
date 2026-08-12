import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogWorkspace, type CatalogContract } from "@/components/catalog-workspace";
import { requireSql } from "@/lib/db";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Event catalog", description: "Generated webhook event contracts and integration examples.", robots: { index: false, follow: false } };

export default async function EventCatalog({ params }: { params: Promise<{ applicationUid: string }> }) {
  const { applicationUid } = await params;
  const sql = requireSql();
  const [application] = await sql`select id, name, uid, description, project_id from applications where uid=${applicationUid} limit 1`;
  if (!application) notFound();
  const rows = await sql`
    select et.id, et.name, et.description, ec.version, ec.schema, ec.example, ec.compatibility_mode,
      ec.compatibility_warnings, ec.status, ec.published_at, ec.created_at
    from event_types et
    join event_contract_versions ec on ec.event_type_id=et.id and ec.status in ('published','deprecated')
    where et.project_id=${application.project_id} and (et.application_id=${application.id} or et.application_id is null)
    order by et.name, ec.version desc
  `;
  const contracts = new Map<string, CatalogContract>();
  for (const row of rows) {
    const id = String(row.id);
    const existing = contracts.get(id) || { id, name: String(row.name), description: row.description ? String(row.description) : null, versions: [] };
    existing.versions.push({
      version: Number(row.version), schema: row.schema as Record<string, unknown>, example: row.example,
      compatibilityMode: String(row.compatibility_mode) as "backward" | "none",
      compatibilityWarnings: Array.isArray(row.compatibility_warnings) ? row.compatibility_warnings.map(String) : [],
      status: String(row.status), publishedAt: row.published_at ? String(row.published_at) : String(row.created_at)
    });
    contracts.set(id, existing);
  }
  return <CatalogWorkspace application={{ id: String(application.id), name: String(application.name), uid: String(application.uid), description: application.description ? String(application.description) : null }} contracts={[...contracts.values()]} siteUrl={SITE_URL} />;
}
