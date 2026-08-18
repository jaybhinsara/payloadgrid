import { SolutionPage } from "@/components/marketing/solution-page";
import { hasSessionCookie } from "@/lib/auth";
import { publicMetadata } from "@/lib/seo";
import { solutionContent } from "@/lib/solution-content";

export const metadata = publicMetadata({ title: "Webhook Testing, Debugging and Local Replay", description: "Inspect webhook requests and responses, simulate edited payloads, replay deliveries, filter history, and forward production-shaped events to localhost.", path: "/webhook-testing" });
export default async function Page() { return <SolutionPage content={solutionContent.testing} signedIn={await hasSessionCookie()} />; }
