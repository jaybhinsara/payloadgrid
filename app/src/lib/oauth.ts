import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { acceptInvitation, createDefaultWorkspace, findInvitationById } from "@/lib/account-provisioning";
import { requireSql } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/security";
import { SITE_URL } from "@/lib/site";

export const OAUTH_PROVIDERS = ["google", "github"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

type StartOptions = { inviteToken?: string; returnTo?: string };
type ProviderProfile = { providerUserId: string; email: string; name: string };
type OAuthState = { codeVerifier: string | null; nonce: string; invitationId: string | null; returnTo: string };

const providerConfiguration = {
  google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  github: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"]
} satisfies Record<OAuthProvider, string[]>;

export class OAuthError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export function isOAuthProvider(value: string): value is OAuthProvider {
  return OAUTH_PROVIDERS.includes(value as OAuthProvider);
}

export function configuredOAuthProviders() {
  return OAUTH_PROVIDERS.filter((provider) => providerConfiguration[provider].every((key) => Boolean(process.env[key])));
}

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new OAuthError("oauth_not_configured", `${name} is not configured`);
  return value;
}

export function safeReturnTo(value?: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

function callbackUrl(provider: OAuthProvider) {
  return `${SITE_URL}/api/auth/oauth/${provider}/callback`;
}

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function invitationIdForToken(inviteToken?: string) {
  if (!inviteToken) return null;
  const sql = requireSql();
  const [invitation] = await sql`
    select id from organization_invitations
    where token_hash = ${sha256(inviteToken)} and accepted_at is null and expires_at > now()
    limit 1
  `;
  if (!invitation) throw new OAuthError("oauth_invitation_invalid", "The invitation is invalid or expired");
  return String(invitation.id);
}

export async function startOAuth(provider: OAuthProvider, options: StartOptions = {}) {
  if (!configuredOAuthProviders().includes(provider)) throw new OAuthError("oauth_not_configured", "This sign-in provider is not configured");
  const sql = requireSql();
  const state = randomToken(32);
  const nonce = randomToken(32);
  const codeVerifier = randomToken(48);
  const invitationId = await invitationIdForToken(options.inviteToken);
  await sql`
    insert into oauth_states (state_hash, provider, code_verifier, nonce, invitation_id, return_to, expires_at)
    values (${sha256(state)}, ${provider}, ${codeVerifier}, ${nonce}, ${invitationId}, ${safeReturnTo(options.returnTo)}, now() + interval '10 minutes')
  `;

  if (provider === "google") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: requiredEnvironment("GOOGLE_CLIENT_ID"),
      redirect_uri: callbackUrl(provider),
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: pkceChallenge(codeVerifier!),
      code_challenge_method: "S256",
      prompt: "select_account"
    }).toString();
    return url.toString();
  }

  {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.search = new URLSearchParams({
      client_id: requiredEnvironment("GITHUB_CLIENT_ID"),
      redirect_uri: callbackUrl(provider),
      scope: "user:email",
      state,
      code_challenge: pkceChallenge(codeVerifier!),
      code_challenge_method: "S256"
    }).toString();
    return url.toString();
  }

}

async function consumeState(provider: OAuthProvider, state: string): Promise<OAuthState> {
  const sql = requireSql();
  const [record] = await sql`
    delete from oauth_states
    where state_hash = ${sha256(state)} and provider = ${provider} and expires_at > now()
    returning code_verifier, nonce, invitation_id, return_to
  `;
  if (!record) throw new OAuthError("oauth_state_invalid", "The sign-in request expired or has already been used");
  return {
    codeVerifier: record.code_verifier ? String(record.code_verifier) : null,
    nonce: String(record.nonce),
    invitationId: record.invitation_id ? String(record.invitation_id) : null,
    returnTo: safeReturnTo(String(record.return_to))
  };
}

async function postToken(url: string, values: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values),
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || payload.error) throw new OAuthError("oauth_exchange_failed", String(payload.error_description || payload.error || "Provider token exchange failed"));
  return payload;
}

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
async function googleProfile(code: string, state: OAuthState): Promise<ProviderProfile> {
  const token = await postToken("https://oauth2.googleapis.com/token", {
    code,
    client_id: requiredEnvironment("GOOGLE_CLIENT_ID"),
    client_secret: requiredEnvironment("GOOGLE_CLIENT_SECRET"),
    redirect_uri: callbackUrl("google"),
    grant_type: "authorization_code",
    code_verifier: state.codeVerifier || ""
  });
  if (!token.id_token) throw new OAuthError("oauth_profile_invalid", "Google did not return an identity token");
  const { payload } = await jwtVerify(String(token.id_token), googleKeys, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: requiredEnvironment("GOOGLE_CLIENT_ID")
  });
  if (payload.nonce !== state.nonce || !payload.sub || !payload.email || payload.email_verified !== true) {
    throw new OAuthError("oauth_profile_invalid", "Google identity verification failed");
  }
  return { providerUserId: payload.sub, email: String(payload.email).toLowerCase(), name: String(payload.name || payload.email).slice(0, 80) };
}

