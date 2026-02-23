/** Department-based color for avatar border, tags, tab underline */

export interface DepartmentColor {
  primary: string;
  rgb: { r: number; g: number; b: number };
  bgOpacity: number;
  borderOpacity: number;
}

const DEPARTMENT_MAP: Record<string, DepartmentColor> = {
  Engineering: {
    primary: '#3b82f6',
    rgb: { r: 59, g: 130, b: 246 },
    bgOpacity: 0.15,
    borderOpacity: 0.3,
  },
  Product: {
    primary: '#a855f7',
    rgb: { r: 168, g: 85, b: 247 },
    bgOpacity: 0.15,
    borderOpacity: 0.3,
  },
  Design: {
    primary: '#10b981',
    rgb: { r: 16, g: 185, b: 129 },
    bgOpacity: 0.15,
    borderOpacity: 0.3,
  },
  Marketing: {
    primary: '#f59e0b',
    rgb: { r: 245, g: 158, b: 11 },
    bgOpacity: 0.15,
    borderOpacity: 0.3,
  },
  Sales: {
    primary: '#ef4444',
    rgb: { r: 239, g: 68, b: 68 },
    bgOpacity: 0.15,
    borderOpacity: 0.3,
  },
  HR: {
    primary: '#06b6d4',
    rgb: { r: 6, g: 182, b: 212 },
    bgOpacity: 0.15,
    borderOpacity: 0.3,
  },
};

const DEFAULT_COLOR: DepartmentColor = {
  primary: '#64748b',
  rgb: { r: 100, g: 116, b: 139 },
  bgOpacity: 0.15,
  borderOpacity: 0.3,
};

export function getDepartmentColor(department: string): DepartmentColor {
  const key = department?.trim() || '';
  return DEPARTMENT_MAP[key] ?? DEFAULT_COLOR;
}

export function getDepartmentGlow(department: string): string {
  const { rgb } = getDepartmentColor(department);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`;
}
