import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownContent({ content }: { content: string }) {
  return <div className="blog-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    a: ({ href, children }) => <a href={href} rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}>{children}</a>,
    img: ({ src, alt }) => <img src={typeof src === "string" ? src : ""} alt={alt || ""} loading="lazy" />,
    code: ({ children, className }) => <code className={className}>{children}</code>
  }}>{content}</ReactMarkdown></div>;
}
