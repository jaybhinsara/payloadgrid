import { SolutionPage } from "@/components/marketing/solution-page";
import { hasSessionCookie } from "@/lib/auth";
import { publicMetadata } from "@/lib/seo";
import { solutionContent } from "@/lib/solution-content";

export const metadata = publicMetadata({ title: "Outbound Webhook Delivery Platform", description: "Send customer-facing webhooks with transactional fan-out, HMAC signatures, automatic retries, searchable logs, replay, and embedded endpoint management.", path: "/webhook-delivery" });
export default async function Page() { return <SolutionPage content={solutionContent.delivery} signedIn={await hasSessionCookie()} />; }
