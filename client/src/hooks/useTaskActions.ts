import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { tasksAPI } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { TaskRow } from '@/types/knowledge-hub/ai';

export function useTaskActions(initialTasks: TaskRow[]) {
  const [tasks, setTasks] = useState<TaskRow[]>(initialTasks);
  const snapshotRef = useRef<TaskRow[]>(initialTasks);
  const userId = useAuthStore((s) => s.user?.id);

  const saveSnapshot = useCallback(() => {
    snapshotRef.current = [...tasks];
  }, [tasks]);

  const rollback = useCallback(() => {
    setTasks(snapshotRef.current);
  }, []);

  const updateStatus = useCallback(
    async (taskId: string, newStatus: string) => {
      saveSnapshot();
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)),
      );
      try {
        await tasksAPI.updateStatus(taskId, newStatus, userId ?? '');
        toast.success(`Status updated to ${newStatus}`);
      } catch {
        rollback();
        toast.error('Failed to update status');
      }
    },
    [saveSnapshot, rollback, userId],
  );

  const updatePriority = useCallback(
    async (taskId: string, newPriority: string) => {
      saveSnapshot();
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, priority: newPriority } : t)),
      );
      try {
        await tasksAPI.update(taskId, { priority: newPriority });
        toast.success(`Priority updated to ${newPriority}`);
      } catch {
        rollback();
        toast.error('Failed to update priority');
      }
    },
    [saveSnapshot, rollback],
  );

  const markComplete = useCallback(
    async (taskId: string) => {
      await updateStatus(taskId, 'done');
    },
    [updateStatus],
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      saveSnapshot();
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      try {
        await tasksAPI.delete(taskId);
        toast.success('Task deleted');
      } catch {
        rollback();
        toast.error('Failed to delete task');
      }
    },
    [saveSnapshot, rollback],
  );

  const updateDueDate = useCallback(
    async (taskId: string, newDate: string) => {
      saveSnapshot();
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, due_date: newDate } : t)),
      );
      try {
        await tasksAPI.update(taskId, { dueDate: newDate });
        toast.success('Due date updated');
      } catch {
        rollback();
        toast.error('Failed to update due date');
      }
    },
    [saveSnapshot, rollback],
  );

  const updateTaskField = useCallback(
    async (taskId: string, field: string, value: string) => {
      saveSnapshot();
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, [field]: value } : t)),
      );
      try {
        await tasksAPI.update(taskId, { [field]: value });
        toast.success('Task updated');
      } catch {
        rollback();
        toast.error('Failed to update task');
      }
    },
    [saveSnapshot, rollback],
  );

  return {
    tasks,
    setTasks,
    updateStatus,
    updatePriority,
    markComplete,
    deleteTask,
    updateDueDate,
    updateTaskField,
  };
}
