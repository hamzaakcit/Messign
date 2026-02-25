"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { DocumentCard } from "@/components/documents/DocumentCard";
import { Search, FileText } from "lucide-react";

interface SearchDocument {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  documentType: string;
  viewCount: number;
  updatedAt: string;
  author: { fullName: string } | null;
  category: { name: string; color: string | null } | null;
  tags: { tag: { id: string; name: string; color: string | null } }[];
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageContent />
    </Suspense>
  );
}

function SearchPageContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchDocument[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const performSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setTotalCount(0);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results ?? data.documents ?? []);
        setTotalCount(data.totalCount ?? data.total ?? data.results?.length ?? 0);
      }
    } catch {
      setResults([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialQuery) {
      performSearch(initialQuery);
    }
  }, [initialQuery, performSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(query);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      {/* Search header */}
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Arama</h1>
        <form onSubmit={handleSubmit} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Doküman, rehber veya etiket ara..."
            className="pl-10 h-12 text-base rounded-xl"
            autoFocus
          />
        </form>
      </div>

      {/* Results */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      {!loading && hasSearched && results.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{totalCount}</span> sonuç bulundu
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {results.map((doc) => (
              <DocumentCard key={doc.id} document={doc} />
            ))}
          </div>
        </div>
      )}

      {!loading && hasSearched && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <FileText className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Sonuç bulunamadı</h2>
          <p className="text-muted-foreground text-sm max-w-md">
            &ldquo;{query}&rdquo; ile eşleşen doküman bulunamadı. Farklı
            anahtar kelimeler veya daha genel terimler deneyin.
          </p>
        </div>
      )}

      {!loading && !hasSearched && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Aramaya başla</h2>
          <p className="text-muted-foreground text-sm max-w-md">
            Dokümanlar, rehberler ve daha fazlasını bulmak için yukarıdaki
            arama kutusunu kullanın.
          </p>
        </div>
      )}
    </div>
  );
}
