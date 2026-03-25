# ADR: Chat client state and real-time transport

**Status:** Accepted (2026-03-25)  
**Scope:** Messign Workspace `client/` — Chat module (`ChatV2Layout`, `chatStore`, [`AppShell`](../client/src/components/layout/AppShell.tsx) socket handlers, [`lib/socket`](../client/src/lib/socket.ts)).

## Context

- Chat today uses a **single large Zustand store** ([`chatStore`](../client/src/stores/chatStore.ts)): channels, paginated messages, Dora, search, threads, UI chrome, etc.
- **Socket.io** is initialized in [`getSocket()`](../client/src/lib/socket.ts); chat-related listeners are registered via [`chatSocketBridge`](../client/src/lib/chatSocketBridge.ts) from `AppShell` (non-chat listeners remain in `AppShell`).
- Risks: harder testing (wide store surface), unclear boundary between **server-backed** data and **ephemeral UI**, and socket handlers scattered across the shell.

This ADR records **direction**, not a full migration plan. Work proceeds in **small PRs**.

## Decision

Adopt a **hybrid (Option C)**:

1. **Keep Zustand** as the **primary store for Chat UI and collaboration state** for the foreseeable future: active channel, panels (detail, Dora, thread), composer, search, typing, context menu, duel hub, mobile sidebar, etc.
2. **Introduce TanStack Query (or equivalent) selectively** for **cacheable server reads** where invalidation and deduplication are clear wins—starting with **channels list** and optionally **per-channel message pages** once query keys and invalidation rules are defined.
3. **Do not replace Socket.io** in the short term. Instead, add a **thin `chatSocketBridge` (name TBD)** that:
   - Registers **typed** chat-related socket events in one place.
   - Exposes subscribe/unsubscribe so `AppShell` (or a dedicated `ChatSocketSubscriber`) stays thin and testable.
4. **No Redux**, **no full rewrite** of `chatStore` in one change.

## Options considered

| Option | Description | Verdict |
|--------|-------------|---------|
| **A — TanStack Query for server state, Zustand for UI only** | Messages/channels in Query; Zustand for panels only | Strong long-term; higher migration cost for messages + optimistic sends + socket append. **Defer** message migration until bridge + invalidation design exists. |
| **B — Split Zustand into multiple stores/slices** | e.g. `useChatChannelsStore`, `useChatTranscriptStore` | Reduces file size; still manual cache invalidation. **Optional** later if Query adoption is partial. |
| **C — Hybrid (chosen)** | Zustand UI + collaboration; Query for chosen reads; socket bridge | **Best cost/benefit** for this codebase. |

## Consequences

### Positive

- Clear rule: **HTTP-shaped lists** → candidates for Query; **interaction + layout** → Zustand.
- Socket handling becomes **easier to mock** in Vitest once centralized.
- Aligns with existing stack (React 18, Zustand, Vite) per [project standards](../.cursor/rules/project-standards.mdc).

### Negative / trade-offs

- **Two sources of truth** during migration (Query + Zustand) require explicit **sync rules** (e.g. after `sendMessage`, invalidate or append via store until Query is unified).
- Team must learn **when** to add Query vs extend `chatStore`.

## Non-goals

- Replacing **Socket.io** with another transport.
- **Full Knowledge Hub / Dora page parity** in this ADR—see separate parity matrix work (chat Dora strip vs Knowledge Hub `/api/v2/ai` flows remain **separate product surfaces**).
- Merging Chat and Knowledge Hub into a single route or store.

## Implementation status (2026-03-25)

| Step | Status | Notes |
|------|--------|--------|
| Socket bridge | **Done** | [`chatSocketBridge.ts`](../client/src/lib/chatSocketBridge.ts) — `message:new`, react/edit/delete/pin/thread, socket `error` (chat branches). `AppShell` calls `installChatSocketHandlers()` cleanup on unmount. |
| Query keys | **Done** | [`chatQueryKeys.ts`](../client/src/lib/chatQueryKeys.ts) — `CHAT_CHANNELS_ROOT`, `chatChannelsQueryKey(userId)`. |
| Channels Query pilot | **Done** | [`useChatChannelsQuery`](../client/src/hooks/useChatChannelsQuery.ts) + `hydrateChannels` in [`chatStore`](../client/src/stores/chatStore.ts); [`ChatV2Layout`](../client/src/pages/chat/ChatV2Layout.tsx) syncs query → Zustand. `CHANNEL_NOT_FOUND` invalidates Query and calls `fetchChannels`. |
| Messages on Query | **Not started** | Design keys + invalidation for `getMessagesPage` / socket append. |

## Implementation order (remaining)

1. **Messages** — Design query keys for `getMessagesPage` / `loadOlderMessages` and socket invalidation.

## References

- Client chat entry: [`ChatView` / `ChatV2Layout`](../client/src/pages/chat/ChatV2Layout.tsx)
- API: [`messagingApi` `chatAPI`](../client/src/lib/messagingApi.ts)

## Review

Revisit this ADR when:

- Message list is fully on TanStack Query, or
- Socket event set grows beyond ~10 chat-specific events, or
- A second real-time feature (e.g. presence v2) requires a shared pattern.
