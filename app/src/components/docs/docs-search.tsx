"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type SearchItem = { slug: string; category: string; title: string; summary: string; terms: string };

export function DocsSearch({ items, large = false }: { items: SearchItem[]; large?: boolean }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return items.filter((item) => terms.every((term) => item.terms.includes(term))).slice(0, 7);
  }, [items, query]);

  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", focus);
    return () => window.removeEventListener("keydown", focus);
  }, []);

  return <div className={`docs-search ${large ? "large" : ""}`}>
    <div><Search size={large ? 19 : 15} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search PayloadGrid docs" aria-label="Search documentation" />{query ? <button onClick={() => setQuery("")} aria-label="Clear documentation search"><X size={14} /></button> : <kbd>/</kbd>}</div>
    {query ? <div className="docs-search-results">{results.length ? results.map((item) => <Link key={item.slug} href={`/docs/${item.slug}`} onClick={() => setQuery("")}><span>{item.category}</span><strong>{item.title}</strong><small>{item.summary}</small></Link>) : <p>No documentation matches <strong>{query}</strong>.</p>}</div> : null}
  </div>;
}
