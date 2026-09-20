"""Single-process scheduler with persistent delivery claims; no SMTP secrets in responses."""
import asyncio
import json
import os
import re
import smtplib
import ssl
import threading
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from uuid import uuid4
from zoneinfo import ZoneInfo
from typing import Annotated, Literal
from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session
from .database import data_dir, get_db
from .models import EmailDelivery, NotificationSettings, Task, TaskStatus, Todo
from .meetings import MeetingInput

router = APIRouter(prefix='/api/notifications', tags=['Email notifications'])
DB = Annotated[Session, Depends(get_db)]
KEY_PATH = data_dir / 'email.key'
lock = threading.Lock()

class Settings(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    enabled: bool = False
    host: str = Field(default='', max_length=255)
    port: int = Field(default=587, ge=1, le=65535)
    security: Literal['starttls', 'ssl'] = 'starttls'
    username: str = Field(default='', max_length=300)
    sender: str = Field(default='', max_length=300)
    recipient: str = Field(default='', max_length=300)
    timezone: str = 'Asia/Dubai'
    daily_report: bool = True
    daily_time: str = '08:00'
    unfinished: bool = True
    unfinished_time: str = '20:00'
    upcoming_days: int = Field(default=7, ge=1, le=30)
    include_past_todos: bool = True
    password: Annotated[str, StringConstraints(strip_whitespace=False, max_length=2000)] | None = None
    clear_password: bool = False

    @field_validator('timezone')
    @classmethod
    def zone(cls, v): return MeetingInput.valid_zone(v)
    @field_validator('daily_time', 'unfinished_time')
    @classmethod
    def clock(cls, v):
        if not re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d', v): raise ValueError('Use HH:MM (24-hour time)')
        return v
    @field_validator('sender', 'recipient')
    @classmethod
    def address(cls, v):
        if v and not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+', v): raise ValueError('Enter one valid email address')
        return v
    @field_validator('host', 'username')
    @classmethod
    def single_line(cls, v):
        if '\r' in v or '\n' in v: raise ValueError('Must be a single line')
        return v

def get_settings(db):
    row = db.get(NotificationSettings, 1)
    return row, Settings.model_validate_json(row.config) if row else Settings()

def cipher():
    if not KEY_PATH.exists():
        KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
        try:
            fd = os.open(KEY_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            with os.fdopen(fd, 'wb') as f: f.write(Fernet.generate_key())
        except FileExistsError: pass
    return Fernet(KEY_PATH.read_bytes())

def public(row, config):
    return {**config.model_dump(exclude={'password', 'clear_password'}), 'has_password': bool(row and row.secret)}

@router.get('')
def read_settings(db: DB):
    row, config = get_settings(db)
    return public(row, config)

@router.put('')
def save_settings(body: Settings, db: DB):
    if body.enabled and not all([body.host, body.sender, body.recipient]):
        raise HTTPException(422, 'SMTP host, sender and recipient are required before enabling email')
    with lock:
        row = db.get(NotificationSettings, 1) or NotificationSettings(id=1, secret='')
        if body.clear_password: row.secret = ''
        elif body.password: row.secret = cipher().encrypt(body.password.encode()).decode()
        row.config = body.model_dump_json(exclude={'password', 'clear_password'})
        db.add(row); db.commit()
    return public(row, body)

def report(db, config, kind, now):
    local = now.astimezone(ZoneInfo(config.timezone)); today = local.date()
    query = select(Todo).where(Todo.scheduled_for <= today if config.include_past_todos else Todo.scheduled_for == today)
    todos = list(db.scalars(query.order_by(Todo.scheduled_for)))
    if kind == 'unfinished': todos = [t for t in todos if t.progress < 100]
    else: todos = [t for t in todos if t.scheduled_for == today or t.progress < 100]
    tasks = list(db.scalars(select(Task).where(Task.status != TaskStatus.COMPLETED, Task.due_at < now + timedelta(days=config.upcoming_days)).order_by(Task.due_at)))
    title = f'Studyspace · {"Unfinished tasks" if kind == "unfinished" else "Daily report"} · {today}'
    lines = [f'Your study update ({config.timezone})', '', 'TO-DO LIST']
    lines += [f'- {t.title} — {t.progress}% complete (plan: {t.scheduled_for})' for t in todos] or ['No items to report.']
    lines += ['', 'UPCOMING AND OVERDUE COURSEWORK']
    lines += [f'- {t.title} — {t.due_at.astimezone(ZoneInfo(config.timezone)):%Y-%m-%d %H:%M} ({"overdue" if t.due_at < now else "upcoming"})' for t in tasks] or ['No unfinished coursework due in this window.']
    lines += ['', 'Manage delivery times or disable email in Studyspace → Email reminders.']
    return title, '\n'.join(lines), bool(todos or tasks)

def deliver(config, secret, subject, body):
    message = EmailMessage(); message['From'] = config.sender; message['To'] = config.recipient; message['Subject'] = subject
    message.set_content(body)
    smtp_class = smtplib.SMTP_SSL if config.security == 'ssl' else smtplib.SMTP
    kwargs = {'context': ssl.create_default_context()} if config.security == 'ssl' else {}
    with smtp_class(config.host, config.port, timeout=20, **kwargs) as smtp:
        if config.security == 'starttls': smtp.ehlo(); smtp.starttls(context=ssl.create_default_context()); smtp.ehlo()
        if config.username: smtp.login(config.username, cipher().decrypt(secret.encode()).decode() if secret else '')
        smtp.send_message(message)

@router.get('/preview')
def preview(db: DB, kind: Literal['daily', 'unfinished'] = 'daily'):
    _, config = get_settings(db)
    subject, body, has_work = report(db, config, kind, datetime.now(timezone.utc))
    return {'subject': subject, 'body': body, 'has_work': has_work}

@router.get('/history')
def history(db: DB):
    return [{'id': x.id, 'kind': x.kind, 'status': x.status, 'detail': x.detail, 'created_at': x.created_at} for x in db.scalars(select(EmailDelivery).order_by(EmailDelivery.id.desc()).limit(20))]

@router.post('/test')
def test_email(db: DB):
    row, config = get_settings(db)
    if not row or not all([config.host, config.sender, config.recipient]): raise HTTPException(422, 'Save SMTP settings first')
    # Explicit UI action authorizes this single test; automatic delivery stays opt-in.
    attempt = EmailDelivery(delivery_key=str(uuid4()), kind='test', status='sending')
    db.add(attempt); db.commit()
    try:
        deliver(config, row.secret, 'Studyspace test email', 'Your Studyspace email connection is working.')
        attempt.status = 'sent'; attempt.detail = 'Accepted by SMTP server'
    except Exception:
        attempt.status = 'failed'; attempt.detail = 'Connection or authentication failed. Check host, port, credentials and network.'
    db.commit()
    if attempt.status == 'failed': raise HTTPException(502, attempt.detail)
    return {'message': attempt.detail}

def tick(engine, now=None):
    now = now or datetime.now(timezone.utc)
    with lock, Session(engine) as db:
        row, config = get_settings(db)
        if not row or not config.enabled: return
        local = now.astimezone(ZoneInfo(config.timezone))
        for kind, enabled, at in [('daily', config.daily_report, config.daily_time), ('unfinished', config.unfinished, config.unfinished_time)]:
            if not enabled or local.strftime('%H:%M') < at: continue
            key = f'{local.date()}:{kind}'
            if db.scalar(select(EmailDelivery.id).where(EmailDelivery.delivery_key == key)): continue
            subject, body, work = report(db, config, kind, now)
            attempt = EmailDelivery(delivery_key=key, kind=kind, status='sending' if kind == 'daily' or work else 'skipped')
            db.add(attempt); db.commit()  # claim before SMTP; never resend an ambiguous delivery automatically
            if attempt.status == 'skipped': continue
            try:
                deliver(config, row.secret, subject, body)
                attempt.status = 'sent'; attempt.detail = 'Accepted by SMTP server'
            except Exception:
                attempt.status = 'failed'; attempt.detail = 'SMTP failed; check settings and send a test. Automatic retry disabled to avoid duplicate email.'
            db.commit()

async def scheduler(engine):
    while True:
        try: await asyncio.to_thread(tick, engine)
        except Exception:
            import logging
            logging.getLogger(__name__).warning('Email scheduler check failed; it will check again in 30 seconds.')
        await asyncio.sleep(30)
