import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownProps {
  children: string;
}

/**
 * Renders assistant markdown the way zeron does: real headings, bold, lists,
 * inline-code pills, fenced code blocks, links and tables — all themed to the
 * app's dark surface.
 */
export const Markdown: React.FC<MarkdownProps> = ({ children }) => {
  return (
    <div className="md-body text-[13.5px] leading-relaxed text-zinc-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-[17px] font-semibold text-zinc-100 mt-3 mb-1.5 first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-[15px] font-semibold text-zinc-100 mt-3 mb-1.5 first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-[13.5px] font-semibold text-zinc-100 mt-2.5 mb-1 first:mt-0">{children}</h3>
          ),
          p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-zinc-50">{children}</strong>,
          em: ({ children }) => <em className="italic text-zinc-200">{children}</em>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-sky-400 hover:text-sky-300 underline underline-offset-2 break-words"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-5 my-1.5 space-y-1 marker:text-zinc-600">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 my-1.5 space-y-1 marker:text-zinc-500 marker:font-medium">{children}</ol>
          ),
          li: ({ children }) => <li className="pl-1">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-white/15 pl-3 my-2 text-zinc-400">{children}</blockquote>
          ),
          hr: () => <hr className="my-3 border-white/10" />,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full text-[12px] border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="px-2.5 py-1.5 text-left font-semibold text-zinc-300 bg-white/[0.04] border-b border-white/10">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-2.5 py-1.5 text-zinc-300 border-b border-white/[0.06]">{children}</td>
          ),
          pre: ({ children }) => (
            <pre className="my-2 rounded-lg bg-black/50 border border-white/10 p-3 overflow-x-auto text-[12px] leading-5 font-mono text-zinc-200">
              {children}
            </pre>
          ),
          code: ({ className, children }) => {
            const text = String(children ?? '');
            const isBlock = /language-/.test(className || '') || text.includes('\n');
            if (isBlock) {
              return <code className="font-mono text-[12px] text-zinc-200">{children}</code>;
            }
            return (
              <code className="font-mono text-[12px] rounded px-1 py-0.5 bg-rose-400/[0.12] text-rose-300">
                {children}
              </code>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};
