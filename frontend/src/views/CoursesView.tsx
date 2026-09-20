import { ArrowUpRight, BookOpen, Plus } from 'lucide-react';
import type { Course, Task } from '../types';
import { Progress } from '../components/TaskCard';
import { dueLabel } from '../lib/dates';

export function CoursesView({ courses, tasks, onCourse, onNewCourse }: { courses: Course[]; tasks: Task[]; onCourse: (id: number) => void; onNewCourse: () => void }) {
  return <div><div className="section-heading"><p className="view-footnote">{courses.length} courses · All your coursework in one place</p></div><div className="courses-dashboard">{courses.map((course, index) => {
    const next = tasks.filter(t => t.course_id === course.id && t.status !== 'completed').sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at))[0];
    return <button className="course-gallery-card" key={course.id} onClick={() => onCourse(course.id)} style={{ '--course-color': course.color, '--card-index': index % 4 } as React.CSSProperties}><div className={`course-cover cover-${index % 4}`}><BookOpen size={36}/><span className="course-cover-number">{String(index + 1).padStart(2, '0')}</span></div><div className="course-gallery-body"><div className="section-heading"><h2>{course.name}</h2><ArrowUpRight size={19}/></div><p>{course.syllabus || 'Open your course to add a syllabus and plan your coursework.'}</p><div className="course-tile-meta"><span>{course.completed_tasks} / {course.total_tasks} tasks complete</span><strong>{Math.round(course.progress)}%</strong></div><Progress value={course.progress} label={`${course.name} completion`} color={course.color}/><span className="course-next">{next ? `Next deadline · ${dueLabel(next.due_at)}` : 'No open deadlines'}</span></div></button>;
  })}<button className="course-gallery-add" onClick={onNewCourse}><span><Plus size={26}/></span><strong>Add a course</strong><p>Start a new course workspace</p></button></div></div>;
}
