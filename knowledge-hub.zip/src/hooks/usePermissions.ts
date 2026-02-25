import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Role } from "@prisma/client";

export function usePermissions() {
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/documents?limit=0`);
        // Placeholder: in production, fetch user role from a dedicated endpoint
        setRole("VIEWER" as Role);
      } catch {
        setRole("VIEWER" as Role);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const hasMinRole = (required: Role): boolean => {
    if (!role) return false;
    const hierarchy: Record<string, number> = {
      ADMIN: 100,
      CPO: 80,
      EDITOR: 60,
      REVIEWER: 40,
      VIEWER: 20,
    };
    return (hierarchy[role] ?? 0) >= (hierarchy[required] ?? 0);
  };

  return {
    role,
    loading,
    canCreate: () => hasMinRole("EDITOR"),
    canEdit: () => hasMinRole("EDITOR"),
    canDelete: () => hasMinRole("CPO"),
    canReview: () => hasMinRole("REVIEWER"),
    canPublish: () => hasMinRole("CPO"),
    isAdmin: () => role === "ADMIN",
  };
}
