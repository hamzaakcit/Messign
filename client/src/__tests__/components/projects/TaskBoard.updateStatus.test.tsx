import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskBoard } from '@/components/projects/TaskBoard';
import type { Task } from '@/types';

const mockUpdateTaskStatus = vi.fn();

const SAMPLE_TASK: Task = {
  id: 'task-1',
  projectId: 'proj-1',
  title: 'Sample task',
  description: '',
  status: 'todo',
  assignees: ['u1'],
  tags: [],
  dueDate: undefined,
  xpReward: 50,
  priority: 'medium',
  createdAt: new Date().toISOString(),
};

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: (selector: (s: unknown) => unknown) => {
    const state = {
      tasks: [SAMPLE_TASK],
      updateTaskStatus: mockUpdateTaskStatus,
    };
    return selector(state);
  },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => {
    const state = { user: { id: 'u1', name: 'Test' } };
    return selector(state);
  },
}));

vi.mock('@/stores/usersStore', () => ({
  useUsersStore: (selector: (s: unknown) => unknown) => {
    const state = { getUserById: () => undefined };
    return selector(state);
  },
}));

describe('TaskBoard', () => {
  beforeEach(() => {
    mockUpdateTaskStatus.mockClear();
  });

  it('calls updateTaskStatus when list view status select changes', () => {
    render(
      <TaskBoard
        activeProjectIds={new Set(['proj-1'])}
        viewMode="list"
        compact
      />,
    );

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0]!, { target: { value: 'review' } });

    expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-1', 'review', 'u1');
  });
});
