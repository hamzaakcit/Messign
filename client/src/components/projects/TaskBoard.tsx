import { useState, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useProjectStore } from '@/stores/projectStore';
import { useAuthStore } from '@/stores/authStore';
import { TaskColumn } from './TaskColumn';
import { TaskCard } from './TaskCard';
import type { Task, TaskStatus } from '@/types';

const columns: { id: TaskStatus; title: string; color: string }[] = [
  { id: 'todo', title: 'First Phase', color: 'bg-gray-500' },
  { id: 'in_progress', title: 'In Progress', color: 'bg-primary-500' },
  { id: 'review', title: 'Review', color: 'bg-accent-500' },
  { id: 'done', title: 'Done', color: 'bg-success-500' },
];

/** Tooltip content for the 4 task/status columns (Info icon next to column title). */
const STATUS_TOOLTIPS: Partial<Record<TaskStatus, string>> = {
  todo:
    'Kickoff & Discovery. The team is assembled and holds initial meetings to gather requirements and align on goals before execution begins.',
  in_progress:
    'Execution mode. The team has been assembled and is actively working on project tasks.',
  review:
    'Quality Control. Deliverables have been submitted and are awaiting final validation by the Admin.',
  done:
    'Mission accomplished. The project is closed and all P/MSP rewards have been distributed to the team.',
};

/** When provided, only tasks belonging to these project IDs are shown (launched/active projects). */
export interface TaskBoardProps {
  activeProjectIds?: Set<string>;
  /** Resolve project name by id (for showing and opening project details from task). */
  getProjectName?: (projectId: string) => string | undefined;
  /** Called when user clicks to view project details (e.g. from a task card). */
  onSelectProject?: (projectId: string) => void;
}

export function TaskBoard({ activeProjectIds, getProjectName, onSelectProject }: TaskBoardProps) {
  const tasks = useProjectStore((s) => s.tasks);
  const updateTaskStatus = useProjectStore((s) => s.updateTaskStatus);
  const user = useAuthStore((s) => s.user);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const launchedTasks = useMemo(() => {
    if (!activeProjectIds || activeProjectIds.size === 0) return tasks;
    return tasks.filter((t) => activeProjectIds.has(t.projectId));
  }, [tasks, activeProjectIds]);

  const canMoveSteps = !!user;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const getTasksByStatus = (status: TaskStatus) =>
    launchedTasks.filter((task) => task.status === status);

  const handleDragStart = (event: DragStartEvent) => {
    const task = launchedTasks.find((t) => t.id === event.active.id);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over || !user) return;
    if (!canMoveSteps) return;

    const taskId = active.id as string;
    const overId = over.id as string;

    const targetColumn = columns.find((col) => col.id === overId);
    if (targetColumn) {
      updateTaskStatus(taskId, targetColumn.id, user.id);
      return;
    }

    const overTask = launchedTasks.find((t) => t.id === overId);
    if (overTask) {
      updateTaskStatus(taskId, overTask.status, user.id);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full flex gap-3 p-4 overflow-hidden min-w-0">
        {columns.map(column => {
          const columnTasks = getTasksByStatus(column.id);
          
          return (
            <TaskColumn
              key={column.id}
              id={column.id}
              title={column.title}
              color={column.color}
              count={columnTasks.length}
              tooltipContent={STATUS_TOOLTIPS[column.id]}
            >
              <SortableContext
                items={columnTasks.map(t => t.id)}
                strategy={verticalListSortingStrategy}
              >
                {columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    disabledDrag={!canMoveSteps}
                    projectName={getProjectName?.(task.projectId)}
                    onProjectClick={onSelectProject ? () => onSelectProject(task.projectId) : undefined}
                  />
                ))}
              </SortableContext>
            </TaskColumn>
          );
        })}
      </div>

      <DragOverlay>
        {activeTask && <TaskCard task={activeTask} isDragging />}
      </DragOverlay>
    </DndContext>
  );
}
