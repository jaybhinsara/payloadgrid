import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownNode = { type: string; value?: string; children?: MarkdownNode[]; data?: { hName?: string } };

function remarkUnderline() {
  return (tree: MarkdownNode) => {
    function walk(node: MarkdownNode) {
      if (!node.children) return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== "text" || !child.value?.includes("++")) { walk(child); return [child]; }
        const parts: MarkdownNode[] = []; const pattern = /\+\+(.+?)\+\+/g; let cursor = 0; let match: RegExpExecArray | null;
        while ((match = pattern.exec(child.value))) {
          if (match.index > cursor) parts.push({ type: "text", value: child.value.slice(cursor, match.index) });
          parts.push({ type: "underline", data: { hName: "u" }, children: [{ type: "text", value: match[1] }] });
          cursor = match.index + match[0].length;
        }
        if (!parts.length) return [child];
        if (cursor < child.value.length) parts.push({ type: "text", value: child.value.slice(cursor) });
        return parts;
      });
    }
    walk(tree);
  };
}

export function MarkdownContent({ content }: { content: string }) {
  return <div className="blog-markdown"><ReactMarkdown remarkPlugins={[remarkGfm, remarkUnderline]} components={{
    a: ({ href, children }) => <a href={href} rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}>{children}</a>,
    img: ({ src, alt }) => <img src={typeof src === "string" ? src : ""} alt={alt || ""} loading="lazy" />,
    code: ({ children, className }) => <code className={className}>{children}</code>
  }}>{content}</ReactMarkdown></div>;
}