async function githubProfile(code: string, state: OAuthState): Promise<ProviderProfile> {
  const token = await postToken("https://github.com/login/oauth/access_token", {
    code,
    client_id: requiredEnvironment("GITHUB_CLIENT_ID"),
    client_secret: requiredEnvironment("GITHUB_CLIENT_SECRET"),
    redirect_uri: callbackUrl("github"),
    code_verifier: state.codeVerifier || ""
  });
  const headers = { accept: "application/vnd.github+json", authorization: `Bearer ${String(token.access_token)}`, "x-github-api-version": "2022-11-28" };
  const [userResponse, emailsResponse] = await Promise.all([
    fetch("https://api.github.com/user", { headers, cache: "no-store" }),
    fetch("https://api.github.com/user/emails", { headers, cache: "no-store" })
  ]);
  if (!userResponse.ok || !emailsResponse.ok) throw new OAuthError("oauth_profile_invalid", "GitHub profile lookup failed");
  const user = await userResponse.json() as Record<string, unknown>;
  const emails = await emailsResponse.json() as Array<Record<string, unknown>>;
  const emailRecord = emails.find((item) => item.primary === true && item.verified === true) || emails.find((item) => item.verified === true);
  if (!user.id || !emailRecord?.email) throw new OAuthError("oauth_email_required", "A verified GitHub email address is required");
  return {
    providerUserId: String(user.id),
    email: String(emailRecord.email).toLowerCase(),
    name: String(user.name || user.login || emailRecord.email).slice(0, 80)
  };
}


async function establishAccount(provider: OAuthProvider, profile: ProviderProfile, invitationId: string | null) {
  const sql = requireSql();
  const [linked] = await sql`
    select u.id, u.name, u.email, u.suspended_at, u.profile_completed_at
    from oauth_accounts oa join users u on u.id = oa.user_id
    where oa.provider = ${provider} and oa.provider_user_id = ${profile.providerUserId}
    limit 1
  `;
  let user = linked;
  if (!user) {
    [user] = await sql`select id, name, email, suspended_at, profile_completed_at from users where lower(email) = ${profile.email} limit 1`;
    if (!user) {
      [user] = await sql`
        insert into users (name, email, password_hash, email_verified_at, verification_required, profile_completed_at)
        values (${profile.name}, ${profile.email}, null, now(), false, null)
        returning id, name, email, profile_completed_at
      `;
    } else {
      // If this OAuth login is the account's first verification, any existing
      // password was never proven to belong to the real owner (someone could have
      // pre-registered this email with a password of their choosing). Clear it so
      // that pre-set password no longer works, instead of silently activating it.
      await sql`
        update users
        set password_hash = case when email_verified_at is null then null else password_hash end,
          email_verified_at = coalesce(email_verified_at, now()),
          updated_at = now()
        where id = ${user.id}
      `;
    }
    const linkedRows = await sql`
      insert into oauth_accounts (user_id, provider, provider_user_id, email_at_linking)
      values (${user.id}, ${provider}, ${profile.providerUserId}, ${profile.email})
      on conflict (provider, provider_user_id) do nothing
      returning user_id
    `;
    if (!linkedRows.length) {
      const [winner] = await sql`select user_id from oauth_accounts where provider = ${provider} and provider_user_id = ${profile.providerUserId}`;
      if (!winner || String(winner.user_id) !== String(user.id)) throw new OAuthError("oauth_account_conflict", "This provider account is linked to another user");
    }
  }

  if (user.suspended_at) throw new OAuthError("account_suspended", "This account is suspended. Contact PayloadGrid support.");

  let organizationId: string | null = null;
  if (invitationId) {
    const invitation = await findInvitationById(invitationId, profile.email);
    if (!invitation) throw new OAuthError("oauth_invitation_invalid", "The invitation is invalid, expired, or belongs to another email");
    organizationId = await acceptInvitation(String(user.id), invitation);
  }
  const [membership] = await sql`select organization_id from organization_members where user_id = ${user.id} order by created_at asc limit 1`;
  if (!membership) {
    const workspaceName = `${profile.name.split(" ")[0] || "My"}'s workspace`;
    organizationId = (await createDefaultWorkspace(String(user.id), workspaceName)).organizationId;
  } else if (!organizationId) {
    organizationId = String(membership.organization_id);
  }
  return { userId: String(user.id), organizationId, profileComplete: Boolean(user.profile_completed_at) };
}

export async function completeOAuth(provider: OAuthProvider, input: { code: string; state: string }) {
  const oauthState = await consumeState(provider, input.state);
  const profile = provider === "google"
    ? await googleProfile(input.code, oauthState)
    : await githubProfile(input.code, oauthState);
  const account = await establishAccount(provider, profile, oauthState.invitationId);
  return { ...account, returnTo: oauthState.returnTo };
}
