import { PublicHeaderClient } from "@/components/marketing/public-header-client";
import { hasSessionCookie } from "@/lib/auth";

export async function PublicHeader({ signedIn }: { signedIn?: boolean }) {
  const authenticated = signedIn ?? await hasSessionCookie();
  return <PublicHeaderClient signedIn={authenticated} />;
}
