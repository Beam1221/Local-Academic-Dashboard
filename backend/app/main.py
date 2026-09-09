from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Response
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .database import Base, engine, get_db
from .models import Course, FocusSession, Subtask, Task, TaskStatus
from .migrations import ensure_stable_ids
from .schemas import (
    CourseCreate, CourseOut, CoursePatch, FocusCreate, FocusOut,
    SubtaskCreate, SubtaskOut, SubtaskPatch, TaskCreate, TaskOut, TaskPatch,
)


@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(engine)
    ensure_stable_ids(engine)
    with engine.begin() as connection:
        connection.execute(text("PRAGMA journal_mode=WAL"))
        connection.execute(text("PRAGMA optimize"))
    yield


app = FastAPI(title="Studyspace API", version="1.0.0", lifespan=lifespan,
              docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
DB = Annotated[Session, Depends(get_db)]


@app.exception_handler(IntegrityError)
async def integrity_error(request, exc):
    return JSONResponse(status_code=409, content={"detail": "The record conflicts with existing data. Refresh and try again."})


def require(db, model, record_id):
    record = db.get(model, record_id)
    if record is None:
        raise HTTPException(404, f"{model.__name__} not found")
    return record


def save(db, record):
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def course_out(course):
    total = len(course.tasks)
    completed = sum(task.status == TaskStatus.COMPLETED for task in course.tasks)
    return CourseOut.model_validate(course).model_copy(update={
        "total_tasks": total, "completed_tasks": completed,
        "progress": round(completed / total * 100, 1) if total else 0,
    })


def task_out(task, focus_seconds=0):
    count = len(task.subtasks)
    complete = sum(item.is_completed for item in task.subtasks)
    return TaskOut.model_validate(task).model_copy(update={
        "checklist_progress": round(complete / count * 100, 1) if count else 0,
        "focus_seconds": focus_seconds,
    })


def single_task_out(db, task):
    seconds = db.scalar(select(func.coalesce(func.sum(FocusSession.elapsed_seconds), 0)).where(FocusSession.task_id == task.id))
    return task_out(task, seconds)


@app.get("/api/health")
def health(db: DB):
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.get("/api/courses", response_model=list[CourseOut])
def list_courses(db: DB):
    return [course_out(course) for course in db.scalars(select(Course).options(selectinload(Course.tasks)).order_by(Course.id))]


@app.post("/api/courses", response_model=CourseOut, status_code=201)
def create_course(payload: CourseCreate, db: DB):
    return course_out(save(db, Course(**payload.model_dump())))


@app.get("/api/courses/{course_id}", response_model=CourseOut)
def get_course(course_id: int, db: DB):
    return course_out(require(db, Course, course_id))


@app.patch("/api/courses/{course_id}", response_model=CourseOut)
def update_course(course_id: int, payload: CoursePatch, db: DB):
    course = require(db, Course, course_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(course, key, value)
    return course_out(save(db, course))


@app.delete("/api/courses/{course_id}", status_code=204)
def delete_course(course_id: int, db: DB):
    db.delete(require(db, Course, course_id))
    db.commit()
    return Response(status_code=204)


@app.get("/api/tasks", response_model=list[TaskOut])
def list_tasks(db: DB, course_id: Annotated[int | None, Query(gt=0)] = None, status: TaskStatus | None = None):
    query = select(Task).options(selectinload(Task.subtasks)).order_by(Task.due_at, Task.id)
    if course_id is not None:
        query = query.where(Task.course_id == course_id)
    if status is not None:
        query = query.where(Task.status == status)
    totals = dict(db.execute(select(FocusSession.task_id, func.sum(FocusSession.elapsed_seconds)).group_by(FocusSession.task_id)).all())
    return [task_out(task, totals.get(task.id, 0)) for task in db.scalars(query)]


@app.post("/api/tasks", response_model=TaskOut, status_code=201)
def create_task(payload: TaskCreate, db: DB):
    require(db, Course, payload.course_id)
    return single_task_out(db, save(db, Task(**payload.model_dump())))


@app.get("/api/tasks/{task_id}", response_model=TaskOut)
def get_task(task_id: int, db: DB):
    return single_task_out(db, require(db, Task, task_id))


@app.patch("/api/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: int, payload: TaskPatch, db: DB):
    task = require(db, Task, task_id)
    if payload.course_id is not None:
        require(db, Course, payload.course_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(task, key, value)
    return single_task_out(db, save(db, task))


@app.delete("/api/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, db: DB):
    db.delete(require(db, Task, task_id))
    db.commit()
    return Response(status_code=204)


@app.post("/api/tasks/{task_id}/subtasks", response_model=SubtaskOut, status_code=201)
def create_subtask(task_id: int, payload: SubtaskCreate, db: DB):
    require(db, Task, task_id)
    return save(db, Subtask(task_id=task_id, **payload.model_dump()))


@app.patch("/api/subtasks/{subtask_id}", response_model=SubtaskOut)
def update_subtask(subtask_id: int, payload: SubtaskPatch, db: DB):
    subtask = require(db, Subtask, subtask_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(subtask, key, value)
    return save(db, subtask)


@app.delete("/api/subtasks/{subtask_id}", status_code=204)
def delete_subtask(subtask_id: int, db: DB):
    db.delete(require(db, Subtask, subtask_id))
    db.commit()
    return Response(status_code=204)


@app.get("/api/focus-sessions", response_model=list[FocusOut])
def list_focus(db: DB, task_id: Annotated[int | None, Query(gt=0)] = None):
    query = select(FocusSession).order_by(FocusSession.started_at.desc())
    if task_id is not None:
        query = query.where(FocusSession.task_id == task_id)
    return db.scalars(query).all()


def matching_session(existing, payload):
    # A deleted task may have been set to null since the original successful save.
    if (existing.started_at != payload.started_at or existing.ended_at != payload.ended_at
            or existing.elapsed_seconds != payload.elapsed_seconds
            or (existing.task_id is not None and existing.task_id != payload.task_id)):
        raise HTTPException(409, "Session identifier is already used by a different interval")
    return existing


@app.post("/api/focus-sessions", response_model=FocusOut, status_code=201)
def create_focus(payload: FocusCreate, db: DB, response: Response):
    key = str(payload.client_session_id)
    existing = db.scalar(select(FocusSession).where(FocusSession.client_session_id == key))
    if existing:
        response.status_code = 200
        return matching_session(existing, payload)
    if payload.task_id is not None:
        require(db, Task, payload.task_id)
    values = payload.model_dump()
    values["client_session_id"] = key
    try:
        return save(db, FocusSession(**values))
    except IntegrityError:
        db.rollback()
        existing = db.scalar(select(FocusSession).where(FocusSession.client_session_id == key))
        if existing:
            response.status_code = 200
            return matching_session(existing, payload)
        raise
