import { SolutionPage } from "@/components/marketing/solution-page";
import { hasSessionCookie } from "@/lib/auth";
import { publicMetadata } from "@/lib/seo";
import { solutionContent } from "@/lib/solution-content";

export const metadata = publicMetadata({ title: "Inbound Webhook Gateway and Receiver", description: "Receive, verify, buffer, inspect, and forward provider callbacks through a durable webhook gateway for JSON, forms, XML, text, and payment webhooks.", path: "/webhook-gateway" });
export default async function Page() { return <SolutionPage content={solutionContent.gateway} signedIn={await hasSessionCookie()} />; }
