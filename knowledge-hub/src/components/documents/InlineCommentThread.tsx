"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, CheckCircle2, Circle, Send, User } from "lucide-react";

interface Reply {
  id: string;
  authorId: string;
  author: { fullName: string };
  content: string;
  createdAt: string;
}

interface Comment {
  id: string;
  authorId: string;
  author: { fullName: string };
  content: string;
  selectedText: string | null;
  isResolved: boolean;
  replies: Reply[];
  createdAt: string;
}

interface InlineCommentThreadProps {
  documentId: string;
  comments: Comment[];
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function InlineCommentThread({
  documentId,
  comments,
}: InlineCommentThreadProps) {
  const [threads, setThreads] = useState<Comment[]>(comments);
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  const toggleResolved = (commentId: string) => {
    setThreads((prev) =>
      prev.map((c) =>
        c.id === commentId ? { ...c, isResolved: !c.isResolved } : c
      )
    );
  };

  const handleReplyChange = (commentId: string, value: string) => {
    setReplyInputs((prev) => ({ ...prev, [commentId]: value }));
  };

  const submitReply = async (parentId: string) => {
    const content = replyInputs[parentId]?.trim();
    if (!content) return;

    setSubmitting(parentId);
    try {
      const res = await fetch(`/api/documents/${documentId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, parentId, authorId: "current-user" }),
      });

      if (res.ok) {
        const newReply = await res.json();
        setThreads((prev) =>
          prev.map((c) =>
            c.id === parentId
              ? {
                  ...c,
                  replies: [
                    ...c.replies,
                    {
                      id: newReply.id,
                      authorId: newReply.authorId,
                      author: newReply.author ?? { fullName: "Ben" },
                      content: newReply.content,
                      createdAt: newReply.createdAt,
                    },
                  ],
                }
              : c
          )
        );
        setReplyInputs((prev) => ({ ...prev, [parentId]: "" }));
      }
    } catch {
      /* silently fail */
    } finally {
      setSubmitting(null);
    }
  };

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <MessageSquare className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Henüz yorum yok.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {threads.map((comment) => (
        <Card
          key={comment.id}
          className={comment.isResolved ? "opacity-60" : ""}
        >
          <CardContent className="p-4 space-y-3">
            {comment.selectedText && (
              <div className="bg-yellow-50 dark:bg-yellow-950/30 border-l-2 border-yellow-400 px-3 py-2 rounded-r text-sm italic text-muted-foreground">
                &ldquo;{comment.selectedText}&rdquo;
              </div>
            )}

            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {comment.author.fullName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(comment.createdAt)}
                  </span>
                </div>
                <p className="text-sm">{comment.content}</p>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleResolved(comment.id)}
                className="shrink-0 gap-1.5 text-xs"
              >
                {comment.isResolved ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="text-green-600">Çözüldü</span>
                  </>
                ) : (
                  <>
                    <Circle className="w-4 h-4" />
                    <span>Çözüldü</span>
                  </>
                )}
              </Button>
            </div>

            {comment.replies.length > 0 && (
              <div className="ml-4 border-l-2 pl-4 space-y-2">
                {comment.replies.map((reply) => (
                  <div key={reply.id} className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">
                        {reply.author.fullName}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDate(reply.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {reply.content}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Input
                value={replyInputs[comment.id] ?? ""}
                onChange={(e) => handleReplyChange(comment.id, e.target.value)}
                placeholder="Yanıt yaz..."
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitReply(comment.id);
                  }
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                disabled={
                  !replyInputs[comment.id]?.trim() ||
                  submitting === comment.id
                }
                onClick={() => submitReply(comment.id)}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
