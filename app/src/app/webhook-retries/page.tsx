import { SolutionPage } from "@/components/marketing/solution-page";
import { hasSessionCookie } from "@/lib/auth";
import { publicMetadata } from "@/lib/seo";
import { solutionContent } from "@/lib/solution-content";

export const metadata = publicMetadata({ title: "Webhook Retries, Replay and Dead-Letter Recovery", description: "Recover failed webhooks with automatic backoff, attempt logs, manual and bulk replay, cancellation, and dead-letter resolution that preserves history.", path: "/webhook-retries" });
export default async function Page() { return <SolutionPage content={solutionContent.retries} signedIn={await hasSessionCookie()} />; }
