import { create } from 'zustand';
import type { User } from '@/types';
import { usersAPI } from '@/lib/api';

interface UsersState {
  users: User[];
  isLoading: boolean;
  fetchUsers: () => Promise<void>;
  getUserById: (id: string) => User | undefined;
  updateUserStatus: (userId: string, status: User['status']) => void;
}

export const useUsersStore = create<UsersState>((set, get) => ({
  users: [],
  isLoading: false,

  fetchUsers: async () => {
    try {
      set({ isLoading: true });
      const users = await usersAPI.getAll() as User[];
      set({ users, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
    }
  },

  getUserById: (id) => {
    return get().users.find((u) => u.id === id);
  },

  updateUserStatus: (userId, status) => {
    set((state) => ({
      users: state.users.map((u) =>
        u.id === userId ? { ...u, status } : u
      ),
    }));
  },
}));
