import { Calendar, Users } from 'lucide-react';
import type { Project } from '@/types';
import { Card, Badge, ProgressBar, Avatar } from '@/components/ui';
import { useUsersStore } from '@/stores/usersStore';
import { formatDate, cn } from '@/lib/utils';

interface ProjectCardProps {
  project: Project;
  viewMode: 'grid' | 'list';
  onClick: () => void;
  isActive: boolean;
}

export function ProjectCard({ project, viewMode, onClick, isActive }: ProjectCardProps) {
  const { getUserById } = useUsersStore();
  const teamMembers = project.team.slice(0, 4).map(id => getUserById(id)).filter(Boolean);

  if (viewMode === 'list') {
    return (
      <Card 
        variant="hover" 
        onClick={onClick}
        className={cn(
          'cursor-pointer flex items-center gap-4 p-4',
          isActive && 'ring-2 ring-primary-500'
        )}
      >
        {/* Type Badge */}
        <Badge variant={
          project.type === 'product' ? 'blue' :
          project.type === 'engineering' ? 'purple' :
          project.type === 'design' ? 'green' : 'orange'
        }>
          {project.type}
        </Badge>

        {/* Name & Description */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-app-text truncate">{project.name}</h3>
          <p className="text-sm text-app-muted truncate">{project.description}</p>
        </div>

        {/* Progress */}
        <div className="w-32">
          <div className="flex justify-between text-xs text-app-muted mb-1">
            <span>Progress</span>
            <span>{project.progress}%</span>
          </div>
          <ProgressBar value={project.progress} size="sm" />
        </div>

        {/* Team */}
        <div className="flex -space-x-2">
          {teamMembers.map(member => member && (
            <Avatar
              key={member.id}
              src={member.avatar}
              name={member.name}
              size="sm"
              showStatus={false}
              className="ring-2 ring-dark-900"
            />
          ))}
          {project.team.length > 4 && (
            <div className="w-8 h-8 rounded-full bg-app-hover flex items-center justify-center text-xs text-app-muted ring-2 ring-dark-900">
              +{project.team.length - 4}
            </div>
          )}
        </div>

        {/* Due Date */}
        {project.dueDate && (
          <div className="flex items-center gap-1 text-sm text-app-muted">
            <Calendar className="w-4 h-4" />
            {formatDate(project.dueDate)}
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card 
      variant="hover" 
      onClick={onClick}
      className={cn(
        'cursor-pointer',
        isActive && 'ring-2 ring-primary-500'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <Badge variant={
          project.type === 'product' ? 'blue' :
          project.type === 'engineering' ? 'purple' :
          project.type === 'design' ? 'green' : 'orange'
        }>
          {project.type}
        </Badge>
        <div className="flex items-center gap-1 text-sm text-app-muted">
          <Users className="w-4 h-4" />
          {project.capacity.current}/{project.capacity.max}
        </div>
      </div>

      {/* Title & Description */}
      <h3 className="font-semibold text-app-text mb-1">{project.name}</h3>
      <p className="text-sm text-app-muted line-clamp-2 mb-4">{project.description}</p>

      {/* Progress */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-app-muted mb-1">
          <span>Progress</span>
          <span>{project.progress}%</span>
        </div>
        <ProgressBar value={project.progress} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-app-border">
        {/* Team Avatars */}
        <div className="flex -space-x-2">
          {teamMembers.map(member => member && (
            <Avatar
              key={member.id}
              src={member.avatar}
              name={member.name}
              size="sm"
              showStatus={false}
              className="ring-2 ring-dark-800"
            />
          ))}
          {project.team.length > 4 && (
            <div className="w-8 h-8 rounded-full bg-app-hover flex items-center justify-center text-xs text-app-muted ring-2 ring-dark-800">
              +{project.team.length - 4}
            </div>
          )}
        </div>

        {/* Due Date */}
        {project.dueDate && (
          <div className="flex items-center gap-1 text-xs text-app-muted">
            <Calendar className="w-3 h-3" />
            {formatDate(project.dueDate)}
          </div>
        )}
      </div>
    </Card>
  );
}
