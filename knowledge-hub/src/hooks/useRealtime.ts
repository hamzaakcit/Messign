import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function useRealtime(table: string, callback: (payload: any) => void) {
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`realtime-${table}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => callback(payload)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, callback]);
}
