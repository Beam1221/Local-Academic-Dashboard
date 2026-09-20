from datetime import date, datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models import Todo, Task
from .schemas import Input, Output, Patch, Title

router = APIRouter(prefix="/api/todos", tags=["Daily plans"])
DB = Annotated[Session, Depends(get_db)]


class TodoCreate(Input):
    title: Title
    scheduled_for: date
    task_id: int | None = Field(default=None, gt=0)
    utc_offset_minutes: int = Field(default=0, ge=-840, le=840)


class TodoPatch(Patch):
    title: Title | None = None
    scheduled_for: date | None = None
    progress: int | None = Field(default=None, ge=0, le=100, strict=True)
    utc_offset_minutes: int = Field(default=0, ge=-840, le=840)


class TodoOut(Output):
    id: int
    title: str
    scheduled_for: date
    progress: int
    task_id: int | None


def validate_day(day, offset):
    today = datetime.now(timezone(timedelta(minutes=offset))).date()
    if day < today:
        raise HTTPException(422, "Choose today or a future date")


@router.get("", response_model=list[TodoOut])
def list_todos(db: DB, day: date, utc_offset_minutes: Annotated[int, Query(ge=-840, le=840)] = 0):
    validate_day(day, utc_offset_minutes)
    return db.scalars(select(Todo).where(Todo.scheduled_for == day).order_by(Todo.id)).all()


@router.post("", response_model=TodoOut, status_code=201)
def create_todo(payload: TodoCreate, db: DB, response: Response):
    validate_day(payload.scheduled_for, payload.utc_offset_minutes)
    if payload.task_id is not None:
        if db.get(Task, payload.task_id) is None:
            raise HTTPException(404, "Course task no longer exists")
        existing = db.scalar(select(Todo).where(Todo.scheduled_for == payload.scheduled_for, Todo.task_id == payload.task_id))
        if existing:
            response.status_code = 200
            return existing
    item = Todo(**payload.model_dump(exclude={"utc_offset_minutes"}))
    db.add(item); db.commit(); db.refresh(item)
    return item


@router.patch("/{todo_id}", response_model=TodoOut)
def update_todo(todo_id: int, payload: TodoPatch, db: DB):
    item = db.get(Todo, todo_id)
    if item is None:
        raise HTTPException(404, "Plan item not found")
    validate_day(payload.scheduled_for or item.scheduled_for, payload.utc_offset_minutes)
    for name, value in payload.model_dump(exclude_unset=True, exclude={"utc_offset_minutes"}).items():
        setattr(item, name, value)
    db.commit(); db.refresh(item)
    return item


@router.delete("/{todo_id}", status_code=204)
def delete_todo(todo_id: int, db: DB):
    item = db.get(Todo, todo_id)
    if item is None:
        raise HTTPException(404, "Plan item not found")
    db.delete(item); db.commit()
    return Response(status_code=204)
