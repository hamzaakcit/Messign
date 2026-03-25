import { create } from 'zustand';
import { toast } from 'sonner';
import type { Project, Task, TaskStatus } from '@/types';
import { projectsAPI, tasksAPI } from '@/lib/api';

interface ProjectState {
  projects: Project[];
  tasks: Task[];
  activeProjectId: string | null;
  isLoading: boolean;
  /** True while GET /tasks is in flight (all or by project). */
  tasksLoading: boolean;
  fetchProjects: () => Promise<void>;
  fetchTasks: (projectId?: string) => Promise<void>;
  setActiveProject: (projectId: string | null) => void;
  updateTaskStatus: (taskId: string, status: TaskStatus, userId: string) => Promise<void>;
  addTask: (task: Omit<Task, 'id' | 'createdAt'>) => Promise<void>;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  tasks: [],
  activeProjectId: null,
  isLoading: false,
  tasksLoading: false,

  fetchProjects: async () => {
    try {
      set({ isLoading: true });
      const projects = await projectsAPI.getAll() as Project[];
      set({ projects, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
    }
  },

  fetchTasks: async (projectId) => {
    set({ tasksLoading: true });
    try {
      const tasks = projectId
        ? (await tasksAPI.getByProject(projectId)) as Task[]
        : (await tasksAPI.getAll()) as Task[];
      set({ tasks, tasksLoading: false });
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
      set({ tasksLoading: false });
    }
  },

  setActiveProject: (projectId) => {
    set({ activeProjectId: projectId });
    if (projectId) {
      get().fetchTasks(projectId);
    }
  },

  updateTaskStatus: async (taskId, status, userId) => {
    const prevTasks = get().tasks;
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId
          ? { ...t, status, completedAt: status === 'done' ? new Date().toISOString() : undefined }
          : t
      ),
    }));
    try {
      await tasksAPI.updateStatus(taskId, status, userId);
    } catch (error) {
      console.error('Failed to update task status:', error);
      set({ tasks: prevTasks });
      toast.error(error instanceof Error ? error.message : 'Could not update task');
    }
  },

  addTask: async (taskData) => {
    try {
      const newTask = await tasksAPI.create(taskData) as Task;
      set((state) => ({
        tasks: [...state.tasks, newTask],
      }));
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  },

  updateTask: (taskId, updates) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, ...updates } : t
      ),
    }));
  },
}));
