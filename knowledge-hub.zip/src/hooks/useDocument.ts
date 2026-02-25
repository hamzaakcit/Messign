import { useState, useEffect, useCallback } from "react";

export function useDocument(docId: string) {
  const [document, setDocument] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocument = useCallback(async () => {
    if (!docId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/documents/${docId}`);
      if (!res.ok) throw new Error("Failed to fetch document");
      const data = await res.json();
      setDocument(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch document");
      setDocument(null);
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    fetchDocument();
  }, [fetchDocument]);

  return { document, loading, error, refetch: fetchDocument };
}
