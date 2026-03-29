import { useMemo } from 'react';
import { BookOpen, ExternalLink, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { DoraWidgetShell } from './DoraWidgetShell';

export interface KnowledgeDocRow {
  id?: string;
  title: string;
  slug?: string;
  document_type?: string;
}

interface KnowledgeAggregatesShape {
  count: number;
  byType: Record<string, number>;
}

interface ParsedKnowledgeData {
  documents: KnowledgeDocRow[];
  aggregates: KnowledgeAggregatesShape | null;
  query: string;
  confidence: number | null;
}

const TYPE_COLORS = ['#38bdf8', '#a855f7', '#22c55e', '#f59e0b', '#94a3b8'];

/** Short queries are shown in a denser layout (no LLM). */
function isLikelyDefinitionalSearch(query: string | undefined): boolean {
  if (!query?.trim()) return false;
  return query.trim().split(/\s+/).length <= 4;
}

function parseData(data: unknown): ParsedKnowledgeData {
  if (!data) return { documents: [], aggregates: null, query: '', confidence: null };
  if (Array.isArray(data)) {
    return { documents: data as KnowledgeDocRow[], aggregates: null, query: '', confidence: null };
  }
  const o = data as Record<string, unknown>;
  return {
    documents: Array.isArray(o.documents) ? (o.documents as KnowledgeDocRow[]) : [],
    aggregates: (o.aggregates as KnowledgeAggregatesShape) ?? null,
    query: typeof o.query === 'string' ? o.query : '',
    confidence: typeof o.confidence === 'number' ? o.confidence : null,
  };
}

/**
 * Compact doc cards for knowledge search tool results (real IDs/slugs from the server).
 */
export default function KnowledgeDocListWidget({
  data,
  title = 'Knowledge search',
  delay = 0,
}: {
  data: unknown;
  title?: string;
  delay?: number;
}): JSX.Element {
  const { documents, aggregates, query, confidence } = parseData(data);

  const compactLayout = useMemo(() => {
    if (documents.length === 0) return false;
    return documents.length <= 5 || isLikelyDefinitionalSearch(query);
  }, [documents.length, query]);

  const typePie = useMemo(() => {
    const src = aggregates?.byType && Object.keys(aggregates.byType).length > 0 ? aggregates.byType : null;
    if (!src) return [];
    return Object.entries(src)
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0);
  }, [aggregates]);

  const subtitleParts: string[] = [];
  if (query) subtitleParts.push(`“${query}”`);
  if (documents.length > 0) subtitleParts.push(`${documents.length} result(s)`);
  if (confidence != null) subtitleParts.push(`${Math.round(confidence * 100)}% match`);
  const subtitle = subtitleParts.join(' · ') || undefined;

  if (documents.length === 0) {
    return (
      <DoraWidgetShell
        title={title}
        icon={<BookOpen className="w-3.5 h-3.5 text-sky-400" />}
        subtitle={subtitle ?? 'No matches'}
        accentGradient="linear-gradient(90deg, #38bdf8, #8b5cf6)"
        delay={delay}
      >
        <p className="text-sm dora-chat-text-secondary">No documents matched this search.</p>
        <p className="text-xs dora-chat-text-tertiary mt-1">Try different keywords or browse the Knowledge Hub.</p>
      </DoraWidgetShell>
    );
  }

  return (
    <DoraWidgetShell
      title={title}
      icon={<Search className="w-3.5 h-3.5 text-sky-400" />}
      subtitle={subtitle}
      accentGradient="linear-gradient(90deg, #38bdf8, #8b5cf6)"
      delay={delay}
    >
      <div className="space-y-3">
        {compactLayout ? (
          <p className="text-sm text-app-text/90 px-0.5">
            <BookOpen className="w-3.5 h-3.5 inline-block mr-1.5 align-text-bottom text-sky-400" />
            <span className="font-medium tabular-nums">{documents.length}</span> document
            {documents.length === 1 ? '' : 's'}
            {confidence != null ? (
              <>
                {' '}
                · <span className="tabular-nums">{Math.round(confidence * 100)}%</span> match
              </>
            ) : null}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-app-border/70 bg-app-bg/30 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-app-muted">Documents</div>
              <div className="text-lg font-bold text-app-text tabular-nums flex items-center gap-1">
                <BookOpen className="w-4 h-4 text-sky-400" />
                {documents.length}
              </div>
            </div>
            <div className="rounded-xl border border-app-border/70 bg-app-bg/30 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-app-muted">Match</div>
              <div className="text-lg font-bold text-app-text tabular-nums">
                {confidence != null ? `${Math.round(confidence * 100)}%` : '—'}
              </div>
            </div>
          </div>
        )}

        {!compactLayout && typePie.length > 0 && (
          <div className="rounded-xl border border-app-border/60 p-2" style={{ minHeight: 140 }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted mb-1 px-1">
              By type
            </p>
            <div style={{ height: 120 }} className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={typePie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={28}
                    outerRadius={48}
                    paddingAngle={2}
                  >
                    {typePie.map((_, i) => (
                      <Cell key={`c-${i}`} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(15,23,42,0.95)',
                      border: '1px solid rgba(148,163,184,0.15)',
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <ul className="divide-y divide-app-border/40 max-h-72 overflow-y-auto rounded-lg border border-app-border/50">
          {documents.map((doc) => {
            const href = `/knowledge-hub/documents/${doc.slug ?? doc.id ?? ''}`;
            return (
              <li key={String(doc.id ?? doc.slug ?? doc.title)} className="px-3 py-2 hover:bg-app-sidebar/50">
                <Link
                  to={href}
                  className="flex items-start gap-2 text-sm text-sky-400 hover:text-sky-300 group"
                >
                  <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-70 group-hover:opacity-100" />
                  <span className="min-w-0">
                    <span className="text-app-text group-hover:text-sky-300 line-clamp-2">{doc.title}</span>
                    {doc.document_type ? (
                      <span className="block text-[10px] text-app-muted mt-0.5">{doc.document_type}</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </DoraWidgetShell>
  );
}
