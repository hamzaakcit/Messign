# Data map — four pillars (non-breaking boundaries)

## Dashboard (`MainDashboard`)

- **REST**: Command center payload via `useCommandCenterData` → `/api/...` (see hook).
- **Zustand**: `useUIStore` (`setView`, navigation), `useAuthStore` (user).
- **Sockets**: None in dashboard view-specific path (global `AppShell` still connects game/chat users).

## Chat (`ChatV2Layout`)

- **Zustand**: `useChatStore` (channels, messages, threads, UI), `useUsersStore`, `useUIStore` (mobile, focus).
- **React Query**: `useChatChannelsQuery` hydrates store.
- **Sockets**: `installChatSocketHandlers` in `AppShell` → `chatSocketBridge.ts`.

## Projects (`ProjectsView`)

- **Zustand**: `useProjectStore` (`tasks`, `fetchTasks`, `setActiveProject`).
- **React Query**: `useMarketplaceProjectsQuery`, `useOpenBountiesQuery`, query keys `marketplaceProjectsQueryKey`, `openBountiesQueryKey`.
- **REST**: `projectsAPI`, `bountiesAPI` for apply / proposals.

## Marketing (`MarketingHub` + workspace)

- **REST**: `marketingAPI` (`client/src/lib/marketingApi.ts`).
- **Hooks**: `useMarketingWorkspace`, `useMarketingApprovalQueue`, workspace invalidation helpers.
- **Zustand**: `useAuthStore` only for user/token in hub.

**Refactor rule**: Layout wrappers must not remove or rename these hooks; only JSX structure and overflow classes may change.
