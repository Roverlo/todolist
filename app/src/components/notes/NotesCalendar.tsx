/**
 * NotesCalendar - 日历组件
 * 显示当月日历，支持选择日期查看对应笔记
 */

import { useMemo } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { Icon } from '../ui/Icon';
import { useAppStore } from '../../state/appStore';

interface NotesCalendarProps {
    selectedDate: Dayjs | null;
    onDateSelect: (date: Dayjs) => void;
    currentMonth: Dayjs;
    onMonthChange: (date: Dayjs) => void;
}

export function NotesCalendar({ selectedDate, onDateSelect, currentMonth, onMonthChange }: NotesCalendarProps) {
    const notes = useAppStore((state) => state.notes);

    // 统计每天的笔记数量
    const notesCountByDate = useMemo(() => {
        const counts: Record<string, number> = {};
        notes.forEach(note => {
            const dateKey = dayjs(note.updatedAt).format('YYYY-MM-DD');
            counts[dateKey] = (counts[dateKey] || 0) + 1;
        });
        return counts;
    }, [notes]);

    // 生成日历数据
    const calendarDays = useMemo(() => {
        const startOfMonth = currentMonth.startOf('month');
        const endOfMonth = currentMonth.endOf('month');
        const startDate = startOfMonth.startOf('week');
        const endDate = endOfMonth.endOf('week');

        const days: Dayjs[] = [];
        let current = startDate;

        while (current.isBefore(endDate) || current.isSame(endDate, 'day')) {
            days.push(current);
            current = current.add(1, 'day');
        }

        return days;
    }, [currentMonth]);

    const prevMonth = () => {
        onMonthChange(currentMonth.subtract(1, 'month'));
    };

    const nextMonth = () => {
        onMonthChange(currentMonth.add(1, 'month'));
    };

    const prevYear = () => {
        onMonthChange(currentMonth.subtract(1, 'year'));
    };

    const nextYear = () => {
        onMonthChange(currentMonth.add(1, 'year'));
    };



    const isToday = (date: Dayjs) => date.isSame(dayjs(), 'day');
    const isSelected = (date: Dayjs) => selectedDate?.isSame(date, 'day');
    const isCurrentMonth = (date: Dayjs) => date.isSame(currentMonth, 'month');

    return (
        <div className="notes-calendar">
            {/* 月份导航 */}
            <div className="notes-calendar-header">
                <button className="notes-calendar-nav-btn" onClick={prevYear} title="上一年">
                    <Icon name="chevronsLeft" size={16} />
                </button>
                <button className="notes-calendar-nav-btn" onClick={prevMonth} title="上个月">
                    <Icon name="chevronLeft" size={16} />
                </button>
                <div className="notes-calendar-title">
                    {currentMonth.format('YYYY年M月')}
                </div>
                <button className="notes-calendar-nav-btn" onClick={nextMonth} title="下个月">
                    <Icon name="chevronRight" size={16} />
                </button>
                <button className="notes-calendar-nav-btn" onClick={nextYear} title="下一年">
                    <Icon name="chevronsRight" size={16} />
                </button>
            </div>

            {/* 星期头 */}
            <div className="notes-calendar-weekdays">
                {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
                    <div key={day} className="notes-calendar-weekday">
                        {day}
                    </div>
                ))}
            </div>

            {/* 日期网格 */}
            <div className="notes-calendar-grid">
                {calendarDays.map((day, index) => {
                    const dateKey = day.format('YYYY-MM-DD');
                    const count = notesCountByDate[dateKey] || 0;

                    return (
                        <button
                            key={index}
                            className={`notes-calendar-day ${!isCurrentMonth(day) ? 'other-month' : ''
                                } ${isToday(day) ? 'today' : ''} ${isSelected(day) ? 'selected' : ''
                                } ${count > 0 ? 'has-notes' : ''}`}
                            onClick={() => onDateSelect(day)}
                            title={count > 0 ? `${count} 条笔记` : undefined}
                        >
                            <span className="notes-calendar-day-number">{day.date()}</span>
                            {count > 0 && (
                                <span className="notes-calendar-day-dot" />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
