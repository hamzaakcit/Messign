/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { Goal, KeyResult } from '@/lib/okrApi';

export interface GoalNode {
  id: string;
  title: string;
  level: 'company' | 'department' | 'team' | 'individual';
  progress: number;
  status: 'on_track' | 'at_risk' | 'behind' | 'completed';
  owner: string;
  parentId: string | null;
  keyResults?: { id: string; title: string; progress: number }[];
}

const STATUS_COLORS: Record<string, string> = {
  on_track: '#10B981',
  at_risk: '#F59E0B',
  behind: '#EF4444',
  completed: '#3B82F6',
};

const LEVEL_RADIUS: Record<string, number> = {
  company: 28,
  department: 20,
  team: 14,
  individual: 14,
};

function flattenTree(goals: Goal[], parentId: string | null = null): GoalNode[] {
  const out: GoalNode[] = [];
  for (const g of goals) {
    out.push({
      id: g.id,
      title: g.title,
      level: g.level,
      progress: Number(g.progress) || 0,
      status: g.status,
      owner: g.owner_name || 'Unknown',
      parentId,
      keyResults: g.key_results?.map((kr: KeyResult) => ({
        id: kr.id,
        title: kr.title,
        progress: Number(kr.progress) || 0,
      })),
    });
    if (g.children && g.children.length > 0) {
      out.push(...flattenTree(g.children, g.id));
    }
  }
  return out;
}

function buildNodesAndLinks(goals: Goal[], expandedId: string | null) {
  const baseNodes = flattenTree(goals);
  const links: { source: string; target: string }[] = [];
  const nodeMap = new Map<string, GoalNode>();

  for (const n of baseNodes) {
    nodeMap.set(n.id, n);
    if (n.parentId) {
      links.push({ source: n.parentId, target: n.id });
    }
  }

  if (expandedId && nodeMap.has(expandedId)) {
    const goal = nodeMap.get(expandedId)!;
    if (goal.keyResults && goal.keyResults.length > 0) {
      for (const kr of goal.keyResults) {
        const krId = `kr-${kr.id}`;
        nodeMap.set(krId, {
          id: krId,
          title: kr.title,
          level: 'individual',
          progress: kr.progress,
          status: 'on_track',
          owner: '',
          parentId: goal.id,
        });
        links.push({ source: goal.id, target: krId });
      }
    }
  }

  return { nodes: Array.from(nodeMap.values()), links };
}

interface OKRGoalTreeProps {
  goals: Goal[];
  periodId: string;
  onGoalClick?: (goalId: string) => void;
}

export function OKRGoalTree({ goals, periodId, onGoalClick }: OKRGoalTreeProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: GoalNode } | null>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || goals.length === 0) return;

    const { nodes, links } = buildNodesAndLinks(goals, expandedId);
    if (nodes.length === 0) return;

    const width = containerRef.current.clientWidth;
    const height = Math.max(400, Math.min(600, nodes.length * 40));

    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3
      .select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height]);

    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.3, 3]).on('zoom', (event: { transform: { toString: () => string } }) => {
      g.attr('transform', event.transform.toString());
    });
    svg.call(zoom);

    const simulation = d3
      .forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force(
        'link',
        d3.forceLink(links).id((d: any) => d.id).distance(80),
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(35));

    const link = g
      .append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#475569')
      .attr('stroke-opacity', 0.5)
      .attr('stroke-width', 2);

    const nodeGroups = g
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, GoalNode, GoalNode>()
          .on('start', (event: any, d: any) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event: any, d: any) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event: any, d: any) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }) as any,
      );

    nodeGroups
      .append('circle')
      .attr('r', (d: GoalNode) => {
        const base = LEVEL_RADIUS[d.level] ?? 14;
        const scale = 0.5 + (d.progress / 100) * 0.5;
        return base * scale;
      })
      .attr('fill', (d: GoalNode) => STATUS_COLORS[d.status] ?? '#64748B')
      .attr('stroke', '#1e293b')
      .attr('stroke-width', 2);

    nodeGroups.each(function (this: d3.BaseType, d: GoalNode) {
      const base = LEVEL_RADIUS[d.level] ?? 14;
      const scale = 0.5 + (d.progress / 100) * 0.5;
      const r = base * scale;
      const circ = 2 * Math.PI * r;
      const dash = (d.progress / 100) * circ;
      d3.select(this)
        .append('circle')
        .attr('r', r)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(255,255,255,0.3)')
        .attr('stroke-width', 3)
        .attr('stroke-dasharray', `${dash} ${circ - dash}`)
        .attr('transform', 'rotate(-90)');
    });

    nodeGroups
      .on('click', (_: PointerEvent, d: GoalNode) => {
        if (d.id.startsWith('kr-')) return;
        setExpandedId((prev) => (prev === d.id ? null : d.id));
        onGoalClick?.(d.id);
      })
      .on('mouseenter', (event: MouseEvent, d: GoalNode) => {
        setTooltip({ x: event.pageX, y: event.pageY, node: d });
      })
      .on('mouseleave', () => setTooltip(null));

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => (d.source?.x ?? 0))
        .attr('y1', (d: any) => (d.source?.y ?? 0))
        .attr('x2', (d: any) => (d.target?.x ?? 0))
        .attr('y2', (d: any) => (d.target?.y ?? 0));

      nodeGroups.attr('transform', (d: any) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [goals, periodId, expandedId, onGoalClick]);

  return (
    <div ref={containerRef} className="relative w-full rounded-lg border border-[var(--app-border)] p-4 bg-[var(--app-bg)]">
      <svg ref={svgRef} className="w-full" role="img" aria-label="Interactive OKR goal tree showing goals and key results with progress" />
      {tooltip && (
        <div
          className="fixed z-50 px-3 py-2 rounded-lg bg-[var(--app-card)] border border-[var(--app-border)] text-sm shadow-lg pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
          <div className="font-medium text-white">{tooltip.node.title}</div>
          <div className="text-gray-400 text-xs mt-1">{tooltip.node.owner}</div>
          <div className="text-gray-400 text-xs">
            {tooltip.node.progress.toFixed(0)}% · {tooltip.node.keyResults?.length ?? 0} key results
          </div>
          <div className="text-xs mt-1 text-gray-500">{tooltip.node.status}</div>
        </div>
      )}
    </div>
  );
}
