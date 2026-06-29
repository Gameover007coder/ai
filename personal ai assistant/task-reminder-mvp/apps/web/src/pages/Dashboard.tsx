import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../utils/api';
import { useAuthStore } from '../stores/auth';
import {
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  CalendarDays,
  LogOut,
  Trash2,
  AlertTriangle,
  ArrowUpCircle,
  ListChecks,
} from 'lucide-react';

interface Task {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: string;
  status: string;
  category: { name: string; color: string } | null;
  reminders: { remindAt: string }[];
}

export default function Dashboard() {
  const [tab, setTab] = useState<'tasks' | 'appointments'>('tasks');
  const [newTask, setNewTask] = useState('');
  const [dueDate, setDueDate] = useState('');
  const logout = useAuthStore((s) => s.logout);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiFetch('/tasks?limit=100'),
  });

  const createTask = useMutation({
    mutationFn: (body: any) => apiFetch('/tasks', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      setNewTask('');
      setDueDate('');
    },
  });

  const completeTask = useMutation({
    mutationFn: (id: string) => apiFetch(`/tasks/${id}/complete`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) => apiFetch(`/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const tasks: Task[] = data?.data || [];
  const pending = tasks.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
  const overdue = pending.filter((t) => t.dueDate && new Date(t.dueDate) < new Date());
  const today = pending.filter((t) => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    const n = new Date();
    return d.toDateString() === n.toDateString();
  });

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    createTask.mutate({
      title: newTask,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      priority: 'MEDIUM',
      reminders: dueDate ? [{ remindAt: new Date(new Date(dueDate).getTime() - 15 * 60000).toISOString() }] : [],
    });
  };

  const priorityIcon = (p: string) => {
    if (p === 'URGENT') return <AlertTriangle size={14} className="text-red-400" />;
    if (p === 'HIGH') return <ArrowUpCircle size={14} className="text-amber-400" />;
    return <Clock size={14} className="text-slate-400" />;
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-indigo-500 flex items-center justify-center">
              <span className="text-white font-bold text-xs">T</span>
            </div>
            <span className="font-semibold">TaskOverlay</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-slate-800 rounded-lg p-0.5">
              <button
                onClick={() => setTab('tasks')}
                className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition ${tab === 'tasks' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <ListChecks size={14} /> Tasks
              </button>
              <button
                onClick={() => setTab('appointments')}
                className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition ${tab === 'appointments' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <CalendarDays size={14} /> Appointments
              </button>
            </div>
            <button onClick={logout} className="text-slate-400 hover:text-slate-200">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="text-slate-400 text-xs mb-1">Pending</div>
            <div className="text-2xl font-bold">{pending.length}</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="text-red-400 text-xs mb-1">Overdue</div>
            <div className="text-2xl font-bold text-red-400">{overdue.length}</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="text-amber-400 text-xs mb-1">Due Today</div>
            <div className="text-2xl font-bold text-amber-400">{today.length}</div>
          </div>
        </div>

        {/* Add Task */}
        <form onSubmit={addTask} className="flex gap-2 mb-6">
          <input
            type="text"
            placeholder="Add a new task..."
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <input
            type="datetime-local"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 text-slate-300"
          />
          <button
            type="submit"
            disabled={createTask.isPending}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg px-3 py-2 transition"
          >
            <Plus size={18} />
          </button>
        </form>

        {/* Task List */}
        <div className="space-y-2">
          {isLoading ? (
            <div className="text-slate-400 text-sm text-center py-10">Loading...</div>
          ) : tasks.length === 0 ? (
            <div className="text-slate-400 text-sm text-center py-10">No tasks yet. Add one above!</div>
          ) : (
            tasks.map((task) => {
              const isDone = task.status === 'COMPLETED' || task.status === 'CANCELLED';
              const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !isDone;
              return (
                <div
                  key={task.id}
                  className={`group flex items-start gap-3 bg-slate-900 border rounded-xl p-3 transition ${isOverdue ? 'border-red-900/50' : 'border-slate-800 hover:border-slate-700'}`}
                >
                  <button
                    onClick={() => !isDone && completeTask.mutate(task.id)}
                    className="mt-0.5"
                  >
                    {isDone ? (
                      <CheckCircle2 size={18} className="text-emerald-400" />
                    ) : (
                      <Circle size={18} className="text-slate-500 hover:text-indigo-400" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${isDone ? 'line-through text-slate-500' : 'text-slate-100'}`}>
                      {task.title}
                    </div>
                    {task.description && (
                      <div className="text-xs text-slate-400 mt-0.5 truncate">{task.description}</div>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      {priorityIcon(task.priority)}
                      {task.dueDate && (
                        <span className={`text-xs ${isOverdue ? 'text-red-400' : 'text-slate-400'}`}>
                          {new Date(task.dueDate).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {task.category && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: task.category.color + '20', color: task.category.color }}
                        >
                          {task.category.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteTask.mutate(task.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
