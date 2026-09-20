import { useCallback, useEffect, useRef, useState } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { CalendarCheck, Check, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { Course, Task } from '../types';
import { dayKey, planDate, planner, suggestions, type Todo } from '../lib/planner';
import { dueLabel } from '../lib/dates';
import { Progress } from '../components/TaskCard';
import { Modal } from '../components/Modal';

export function TodoView({ tasks, courses, now, onTask }: { tasks: Task[]; courses: Course[]; now: Date; onTask: (task: Task) => void }) {
  const today = dayKey(now);
  const [day, setDay] = useState(() => { try { return planDate(today, localStorage.getItem('studyspace-plan-date')); } catch { return today; } });
  const dayRef = useRef(day); dayRef.current = day;
  const [items, setItems] = useState<Todo[]>([]); const [loadedDay, setLoadedDay] = useState('');
  const [title, setTitle] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [edit, setEdit] = useState<Todo | null>(null);
  const reload = useCallback(async () => {
    const result = await planner.list(day);
    if (dayRef.current === day) { setItems(result); setLoadedDay(day); setError(''); }
  }, [day]);
  useEffect(() => {
    if (day < today) { setDay(today); return; }
    try { localStorage.setItem('studyspace-plan-date', day); } catch { /* Works for this visit. */ }
    void reload().catch(err => { if (dayRef.current === day) setError(err.message); });
  }, [day, today, reload]);
  useEffect(() => { const load = () => { if (document.visibilityState === 'visible') void reload().catch(err => setError(err.message)); }; document.addEventListener('visibilitychange', load); return () => document.removeEventListener('visibilitychange', load); }, [reload]);
  async function act(action: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await action(); await reload(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  const loaded = loadedDay === day;
  const complete = items.filter(item => item.progress === 100).length;
  const progress = items.length ? Math.round(items.reduce((sum, item) => sum + item.progress, 0) / items.length) : 0;
  const recommended = suggestions(tasks, day, now);
  return <div className="planner-layout"><div className="view-content">
    <section className="panel plan-heading"><div className="section-heading"><div><span className="eyebrow">A PLAN FOR YOUR DAY</span><h2>{day === today ? 'Today' : format(parseISO(day), 'EEEE, MMMM d')}</h2></div><CalendarCheck size={28}/></div>
      <div className="plan-date-controls"><div className="filter-tabs"><button disabled={busy} className={day === today ? 'selected' : ''} onClick={() => setDay(today)}>Today</button><button disabled={busy} className={day === dayKey(addDays(now, 1)) ? 'selected' : ''} onClick={() => setDay(dayKey(addDays(now, 1)))}>Tomorrow</button></div><label>Plan date<input type="date" min={today} value={day} disabled={busy} onChange={e => { if (e.target.value >= today) setDay(e.target.value); }}/></label></div>
      <div className="plan-progress-label"><span>{loaded ? `${complete} of ${items.length} checked off` : 'Loading your plan…'}</span><strong>{loaded ? progress : 0}%</strong></div><Progress value={loaded ? progress : 0} label="Daily plan progress"/>
    </section>
    {error && <div role="alert" className="error-banner"><span>{error}</span><button className="text-button" onClick={() => void act(async () => {})}>Retry</button></div>}
    <section className="panel"><form className="inline-form" onSubmit={e => { e.preventDefault(); void act(async () => { await planner.add(title, day); setTitle(''); }); }}><input aria-label="New to-do" autoFocus required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder="What do you want to do?"/><button className="button primary" disabled={busy || !title.trim()}><Plus size={17}/>Add</button></form>
      <div className="todo-items" aria-busy={busy || !loaded}>{loaded && items.map(item => {
        const linked = tasks.find(task => task.id === item.task_id);
        return <article className={`todo-row ${item.progress === 100 ? 'done' : ''}`} key={item.id}>
          <button className={`task-check ${item.progress === 100 ? 'checked' : ''}`} disabled={busy} aria-label={`${item.progress === 100 ? 'Reopen' : 'Complete'} ${item.title}`} aria-pressed={item.progress === 100} onClick={() => void act(() => planner.update(item.id, { progress: item.progress === 100 ? 0 : 100 }))}><Check size={15}/></button>
          <div className="todo-content"><strong>{item.title}</strong>{linked && <button className="text-button todo-source" onClick={() => onTask(linked)}>{courses.find(c => c.id === linked.course_id)?.name} · Due {dueLabel(linked.due_at)}</button>}<Progress value={item.progress} label={`${item.title} progress`}/></div>
          <select className="todo-progress-select" aria-label={`Progress for ${item.title}`} value={item.progress} disabled={busy} onChange={e => void act(() => planner.update(item.id, { progress: Number(e.target.value) }))}>{[0, 25, 50, 75, 100].map(value => <option key={value} value={value}>{value}%</option>)}</select>
          <button className="icon-button" aria-label={`Edit ${item.title}`} disabled={busy} onClick={() => setEdit({ ...item })}><Pencil size={16}/></button><button className="icon-button" aria-label={`Delete ${item.title}`} disabled={busy} onClick={() => { if (window.confirm(`Delete “${item.title}” from this plan?`)) void act(() => planner.remove(item.id)); }}><Trash2 size={16}/></button>
        </article>;
      })}</div>
      {loaded && !items.length && <div className="empty-inline"><CalendarCheck size={28}/><div><strong>A fresh page for your day</strong><p>Add personal errands, study goals, or a suggested assignment.</p></div></div>}
      {!loaded && !error && <p className="view-footnote" role="status">Loading…</p>}
    </section><p className="view-footnote">Your daily plan is separate from course deadlines. Checking off an item does not complete its original assignment.</p>
  </div><aside className="panel suggestions-panel"><div className="section-heading"><h2><Sparkles size={18}/>Coming up</h2></div><p className="view-footnote">Unfinished coursework due in less than a week, on or after your plan date.</p><div className="suggestion-list">{recommended.map(task => {
    const added = loaded && items.some(item => item.task_id === task.id);
    const course = courses.find(c => c.id === task.course_id);
    return <article className="suggestion" key={task.id}><span className="course-tag" style={{ color: course?.color }}>{course?.name}</span><button className="suggestion-title" onClick={() => onTask(task)}>{task.title}</button><span className="view-footnote">{dueLabel(task.due_at)}</span><button className="button secondary" disabled={busy || !loaded || added} onClick={() => void act(() => planner.add(task.title, day, task.id))}>{added ? <Check size={16}/> : <Plus size={16}/>} {added ? 'In your plan' : 'Add to this day'}</button></article>;
  })}{!recommended.length && <p className="empty-inline">No upcoming coursework for this plan date.</p>}</div></aside>
    {edit && <Modal title="Edit plan item" onClose={() => { if (!busy) setEdit(null); }}><form className="form-stack" onSubmit={e => { e.preventDefault(); void act(async () => { await planner.update(edit.id, { title: edit.title, scheduled_for: edit.scheduled_for }); setEdit(null); }); }}><label>Title<input autoFocus required maxLength={200} value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })}/></label><label>Move to date<input required type="date" min={today} value={edit.scheduled_for} onChange={e => setEdit({ ...edit, scheduled_for: e.target.value })}/></label>{error && <p role="alert" className="form-error">{error}</p>}<button className="button primary" disabled={busy || !edit.title.trim() || edit.scheduled_for < today}>Save changes</button></form></Modal>}
  </div>;
}
