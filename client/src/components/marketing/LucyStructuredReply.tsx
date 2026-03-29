import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import {
  listItemsToTableRows,
  parseMarketingAssistantSections,
  type MarketingReplySection,
} from '@/pages/marketing/lib/marketingDoraReplyLayout';

interface LucyStructuredReplyProps {
  content: string;
}

const SECTION_TITLE_HINT = /^(notes|rationale|why|checklist|requirements|criteria)\b/i;

function MarkdownBody({ markdown }: { markdown: string }): JSX.Element {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      components={{
        h1: ({ children }) => <h3 className="text-base font-semibold text-app-text mt-2 mb-1">{children}</h3>,
        h2: ({ children }) => <h3 className="text-base font-semibold text-app-text mt-2 mb-1">{children}</h3>,
        h3: ({ children }) => <h4 className="text-sm font-semibold text-app-text mt-2 mb-1">{children}</h4>,
        p: ({ children }) => <p className="my-1">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-4 my-1 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 my-1 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-app-muted">{children}</li>,
        a: ({ href, children }) => (
          <a href={href} className="text-primary-400 underline" target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
        code: ({ className, children, ...props }) => {
          const isBlock = /language-/.test(className ?? '') || String(children).includes('\n');
          if (isBlock) {
            return (
              <pre className="my-2 p-2 rounded-lg bg-app-sidebar overflow-x-auto text-xs">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            );
          }
          return (
            <code className="px-1 py-0.5 bg-app-card rounded text-xs font-mono text-primary-300" {...props}>
              {children}
            </code>
          );
        },
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full text-xs border-collapse border border-app-border">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-app-border px-2 py-1 text-left text-app-muted font-semibold">{children}</th>
        ),
        td: ({ children }) => (
          <td className="border border-app-border px-2 py-1 text-app-muted">{children}</td>
        ),
        hr: () => <hr className="my-2 border-app-border" />,
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}

function SectionCard({
  section,
  index,
}: {
  section: MarketingReplySection;
  index: number;
}): JSX.Element {
  const tableRows = SECTION_TITLE_HINT.test(section.title)
    ? listItemsToTableRows(section.body)
    : null;
  const sectionId = `lucy-section-${index}`;

  return (
    <section
      className="rounded-xl border border-white/[0.08] bg-app-sidebar/30 px-3 py-2.5 mb-2 last:mb-0"
      aria-labelledby={sectionId}
    >
      <h2
        id={sectionId}
        className="text-[10px] font-semibold uppercase tracking-wide text-pink-400/90 mb-1.5"
      >
        {section.title}
      </h2>
      {tableRows ? (
        <div className="overflow-x-auto rounded-lg border border-app-border/80">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-app-sidebar/80">
                <th className="text-left font-medium text-app-muted px-2 py-1.5 border-b border-app-border/60">
                  Item
                </th>
                <th className="text-left font-medium text-app-muted px-2 py-1.5 border-b border-app-border/60">
                  Detail
                </th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.label} className="border-b border-app-border/40 last:border-0">
                  <td className="align-top text-app-text/90 px-2 py-1.5 font-medium w-[38%]">{row.label}</td>
                  <td className="align-top text-app-muted px-2 py-1.5">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-sm text-app-muted leading-relaxed [&_strong]:text-app-text">
          <MarkdownBody markdown={section.body} />
        </div>
      )}
    </section>
  );
}

/**
 * Marketing specialist: splits long prose into labeled cards and optional checklist tables.
 */
export function LucyStructuredReply({ content }: LucyStructuredReplyProps): JSX.Element {
  const sections = parseMarketingAssistantSections(content);
  return (
    <div className="space-y-1">
      {sections.map((s, i) => (
        <SectionCard key={stableSectionListKey(i, s.title)} section={s} index={i} />
      ))}
    </div>
  );
}

function stableSectionListKey(index: number, title: string): string {
  return `${index}-${title.slice(0, 32)}`;
}
