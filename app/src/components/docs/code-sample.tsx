"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CodeSample({ label, language, value }: { label: string; language: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return <figure className="docs-sample"><figcaption><span>{label}</span><code>{language}</code><button onClick={() => void copy()} aria-label={`Copy ${label}`}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}</button></figcaption><pre><code>{value}</code></pre></figure>;
}
