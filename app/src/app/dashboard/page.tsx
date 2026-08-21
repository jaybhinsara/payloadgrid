import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getSessionContext } from "@/lib/auth";
export const metadata: Metadata = { title: "Console", robots: { index: false, follow: false } };
export default async function DashboardPage() { const context = await getSessionContext(); if (context && !context.user.profileComplete) redirect("/account/setup"); return <DashboardClient />; }
