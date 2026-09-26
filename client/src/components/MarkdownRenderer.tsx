import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`markdown-body text-sm leading-relaxed text-fg/90 select-text ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-4 mb-2 pb-1 text-lg font-bold text-fg border-b border-white/10 first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-4 mb-2 pb-1 text-base font-semibold text-fg border-b border-white/10">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-3 mb-1.5 text-sm font-semibold text-[var(--spectre-cyan)]">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-2 mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
              {children}
            </h4>
          ),
          p: ({ children }) => <p className="mb-2.5 last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="mb-3 list-disc pl-5 space-y-1 marker:text-[var(--spectre-cyan)]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 list-decimal pl-5 space-y-1 marker:text-[var(--spectre-cyan)]">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="pl-1">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-[var(--spectre-cyan)] bg-white/[0.03] px-3 py-1.5 rounded-r text-xs text-muted italic">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-white/10 bg-base/50">
              <table className="w-full border-collapse text-left text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-white/5 border-b border-white/10">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 font-mono text-2xs uppercase tracking-wider text-[var(--spectre-cyan)]">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-t border-white/5 px-3 py-2 text-fg/85 text-xs">{children}</td>
          ),
          tr: ({ children }) => <tr className="hover:bg-white/[0.02]">{children}</tr>,
          hr: () => <hr className="my-3 border-white/10" />,
          code: ({ className, children, ...props }) => {
            const isInline = !className && typeof children === 'string' && !children.includes('\n');
            if (isInline) {
              return (
                <code
                  className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-2xs text-[var(--spectre-cyan)]"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <pre className="my-2.5 overflow-x-auto rounded-lg border border-white/10 bg-[#06080d] p-3 font-mono text-xs text-muted">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            );
          },
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--spectre-cyan)] underline underline-offset-2 hover:text-white transition-colors"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
