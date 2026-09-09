-- Generated from app/models.py. Datetimes are stored as UTC.

PRAGMA foreign_keys=ON;

CREATE TABLE courses (
	id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, 
	name VARCHAR(120) NOT NULL, 
	color VARCHAR(7) NOT NULL, 
	syllabus TEXT NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	CONSTRAINT course_name_length CHECK (length(trim(name)) BETWEEN 1 AND 120), 
	CONSTRAINT course_hex_color CHECK (length(color) = 7 AND substr(color, 1, 1) = '#' AND substr(color, 2) NOT GLOB '*[^0-9a-fA-F]*')
);

CREATE TABLE tasks (
	id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, 
	course_id INTEGER NOT NULL, 
	title VARCHAR(200) NOT NULL, 
	description TEXT NOT NULL, 
	task_type VARCHAR(10) NOT NULL, 
	due_at DATETIME NOT NULL, 
	status VARCHAR(11) NOT NULL, 
	priority VARCHAR(6) NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	CONSTRAINT task_title_length CHECK (length(trim(title)) BETWEEN 1 AND 200), 
	FOREIGN KEY(course_id) REFERENCES courses (id) ON DELETE CASCADE, 
	CONSTRAINT task_type CHECK (task_type IN ('assignment', 'homework', 'quiz', 'project', 'exam')), 
	CONSTRAINT task_status CHECK (status IN ('not_started', 'in_progress', 'completed')), 
	CONSTRAINT task_priority CHECK (priority IN ('low', 'medium', 'high'))
);

CREATE INDEX ix_tasks_course_id ON tasks (course_id);

CREATE INDEX ix_tasks_due_at ON tasks (due_at);

CREATE INDEX ix_tasks_status_due ON tasks (status, due_at);

CREATE TABLE focus_sessions (
	id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, 
	client_session_id VARCHAR(36) NOT NULL, 
	task_id INTEGER, 
	started_at DATETIME NOT NULL, 
	ended_at DATETIME NOT NULL, 
	elapsed_seconds INTEGER NOT NULL, 
	CONSTRAINT focus_elapsed_nonnegative CHECK (elapsed_seconds >= 0), 
	CONSTRAINT focus_time_order CHECK (ended_at >= started_at), 
	CONSTRAINT focus_elapsed_within_interval CHECK (elapsed_seconds <= (julianday(ended_at) - julianday(started_at)) * 86400 + 1), 
	UNIQUE (client_session_id), 
	FOREIGN KEY(task_id) REFERENCES tasks (id) ON DELETE SET NULL
);

CREATE INDEX ix_focus_sessions_task_id ON focus_sessions (task_id);

CREATE TABLE subtasks (
	id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, 
	task_id INTEGER NOT NULL, 
	title VARCHAR(200) NOT NULL, 
	is_completed BOOLEAN NOT NULL, 
	position INTEGER NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	CONSTRAINT subtask_title_length CHECK (length(trim(title)) BETWEEN 1 AND 200), 
	CONSTRAINT subtask_position_nonnegative CHECK (position >= 0), 
	FOREIGN KEY(task_id) REFERENCES tasks (id) ON DELETE CASCADE, 
	CHECK (is_completed IN (0, 1))
);

CREATE INDEX ix_subtasks_task_id ON subtasks (task_id);
