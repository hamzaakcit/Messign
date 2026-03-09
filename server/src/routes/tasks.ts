import { Router } from 'express';
import { getAllTasks, getTasksByProject, getTaskById, updateTaskStatus, addTask, updateTask, deleteTask } from '../db/tasksDb.js';
import { addEmployeeXP } from '../db/employeesDb.js';
import { addActivity } from '../db/activitiesDb.js';
import { requireJwt } from '../middleware/authMiddleware.js';
import type { TaskStatus, TaskPriority } from '../types/index.js';
import { eventBus } from '../events/index.js';

export const tasksRouter = Router();

// Get all tasks
tasksRouter.get('/', async (_req, res) => {
  try {
    const tasks = await getAllTasks();
    res.json(tasks);
  } catch (e) {
    console.error('[tasks] list error:', e);
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

// Get tasks by project
tasksRouter.get('/project/:projectId', async (req, res) => {
  try {
    const projectTasks = await getTasksByProject(req.params.projectId);
    res.json(projectTasks);
  } catch (e) {
    console.error('[tasks] by project error:', e);
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

// Get task by ID
tasksRouter.get('/:id', async (req, res) => {
  try {
    const task = await getTaskById(req.params.id);
    if (task) {
      res.json(task);
    } else {
      res.status(404).json({ error: 'Task not found' });
    }
  } catch (e) {
    console.error('[tasks] get error:', e);
    res.status(500).json({ error: 'Failed to load task' });
  }
});

// Create new task
tasksRouter.post('/', async (req, res) => {
  const { projectId, title, description, assignees, tags, dueDate, priority, xpReward } = req.body;
  if (!projectId || !title) {
    res.status(400).json({ error: 'projectId and title are required' });
    return;
  }
  try {
    const newTask = await addTask({
      projectId,
      title,
      description: description ?? '',
      status: 'todo' as TaskStatus,
      assignees: assignees ?? [],
      tags: tags ?? [],
      dueDate,
      xpReward: xpReward ?? 50,
      priority: (priority ?? 'medium') as TaskPriority,
      createdAt: new Date().toISOString(),
    });
    eventBus.emit('project.task.created', {
      taskId: newTask.id, projectId, assigneeId: assignees?.[0], title,
    });
    res.status(201).json(newTask);
  } catch (e) {
    console.error('[tasks] create error:', e);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task status (move between steps) — any authenticated user can move tasks on the board
tasksRouter.patch('/:id/status', requireJwt, async (req, res) => {
  const userId = (req as { userId?: string }).userId;
  const { status, userId: bodyUserId } = req.body;
  if (!status) {
    res.status(400).json({ error: 'status is required' });
    return;
  }
  try {
    const task = await updateTaskStatus(req.params.id, status as TaskStatus);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const actorId = bodyUserId ?? userId;
    if (status === 'done' && actorId) {
      await addEmployeeXP(actorId, task.xpReward);
      await addActivity({
        userId: actorId,
        type: 'task_completed',
        message: `completed "${task.title}"`,
        xpGained: task.xpReward,
        timestamp: new Date().toISOString(),
      });
      eventBus.emit('project.task.completed', {
        taskId: req.params.id, projectId: task.projectId, completedBy: actorId, xpAwarded: task.xpReward,
      });
    }
    res.json(task);
  } catch (e) {
    console.error('[tasks] status error:', e);
    res.status(500).json({ error: 'Failed to update task status' });
  }
});

// Delete task
tasksRouter.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteTask(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.status(204).send();
  } catch (e) {
    console.error('[tasks] delete error:', e);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Update task
tasksRouter.put('/:id', async (req, res) => {
  try {
    const task = await updateTask(req.params.id, req.body);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json(task);
  } catch (e) {
    console.error('[tasks] update error:', e);
    res.status(500).json({ error: 'Failed to update task' });
  }
});
