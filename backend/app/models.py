from __future__ import annotations

import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from .database import Base


class UTCDateTime(TypeDecorator):
    """Store UTC in SQLite and always return timezone-aware datetimes."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Datetime must include a timezone offset")
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value, dialect):
        return value.replace(tzinfo=timezone.utc) if value is not None else None


def utc_now():
    return datetime.now(timezone.utc)


class TaskType(str, enum.Enum):
    ASSIGNMENT = "assignment"
    HOMEWORK = "homework"
    QUIZ = "quiz"
    PROJECT = "project"
    EXAM = "exam"


class TaskStatus(str, enum.Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class Priority(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


def enum_column(cls, name):
    return Enum(cls, name=name, native_enum=False, create_constraint=True,
                validate_strings=True, values_callable=lambda members: [m.value for m in members])


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now, onupdate=utc_now)


class Course(Timestamps, Base):
    __tablename__ = "courses"
    __table_args__ = (
        CheckConstraint("length(trim(name)) BETWEEN 1 AND 120", name="course_name_length"),
        CheckConstraint("length(color) = 7 AND substr(color, 1, 1) = '#' AND substr(color, 2) NOT GLOB '*[^0-9a-fA-F]*'", name="course_hex_color"),
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    color: Mapped[str] = mapped_column(String(7), default="#818CF8")
    syllabus: Mapped[str] = mapped_column(Text, default="")
    tasks: Mapped[list[Task]] = relationship(back_populates="course", cascade="all, delete-orphan", passive_deletes=True)


class Task(Timestamps, Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint("length(trim(title)) BETWEEN 1 AND 200", name="task_title_length"),
        Index("ix_tasks_status_due", "status", "due_at"),
        # Browser-local pending timers may still reference a deleted task ID.
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    task_type: Mapped[TaskType] = mapped_column(enum_column(TaskType, "task_type"), default=TaskType.ASSIGNMENT)
    due_at: Mapped[datetime] = mapped_column(UTCDateTime(), index=True)
    status: Mapped[TaskStatus] = mapped_column(enum_column(TaskStatus, "task_status"), default=TaskStatus.NOT_STARTED)
    priority: Mapped[Priority] = mapped_column(enum_column(Priority, "task_priority"), default=Priority.MEDIUM)
    course: Mapped[Course] = relationship(back_populates="tasks")
    subtasks: Mapped[list[Subtask]] = relationship(back_populates="task", cascade="all, delete-orphan", passive_deletes=True, order_by="Subtask.position, Subtask.id")
    focus_sessions: Mapped[list[FocusSession]] = relationship(back_populates="task", passive_deletes="all")


class Subtask(Timestamps, Base):
    __tablename__ = "subtasks"
    __table_args__ = (
        CheckConstraint("length(trim(title)) BETWEEN 1 AND 200", name="subtask_title_length"),
        CheckConstraint("position >= 0", name="subtask_position_nonnegative"),
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    is_completed: Mapped[bool] = mapped_column(Boolean(create_constraint=True), default=False)
    position: Mapped[int] = mapped_column(default=0)
    task: Mapped[Task] = relationship(back_populates="subtasks")


class FocusSession(Base):
    """Completed or stopped work intervals; breaks are not counted as work."""

    __tablename__ = "focus_sessions"
    __table_args__ = (
        CheckConstraint("elapsed_seconds >= 0", name="focus_elapsed_nonnegative"),
        CheckConstraint("ended_at >= started_at", name="focus_time_order"),
        CheckConstraint("elapsed_seconds <= (julianday(ended_at) - julianday(started_at)) * 86400 + 1", name="focus_elapsed_within_interval"),
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    client_session_id: Mapped[str] = mapped_column(String(36), unique=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"), index=True)
    started_at: Mapped[datetime] = mapped_column(UTCDateTime())
    ended_at: Mapped[datetime] = mapped_column(UTCDateTime())
    elapsed_seconds: Mapped[int] = mapped_column()
    task: Mapped[Task | None] = relationship(back_populates="focus_sessions")
