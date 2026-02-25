"use client";

import { Badge } from "@/components/ui/badge";

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  GUIDE: { label: "Rehber", color: "#2563EB" },
  FAQ: { label: "SSS", color: "#7C3AED" },
  SOP: { label: "SOP", color: "#EF4444" },
  MEETING_NOTE: { label: "Toplantı Notu", color: "#F59E0B" },
  SPECIFICATION: { label: "Spesifikasyon", color: "#0891B2" },
  ROADMAP: { label: "Yol Haritası", color: "#059669" },
  MICRO_LEARN: { label: "Mikro Öğrenme", color: "#EC4899" },
  ANNOUNCEMENT: { label: "Duyuru", color: "#F97316" },
  TEMPLATE: { label: "Şablon", color: "#6366F1" },
};

interface DocumentTypeBadgeProps {
  type: string;
}

export function DocumentTypeBadge({ type }: DocumentTypeBadgeProps) {
  const config = TYPE_CONFIG[type] ?? { label: type, color: "#6B7280" };

  return (
    <Badge
      className="text-white text-[10px] uppercase tracking-wider font-semibold"
      style={{ backgroundColor: config.color }}
    >
      {config.label}
    </Badge>
  );
}
