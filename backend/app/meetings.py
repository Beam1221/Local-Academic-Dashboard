from datetime import date, datetime, timedelta, timezone
from calendar import monthrange
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session
from .database import get_db
from .models import Meeting

router = APIRouter(prefix='/api/meetings', tags=['Meetings'])
DB = Annotated[Session, Depends(get_db)]

class MeetingInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    title: str = Field(min_length=1, max_length=200)
    start_local: datetime
    timezone: str = 'Asia/Dubai'
    duration: int = Field(default=60, ge=5, le=1440)
    frequency: Literal['once', 'daily', 'weekly', 'monthly'] = 'weekly'
    interval: int = Field(default=1, ge=1, le=52)
    count: int | None = Field(default=None, ge=1, le=1000)
    until: date | None = None
    place: str = Field(default='', max_length=300)
    link: str = Field(default='', max_length=1000)
    notes: str = Field(default='', max_length=10000)
    color: str = Field(default='#7dd3fc', pattern=r'^#[0-9a-fA-F]{6}$')

    @field_validator('timezone')
    @classmethod
    def valid_zone(cls, value):
        try: ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError): raise ValueError('Use a valid IANA timezone, e.g. Asia/Dubai')
        return value

    @field_validator('link')
    @classmethod
    def valid_link(cls, value):
        from urllib.parse import urlsplit
        if value and (urlsplit(value).scheme not in ('http', 'https') or not urlsplit(value).hostname):
            raise ValueError('Meeting links must use http or https')
        return value

    @model_validator(mode='after')
    def validate_dates(self):
        if self.start_local.tzinfo is not None: raise ValueError('Start must be local wall time without an offset')
        if not 1900 <= self.start_local.year <= 2100: raise ValueError('Start year must be 1900–2100')
        if self.until and self.until < self.start_local.date(): raise ValueError('End date must follow start date')
        if self.count and self.until: raise ValueError('Choose an end date or occurrence count')
        local = self.start_local.replace(tzinfo=ZoneInfo(self.timezone))
        if local.astimezone(timezone.utc).astimezone(local.tzinfo).replace(tzinfo=None) != self.start_local:
            raise ValueError('This local time does not exist during the daylight-saving transition')
        return self

def output(m):
    return {k: getattr(m, k) for k in ['id', *MeetingInput.model_fields]}

def occurrences(m, start, end):
    origin = datetime.fromisoformat(m.start_local)
    zone = ZoneInfo(m.timezone)
    emitted = 0
    for i in range(100000):
        if m.count and emitted >= m.count: break
        if m.frequency == 'once' and i: break
        if m.frequency == 'monthly':
            n = origin.year * 12 + origin.month - 1 + i * m.interval
            year, month = divmod(n, 12)
            if year > 9998: break
            # Skip missing month dates rather than silently moving a meeting.
            if origin.day > monthrange(year, month + 1)[1]: continue
            local = origin.replace(year=year, month=month + 1)
        else:
            local = origin + timedelta(days=i * m.interval * (7 if m.frequency == 'weekly' else 1))
        if m.until and local.date() > m.until: break
        aware = local.replace(tzinfo=zone)
        at = aware.astimezone(timezone.utc)
        if at >= end: break
        if at.astimezone(zone).replace(tzinfo=None) != local: continue
        emitted += 1
        finish = at + timedelta(minutes=m.duration)
        if finish > start:
            yield {**output(m), 'starts_at': at, 'ends_at': finish, 'occurrence_key': f'{m.id}:{local.isoformat()}'}

@router.get('')
def list_meetings(db: DB):
    return [output(m) for m in db.scalars(select(Meeting).order_by(Meeting.start_local))]

@router.get('/occurrences')
def list_occurrences(start: datetime, end: datetime, db: DB):
    if start.tzinfo is None or end.tzinfo is None or not timedelta(0) < end - start <= timedelta(days=370):
        raise HTTPException(422, 'Supply timezone-aware start/end within 370 days')
    rows = [o for m in db.scalars(select(Meeting)) for o in occurrences(m, start, end)]
    return sorted(rows, key=lambda o: o['starts_at'])

@router.post('', status_code=201)
def create_meeting(body: MeetingInput, db: DB):
    data = body.model_dump(); data['start_local'] = body.start_local.isoformat()
    m = Meeting(**data); db.add(m); db.commit(); db.refresh(m)
    return output(m)

@router.put('/{id}')
def edit_meeting(id: int, body: MeetingInput, db: DB):
    m = db.get(Meeting, id)
    if not m: raise HTTPException(404, 'Meeting not found')
    for key, value in body.model_dump().items(): setattr(m, key, value.isoformat() if key == 'start_local' else value)
    db.commit(); db.refresh(m)
    return output(m)

@router.delete('/{id}', status_code=204)
def delete_meeting(id: int, db: DB):
    m = db.get(Meeting, id)
    if not m: raise HTTPException(404, 'Meeting not found')
    db.delete(m); db.commit()
