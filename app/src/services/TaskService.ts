import { nanoid } from 'nanoid';
import type { Task, Priority, Status } from '../types';
import { TaskValidator } from '../utils/validators';

export interface CreateTaskDTO {
  projectId: string;
  title: string;
  status?: Status;
  priority?: Priority;
  dueDate?: string;
  onsiteOwner?: string;
  lineOwner?: string;
  nextStep?: string;
  tags?: string[];
  notes?: string;
}

export interface UpdateTaskDTO extends Partial<Omit<Task, 'id' | 'createdAt'>> {
  // Additional fields can be added here
}

export class TaskService {
  /**
   * Creates a new task with validation
   */
  static createTask(data: CreateTaskDTO): Task {
    // Validate input
    const validated = this.validateCreateTaskData(data);
    
    // Create task object
    const task: Task = {
      id: nanoid(12),
      projectId: validated.projectId,
      title: validated.title,
      status: validated.status ?? 'doing',
      priority: validated.priority ?? 'medium',
      dueDate: validated.dueDate,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      onsiteOwner: validated.onsiteOwner,
      lineOwner: validated.lineOwner,
      nextStep: validated.nextStep,
      tags: validated.tags ?? [],
      notes: validated.notes,
      dependencies: [],
      history: [],
      progress: [],
      extras: {},
      attachments: [],
    };

    return task;
  }

  /**
   * Updates a task with validation
   */
  static updateTask(task: Task, updates: UpdateTaskDTO): Task {
    // Validate updates
    const validated = this.validateUpdateTaskData(updates);
    
    // Create updated task
    const updatedTask: Task = {
      ...task,
      ...validated,
      updatedAt: Date.now(),
    };

    return updatedTask;
  }

  /**
   * Validates task creation data
   */
  private static validateCreateTaskData(data: CreateTaskDTO): CreateTaskDTO {
    // Validate project ID
    if (!data.projectId) {
      throw new Error('Project ID is required');
    }

    // Validate title
    const title = TaskValidator.validateTitle(data.title);

    // Validate due date if provided
    const dueDate = data.dueDate 
      ? TaskValidator.validateDueDate(data.dueDate)
      : undefined;

    // Validate status
    const status = data.status 
      ? TaskValidator.validateStatus(data.status)
      : 'doing';

    // Validate priority
    const priority = data.priority
      ? TaskValidator.validatePriority(data.priority)
      : 'medium';

    return {
      ...data,
      title,
      dueDate,
      status,
      priority,
      onsiteOwner: data.onsiteOwner?.trim(),
      lineOwner: data.lineOwner?.trim(),
      nextStep: data.nextStep?.trim(),
      notes: data.notes?.trim(),
      tags: data.tags?.map(tag => tag.trim()).filter(Boolean),
    };
  }

  /**
   * Validates task update data
   */
  private static validateUpdateTaskData(data: UpdateTaskDTO): UpdateTaskDTO {
    const validated: UpdateTaskDTO = {};

    if (data.title !== undefined) {
      validated.title = TaskValidator.validateTitle(data.title);
    }

    if (data.dueDate !== undefined) {
      validated.dueDate = data.dueDate 
        ? TaskValidator.validateDueDate(data.dueDate)
        : undefined;
    }

    if (data.status !== undefined) {
      validated.status = TaskValidator.validateStatus(data.status);
    }

    if (data.priority !== undefined) {
      validated.priority = TaskValidator.validatePriority(data.priority);
    }

    if (data.onsiteOwner !== undefined) {
      validated.onsiteOwner = data.onsiteOwner?.trim() || undefined;
    }

    if (data.lineOwner !== undefined) {
      validated.lineOwner = data.lineOwner?.trim() || undefined;
    }

    if (data.nextStep !== undefined) {
      validated.nextStep = data.nextStep?.trim() || undefined;
    }

    if (data.notes !== undefined) {
      validated.notes = data.notes?.trim() || undefined;
    }

    if (data.tags !== undefined) {
      validated.tags = data.tags?.map(tag => tag.trim()).filter(Boolean);
    }

    return validated;
  }

  /**
   * Checks if a task is overdue
   */
  static isOverdue(task: Task): boolean {
    if (!task.dueDate) return false;
    const now = new Date();
    const dueDate = new Date(task.dueDate);
    return dueDate < now && task.status !== 'done';
  }

  /**
   * Calculates task completion percentage based on checklist
   */
  static getCompletionPercentage(task: Task): number {
    const checklist = task.extras?.checklist;
    if (!checklist) return 0;
    
    try {
      const items = JSON.parse(checklist);
      if (!Array.isArray(items) || items.length === 0) return 0;
      
      const completed = items.filter(item => item.checked).length;
      return Math.round((completed / items.length) * 100);
    } catch {
      return 0;
    }
  }

  /**
   * Gets task statistics
   */
  static getTaskStats(tasks: Task[]): {
    total: number;
    doing: number;
    paused: number;
    done: number;
    overdue: number;
    highPriority: number;
  } {
    const stats = {
      total: tasks.length,
      doing: 0,
      paused: 0,
      done: 0,
      overdue: 0,
      highPriority: 0,
    };

    tasks.forEach(task => {
      if (task.status === 'doing') stats.doing++;
      if (task.status === 'paused') stats.paused++;
      if (task.status === 'done') stats.done++;
      if (this.isOverdue(task)) stats.overdue++;
      if (task.priority === 'high') stats.highPriority++;
    });

    return stats;
  }
}
