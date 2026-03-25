import { fetchWithUserId } from './api';
import type { CommandCenterDTO } from '@/types/command-center';

/**
 * Fetches tenant-safe aggregates for the home Command Center (Intelligence Kanban).
 */
export const commandCenterAPI = {
  get: (userId: string): Promise<CommandCenterDTO> =>
    fetchWithUserId<CommandCenterDTO>('/dashboard/command-center', userId),
};
