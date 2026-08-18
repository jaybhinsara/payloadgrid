import { SolutionPage } from "@/components/marketing/solution-page";
import { hasSessionCookie } from "@/lib/auth";
import { publicMetadata } from "@/lib/seo";
import { solutionContent } from "@/lib/solution-content";

export const metadata = publicMetadata({ title: "Webhook Service and Webhooks as a Service", description: "Use PayloadGrid as your webhook service for inbound receiving, outbound delivery, signatures, retries, replay, testing, logs, and embedded customer controls.", path: "/webhook-service" });
export default async function Page() { return <SolutionPage content={solutionContent.service} signedIn={await hasSessionCookie()} />; }
