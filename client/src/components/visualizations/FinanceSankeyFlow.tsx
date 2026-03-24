import { useEffect, useRef, useState } from 'react';
import { select } from 'd3-selection';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';

export interface SankeyNodeData {
  id: string;
  name: string;
  color: string;
}

export interface SankeyLinkData {
  source: string;
  target: string;
  value: number;
}

export interface SankeyData {
  nodes: SankeyNodeData[];
  links: SankeyLinkData[];
}

interface FinanceSankeyFlowProps {
  data: SankeyData | null;
  loading?: boolean;
}

interface SankeyNodeExtra extends SankeyNodeData {
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
}

interface SankeyLinkExtra {
  source: SankeyNodeExtra | string;
  target: SankeyNodeExtra | string;
  value: number;
  y0?: number;
  y1?: number;
  width?: number;
}

export function FinanceSankeyFlow({ data, loading }: FinanceSankeyFlowProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });

  useEffect(() => {
    if (!svgRef.current || !data || data.nodes.length === 0 || data.links.length === 0) return;

    const container = svgRef.current.parentElement;
    if (container) {
      const ro = new ResizeObserver((entries) => {
        const { width, height } = entries[0]?.contentRect ?? { width: 800, height: 400 };
        setDimensions({ width, height });
      });
      ro.observe(container);
      return () => ro.disconnect();
    }
  }, [data]);

  useEffect(() => {
    if (!svgRef.current || !data || data.nodes.length === 0 || data.links.length === 0) return;

    const { width, height } = dimensions;

    const nodeMap = new Map<string, SankeyNodeExtra>();
    for (const n of data.nodes) {
      nodeMap.set(n.id, { ...n });
    }

    const links: SankeyLinkExtra[] = data.links.map((l) => ({
      source: nodeMap.get(l.source) ?? l.source,
      target: nodeMap.get(l.target) ?? l.target,
      value: l.value,
    }));

    const nodes = Array.from(nodeMap.values());

    const sankeyGen = sankey<SankeyNodeExtra, SankeyLinkExtra>()
      .nodeWidth(20)
      .nodePadding(12)
      .extent([
        [10, 10],
        [width - 10, height - 10],
      ]);

    const { nodes: layoutNodes, links: layoutLinks } = sankeyGen({
      nodes: nodes.map((n) => ({ ...n })),
      links,
    });

    const svg = select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.attr('width', width).attr('height', height).append('g');

    const link = g
      .append('g')
      .attr('fill', 'none')
      .attr('stroke-opacity', 0.4)
      .selectAll('path')
      .data(layoutLinks)
      .join('path')
      .attr('stroke', (d: SankeyLinkExtra) => {
        const s = d.source as SankeyNodeExtra;
        return s.color ?? '#64748B';
      })
      .attr('stroke-width', (d: SankeyLinkExtra) => Math.max(2, d.width ?? 0))
      .attr('d', sankeyLinkHorizontal());

    link.append('title').text((d: SankeyLinkExtra) => `${d.value.toLocaleString()}`);

    const node = g
      .append('g')
      .selectAll('g')
      .data(layoutNodes)
      .join('g')
      .attr('transform', (d: SankeyNodeExtra) => `translate(${d.x0 ?? 0},${d.y0 ?? 0})`);

    node
      .append('rect')
      .attr('height', (d: SankeyNodeExtra) => (d.y1 ?? 0) - (d.y0 ?? 0))
      .attr('width', (d: SankeyNodeExtra) => (d.x1 ?? 0) - (d.x0 ?? 0))
      .attr('fill', (d: SankeyNodeExtra) => d.color)
      .attr('rx', 4)
      .attr('ry', 4);

    node
      .append('text')
      .attr('x', (d: SankeyNodeExtra) => {
        const w = (d.x1 ?? 0) - (d.x0 ?? 0);
        return (d.x0 ?? 0) < width / 2 ? -6 : w + 6;
      })
      .attr('y', (d: SankeyNodeExtra) => ((d.y1 ?? 0) - (d.y0 ?? 0)) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', (d: SankeyNodeExtra) => ((d.x0 ?? 0) < width / 2 ? 'end' : 'start'))
      .attr('fill', '#94A3B8')
      .attr('font-size', 11)
      .text((d: SankeyNodeExtra) => d.name);
  }, [data, dimensions]);

  if (loading) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)]">
        <div className="animate-pulse text-app-muted">Loading flow...</div>
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] text-app-muted">
        No financial flow data available for the selected period.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
      <h3 className="mb-3 text-sm font-semibold text-app-text">Money Flow</h3>
      <svg ref={svgRef} className="w-full overflow-visible" role="img" aria-label="Financial flow Sankey diagram showing money flow between categories" />
    </div>
  );
}
