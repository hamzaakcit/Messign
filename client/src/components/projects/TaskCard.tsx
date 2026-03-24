import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, Sparkles, GripVertical, FolderOpen } from 'lucide-react';
import type { Task } from '@/types';
import { useUsersStore } from '@/stores/usersStore';
import { Badge, Avatar } from '@/components/ui';
import { formatDate, getPriorityColor, cn } from '@/lib/utils';

interface TaskCardProps {
  task: Task;
  isDragging?: boolean;
  /** When true, dragging between steps is disabled (only managers/admins can move tasks). */
  disabledDrag?: boolean;
  /** Project name for this task (shown as clickable link to open project details). */
  projectName?: string;
  /** Called when user clicks the project name to view project details. */
  onProjectClick?: () => void;
}

export function TaskCard({ task, isDragging, disabledDrag, projectName, onProjectClick }: TaskCardProps) {
  const { getUserById } = useUsersStore();
  const assignees = task.assignees.slice(0, 3).map((id) => getUserById(id)).filter(Boolean);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id, disabled: disabledDrag });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'glass-card p-3',
        disabledDrag ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
        (isDragging || isSortableDragging) && 'opacity-50 shadow-xl ring-2 ring-primary-500'
      )}
    >
      {/* Project name (clickable to open project details) */}
      {projectName && onProjectClick && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onProjectClick();
          }}
          className="flex items-center gap-1 text-[10px] text-primary-400 hover:text-primary-300 mb-1.5 w-full text-left"
        >
          <FolderOpen className="w-3 h-3 shrink-0" />
          <span className="truncate">{projectName}</span>
        </button>
      )}
      {/* Header */}
      <div className="flex items-start gap-2 mb-2">
        {!disabledDrag && (
          <button {...attributes} {...listeners} className="mt-1 text-gray-600 hover:text-app-muted">
            <GripVertical className="w-4 h-4" />
          </button>
        )}
        <div className="flex-1">
          <h4 className="font-medium text-app-text text-sm leading-tight">{task.title}</h4>
        </div>
      </div>

      {/* Tags */}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="px-1.5 py-0.5 text-[10px] bg-app-surface-tertiary text-app-muted rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-app-border">
        <div className="flex items-center gap-2">
          {/* Priority */}
          <Badge className={cn('text-[10px]', getPriorityColor(task.priority))}>
            {task.priority}
          </Badge>

          {/* MP Reward */}
          <span className="flex items-center gap-0.5 text-[10px] text-primary-400">
            <Sparkles className="w-3 h-3" />
            {task.xpReward}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Due Date */}
          {task.dueDate && (
            <span className="flex items-center gap-1 text-[10px] text-app-muted">
              <Calendar className="w-3 h-3" />
              {formatDate(task.dueDate)}
            </span>
          )}

          {/* Assignees */}
          <div className="flex -space-x-1">
            {assignees.map(user => user && (
              <Avatar
                key={user.id}
                src={user.avatar}
                name={user.name}
                size="xs"
                showStatus={false}
                className="ring-1 ring-dark-800"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
