"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Bot,
  User,
  ThumbsUp,
  ThumbsDown,
  Send,
  FileText,
  Sparkles,
} from "lucide-react";

interface SourceDoc {
  id: string;
  title: string;
  slug: string;
  excerpt?: string | null;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceDoc[];
  feedback?: "up" | "down" | null;
}

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = input.trim();
    if (!query || loading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: query,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(query)}`
      );

      let sources: SourceDoc[] = [];
      let answer =
        "Üzgünüm, şu an bir cevap oluşturamadım. Lütfen tekrar deneyin.";

      if (res.ok) {
        const data = await res.json();
        const docs = data.results ?? data.documents ?? [];
        sources = docs.slice(0, 5).map(
          (d: { id: string; title: string; slug: string; excerpt?: string | null }) => ({
            id: d.id,
            title: d.title,
            slug: d.slug,
            excerpt: d.excerpt,
          })
        );

        if (sources.length > 0) {
          answer = `"${query}" ile ilgili ${sources.length} doküman buldum. Aşağıdaki kaynaklara göz atabilirsiniz:`;
        } else {
          answer =
            "Aramanızla eşleşen bir doküman bulunamadı. Farklı anahtar kelimeler deneyebilirsiniz.";
        }
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: answer,
        sources,
        feedback: null,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Bir hata oluştu. Lütfen tekrar deneyin.",
          feedback: null,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const setFeedback = (messageId: string, feedback: "up" | "down") => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, feedback: m.feedback === feedback ? null : feedback }
          : m
      )
    );
  };

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">
      {/* Header */}
      <div className="p-6 pb-0 space-y-1">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="w-5 h-5" />
          <h1 className="text-2xl font-bold">AI Asistan</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Bilgi tabanındaki dokümanlardan hızlıca cevap alın.
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Nasıl yardımcı olabilirim?</h2>
            <p className="text-muted-foreground text-sm max-w-md">
              Bilgi tabanındaki dokümanlarla ilgili sorularınızı yanıtlıyorum.
              Bir soru sorarak başlayın.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {message.role === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                <Bot className="w-4 h-4 text-primary" />
              </div>
            )}

            <div
              className={`max-w-[80%] space-y-2 ${message.role === "user" ? "order-first" : ""}`}
            >
              <Card
                className={
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : ""
                }
              >
                <CardContent className="p-3">
                  <p className="text-sm whitespace-pre-wrap">
                    {message.content}
                  </p>
                </CardContent>
              </Card>

              {message.role === "assistant" &&
                message.sources &&
                message.sources.length > 0 && (
                  <div className="space-y-1.5 ml-1">
                    <p className="text-xs text-muted-foreground font-medium">
                      Kaynaklar:
                    </p>
                    {message.sources.map((src) => (
                      <Link
                        key={src.id}
                        href={`/knowledge-hub/documents/${src.slug}`}
                        className="flex items-center gap-2 text-xs text-primary hover:underline"
                      >
                        <FileText className="w-3 h-3" />
                        {src.title}
                      </Link>
                    ))}
                  </div>
                )}

              {message.role === "assistant" && (
                <div className="flex items-center gap-1 ml-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 ${message.feedback === "up" ? "text-green-600" : "text-muted-foreground"}`}
                    onClick={() => setFeedback(message.id, "up")}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 ${message.feedback === "down" ? "text-red-600" : "text-muted-foreground"}`}
                    onClick={() => setFeedback(message.id, "down")}
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {message.role === "user" && (
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-1">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <Card>
              <CardContent className="p-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Bir soru sor..."
            className="flex-1 h-11"
            disabled={loading}
          />
          <Button
            type="submit"
            size="icon"
            className="h-11 w-11 shrink-0"
            disabled={!input.trim() || loading}
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
