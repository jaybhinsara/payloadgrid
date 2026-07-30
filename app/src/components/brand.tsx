import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return <Link href={href} className="brand" aria-label="PayloadGrid home"><img className="brand-logo" src="/icon.svg" alt="" width="30" height="30" /><span>PayloadGrid</span></Link>;
}