from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, model_validator

from .models import Priority, TaskStatus, TaskType

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
CourseName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Color = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Patch(Input):
    @model_validator(mode="before")
    @classmethod
    def reject_null_fields(cls, values):
        if isinstance(values, dict) and any(value is None for value in values.values()):
            raise ValueError("Fields may be omitted, but cannot be null")
        return values


class CourseCreate(Input):
    name: CourseName
    color: Color = "#818CF8"
    syllabus: str = Field(default="", max_length=50000)


class CoursePatch(Patch):
    name: CourseName | None = None
    color: Color | None = None
    syllabus: str | None = Field(default=None, max_length=50000)


class TaskCreate(Input):
    course_id: int = Field(gt=0)
    title: Title
    description: str = Field(default="", max_length=50000)
    task_type: TaskType = TaskType.ASSIGNMENT
    due_at: AwareDatetime
    status: TaskStatus = TaskStatus.NOT_STARTED
    priority: Priority = Priority.MEDIUM


class TaskPatch(Patch):
    course_id: int | None = Field(default=None, gt=0)
    title: Title | None = None
    description: str | None = Field(default=None, max_length=50000)
    task_type: TaskType | None = None
    due_at: AwareDatetime | None = None
    status: TaskStatus | None = None
    priority: Priority | None = None


class SubtaskCreate(Input):
    title: Title
    is_completed: bool = False
    position: int = Field(default=0, ge=0)


class SubtaskPatch(Patch):
    title: Title | None = None
    is_completed: bool | None = None
    position: int | None = Field(default=None, ge=0)


class FocusCreate(Input):
    client_session_id: UUID
    task_id: int | None = Field(default=None, gt=0)
    started_at: AwareDatetime
    ended_at: AwareDatetime
    elapsed_seconds: int = Field(ge=1, le=1500)

    @model_validator(mode="after")
    def check_interval(self):
        if self.ended_at < self.started_at:
            raise ValueError("End must follow start")
        if self.ended_at > datetime.now(timezone.utc) + timedelta(seconds=10):
            raise ValueError("A focus session cannot end in the future")
        if self.elapsed_seconds > (self.ended_at - self.started_at).total_seconds() + 1:
            raise ValueError("Work time cannot exceed the session interval")
        return self


class Output(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class CourseOut(Output):
    id: int
    name: str
    color: str
    syllabus: str
    created_at: datetime
    updated_at: datetime
    total_tasks: int = 0
    completed_tasks: int = 0
    progress: float = 0


class SubtaskOut(Output):
    id: int
    task_id: int
    title: str
    is_completed: bool
    position: int


class TaskOut(Output):
    id: int
    course_id: int
    title: str
    description: str
    task_type: TaskType
    due_at: datetime
    status: TaskStatus
    priority: Priority
    created_at: datetime
    updated_at: datetime
    subtasks: list[SubtaskOut]
    checklist_progress: float = 0
    focus_seconds: int = 0


class FocusOut(Output):
    id: int
    client_session_id: str
    task_id: int | None
    started_at: datetime
    ended_at: datetime
    elapsed_seconds: int
