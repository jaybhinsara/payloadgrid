"use client";

import type { RefObject } from "react";
import { Bold, Code2, Heading2, Heading3, Italic, Link2, List, ListOrdered, Minus, Pilcrow, Underline } from "lucide-react";

type Props = {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
};

export function MarkdownToolbar({ textareaRef, value, onChange }: Props) {
  function commit(next: string, selectionStart: number, selectionEnd: number) {
    onChange(next);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function wrap(before: string, after = before, placeholder = "text") {
    const field = textareaRef.current; if (!field) return;
    const start = field.selectionStart; const end = field.selectionEnd; const selected = value.slice(start, end) || placeholder;
    commit(`${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`, start + before.length, start + before.length + selected.length);
  }

  function prefix(prefixValue: string, numbered = false) {
    const field = textareaRef.current; if (!field) return;
    const start = value.lastIndexOf("\n", Math.max(0, field.selectionStart - 1)) + 1;
    const nextBreak = value.indexOf("\n", field.selectionEnd); const end = nextBreak === -1 ? value.length : nextBreak;
    const selected = value.slice(start, end) || "Text";
    const lines = selected.split("\n").map((line, index) => `${numbered ? `${index + 1}. ` : prefixValue}${line}`);
    const replacement = lines.join("\n");
    commit(`${value.slice(0, start)}${replacement}${value.slice(end)}`, start, start + replacement.length);
  }

  function code() {
    const field = textareaRef.current; if (!field) return;
    const selected = value.slice(field.selectionStart, field.selectionEnd);
    if (selected.includes("\n")) wrap("```\n", "\n```", "code"); else wrap("`", "`", "code");
  }

  function divider() {
    const field = textareaRef.current; if (!field) return;
    const start = field.selectionStart; const insertion = `${start && value[start - 1] !== "\n" ? "\n" : ""}\n---\n`;
    commit(`${value.slice(0, start)}${insertion}${value.slice(field.selectionEnd)}`, start + insertion.length, start + insertion.length);
  }

  const actions = [
    { label: "Heading 2", icon: Heading2, run: () => prefix("## ") },
    { label: "Heading 3", icon: Heading3, run: () => prefix("### ") },
    { label: "Bold", icon: Bold, run: () => wrap("**", "**", "bold text") },
    { label: "Italic", icon: Italic, run: () => wrap("_", "_", "italic text") },
    { label: "Underline", icon: Underline, run: () => wrap("++", "++", "underlined text") },
    { label: "Link", icon: Link2, run: () => wrap("[", "](https://example.com)", "link text") },
    { label: "Bulleted list", icon: List, run: () => prefix("- ") },
    { label: "Numbered list", icon: ListOrdered, run: () => prefix("", true) },
    { label: "Quote", icon: Pilcrow, run: () => prefix("> ") },
    { label: "Code", icon: Code2, run: code },
    { label: "Divider", icon: Minus, run: divider }
  ];

  return <div className="markdown-toolbar" role="toolbar" aria-label="Article formatting">
    {actions.map(({ label, icon: Icon, run }) => <button key={label} type="button" title={label} aria-label={label} onMouseDown={(event) => event.preventDefault()} onClick={run}><Icon size={15} /></button>)}
  </div>;
}
