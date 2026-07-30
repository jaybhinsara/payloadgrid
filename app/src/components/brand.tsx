import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return <Link href={href} className="brand" aria-label="HookIn home"><span className="brand-mark"><i /><i /><i /></span><span>HookIn</span></Link>;
}