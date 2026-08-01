import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113) || a >= 224;
}

function isPrivateIpv6(address: string) {
  const value = address.toLowerCase().split("%")[0];
  if (value === "::" || value === "::1") return true;
  if (value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb")) return true;
  if (value.startsWith("::ffff:")) return isPrivateIpv4(value.slice(7));
  if (value.startsWith("2001:db8:") || value.startsWith("ff")) return true;
  return !["2", "3"].includes(value[0]);
}

function isPrivateAddress(address: string) {
  const version = isIP(address);
  return version === 4 ? isPrivateIpv4(address) : version === 6 ? isPrivateIpv6(address) : true;
}

export async function assertSafeDestinationUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Destination URL is invalid"); }
  if (url.username || url.password) throw new Error("Destination URLs cannot contain credentials");
  if (url.hash) throw new Error("Destination URLs cannot contain fragments");
  const allowLocalHttp = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(allowLocalHttp && url.protocol === "http:")) throw new Error("Production destinations must use HTTPS");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname === "metadata.google.internal") {
    if (!allowLocalHttp) throw new Error("Destination must use a public internet host");
    return url.toString();
  }
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error("Private and reserved destination addresses are blocked");
    return url.toString();
  }
  let addresses: Array<{ address: string }>;
  try { addresses = await lookup(hostname, { all: true, verbatim: true }); } catch { throw new Error("Destination hostname could not be resolved"); }
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("Destination resolves to a private or reserved address");
  return url.toString();
}