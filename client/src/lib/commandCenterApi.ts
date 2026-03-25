import { fetchWithUserId } from './apiCore';
import type { CommandCenterDTO } from '@/types/command-center';

/**
 * Fetches tenant-safe aggregates for the home Command Center (Intelligence Kanban).
 * @param refresh - When true, server bypasses Redis read and recomputes (then repopulates cache).
 */
export const commandCenterAPI = {
  get: (userId: string, opts?: { refresh?: boolean }): Promise<CommandCenterDTO> => {
    const q = opts?.refresh ? '?refresh=1' : '';
    return fetchWithUserId<CommandCenterDTO>(`/dashboard/command-center${q}`, userId);
  },
};
