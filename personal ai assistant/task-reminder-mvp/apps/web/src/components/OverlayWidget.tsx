import React, { useEffect, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../utils/api';
import { useAuthStore } from '../stores/auth';
import {
  Bell,
  ChevronUp,
  X,
  Clock,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
} from 'lucide-react';

interface Task {
  id: string;
  title: string;
  dueDate: string | null;
  priority: string;
  status: string;
}

export default function OverlayWidget() {
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiFetch('/tasks?limit=100'),
    refetchInterval: 30000,
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

  // WebSocket for real-time reminders
  useEffect(() => {
    if (!token) return;
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?token=${token}`);
    ws.onopen = () => console.log('[Overlay] WS connected');
    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.type === 'reminder:trigger') {
        // Flash the overlay to get attention
        setHidden(false);
        setExpanded(true);
        qc.invalidateQueries({ queryKey: ['tasks'] });
      }
    };
    return () => ws.close();
  }, [token, qc]);

  const urgencyColor = overdue.length > 0 ? 'bg-red-500' : today.length > 0 ? 'bg-amber-500' : 'bg-indigo-500';
  const count = pending.length;

  if (hidden) {
    return (
      <button
        onClick={() => setHidden(false)}
        className="fixed bottom-4 right-4 z-[9999] w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition shadow-lg"
        title="Show TaskOverlay"
      >
        <ChevronUp size={14} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-2">
      {/* Expanded panel */}
      {expanded && (
        <div className="w-72 max-h-80 bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
            <span className="text-xs font-semibold text-slate-200">Upcoming</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setExpanded(false)} className="text-slate-400 hover:text-slate-200 p-1">
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="overflow-y-auto p-2 space-y-1 scrollbar-thin">
            {pending.length === 0 ? (
              <div className="text-center text-xs text-slate-500 py-4">All caught up!</div>
            ) : (
              pending.slice(0, 10).map((task) => {
                const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
                return (
                  <div
                    key={task.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs ${isOverdue ? 'bg-red-950/40' : 'bg-slate-800/50'}`}
                  >
                    {isOverdue ? <AlertTriangle size={12} className="text-red-400 shrink-0" /> : <Clock size={12} className="text-slate-400 shrink-0" />}
                    <span className="truncate flex-1">{task.title}</span>
                    {task.dueDate && (
                      <span className="text-slate-500 shrink-0">
                        {new Date(task.dueDate).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Floating icon */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className={`relative w-12 h-12 rounded-full ${urgencyColor} text-white shadow-xl flex items-center justify-center transition hover:scale-105 active:scale-95`}
      >
        <Bell size={20} />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-white text-slate-900 text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      <button
        onClick={() => setHidden(true)}
        className="text-[10px] text-slate-500 hover:text-slate-300 transition"
      >
        Hide
      </button>
    </div>
  );
}
