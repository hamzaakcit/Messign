import type { Role } from "@prisma/client";

const ROLE_HIERARCHY: Record<Role, number> = {
  ADMIN: 100,
  CPO: 80,
  EDITOR: 60,
  REVIEWER: 40,
  VIEWER: 20,
};

export function hasRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export function canCreateDocument(role: Role): boolean {
  return hasRole(role, "EDITOR");
}

export function canReviewDocument(role: Role): boolean {
  return hasRole(role, "REVIEWER");
}

export function canPublishDocument(role: Role): boolean {
  return hasRole(role, "CPO");
}

export function canManageUsers(role: Role): boolean {
  return role === "ADMIN";
}

export function canManageCategories(role: Role): boolean {
  return hasRole(role, "CPO");
}

export function canManageTags(role: Role): boolean {
  return hasRole(role, "CPO");
}

export function canDeleteDocument(role: Role, isAuthor: boolean): boolean {
  if (role === "ADMIN") return true;
  if (role === "CPO") return true;
  return isAuthor && hasRole(role, "EDITOR");
}

export function canEditDocument(
  role: Role,
  isAuthor: boolean
): boolean {
  if (hasRole(role, "CPO")) return true;
  return isAuthor && hasRole(role, "EDITOR");
}

export function canAccessAdmin(role: Role): boolean {
  return hasRole(role, "REVIEWER");
}
