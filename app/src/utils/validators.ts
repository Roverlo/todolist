import dayjs from 'dayjs';
import type { Status, Priority } from '../types';

export class TaskValidator {
  /**
   * Validates task title
   */
  static validateTitle(title: string): string {
    const trimmed = title.trim();
    if (!trimmed) {
      throw new Error('标题不能为空');
    }
    if (trimmed.length > 100) {
      throw new Error('标题不能超过100个字符');
    }
    return trimmed;
  }

  /**
   * Validates due date
   */
  static validateDueDate(dateStr: string): string {
    if (!dateStr) return '';
    
    const date = dayjs(dateStr);
    if (!date.isValid()) {
      throw new Error('日期格式无效');
    }
    
    return date.format('YYYY-MM-DD');
  }

  /**
   * Validates task status
   */
  static validateStatus(status: Status): Status {
    const validStatuses: Status[] = ['doing', 'paused', 'done'];
    if (!validStatuses.includes(status)) {
      throw new Error(`无效的状态: ${status}`);
    }
    return status;
  }

  /**
   * Validates task priority
   */
  static validatePriority(priority: Priority): Priority {
    const validPriorities: Priority[] = ['high', 'medium', 'low'];
    if (!validPriorities.includes(priority)) {
      throw new Error(`无效的优先级: ${priority}`);
    }
    return priority;
  }

  /**
   * Validates email
   */
  static validateEmail(email: string): string {
    const trimmed = email.trim();
    if (!trimmed) return '';
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      throw new Error('邮箱格式无效');
    }
    
    return trimmed.toLowerCase();
  }

  /**
   * Validates tag
   */
  static validateTag(tag: string): string {
    const trimmed = tag.trim();
    if (!trimmed) {
      throw new Error('标签不能为空');
    }
    if (trimmed.length > 20) {
      throw new Error('标签不能超过20个字符');
    }
    return trimmed;
  }

  /**
   * Validates project name
   */
  static validateProjectName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('项目名称不能为空');
    }
    if (trimmed.length > 50) {
      throw new Error('项目名称不能超过50个字符');
    }
    return trimmed;
  }

  /**
   * Validates file attachment
   */
  static validateAttachment(file: File): void {
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error('文件大小不能超过10MB');
    }
    
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
    ];
    
    if (!allowedTypes.includes(file.type)) {
      throw new Error('不支持的文件类型');
    }
  }

  /**
   * Sanitizes HTML input
   */
  static sanitizeHtml(html: string): string {
    // Basic HTML sanitization - removes script tags and event handlers
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/on\w+='[^']*'/gi, '');
  }

  /**
   * Validates URL
   */
  static validateUrl(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) return '';
    
    try {
      new URL(trimmed);
      return trimmed;
    } catch {
      throw new Error('URL格式无效');
    }
  }
}
