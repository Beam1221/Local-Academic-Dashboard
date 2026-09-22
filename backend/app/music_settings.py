"""Local music settings; credentials never returned to the browser."""
import os
from typing import Annotated, Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session
from .database import get_db
from .models import MusicSettings
from .notifications import cipher, lock
router = APIRouter(prefix='/api/settings/music', tags=['Settings'])
DB = Annotated[Session, Depends(get_db)]
class Config(BaseModel):
    model_config = ConfigDict(extra='forbid')
    result_count: int = Field(default=12, ge=1, le=25)
    safe_search: Literal['none','moderate','strict'] = 'moderate'
class Input(Config):
    api_key: str = Field(default='', max_length=200)
    clear_key: bool = False

def config(db):
    row = db.get(MusicSettings, 1)
    return Config.model_validate_json(row.config) if row else Config()

def key(db):
    row = db.get(MusicSettings, 1)
    if row and row.secret:
        try: return cipher().decrypt(row.secret.encode()).decode()
        except Exception: raise HTTPException(503, 'Saved YouTube key cannot be decrypted. Save it again in Settings.')
    return os.getenv('YOUTUBE_API_KEY','').strip()

@router.get('')
def read(db: DB):
    row = db.get(MusicSettings, 1)
    source = 'saved' if row and row.secret else 'environment' if os.getenv('YOUTUBE_API_KEY','').strip() else 'none'
    return {**config(db).model_dump(), 'key_source': source, 'has_key': source != 'none'}

@router.put('')
def save(body: Input, db: DB):
    value = body.api_key.strip()
    if value and (not value.isascii() or any(c.isspace() for c in value)):
        raise HTTPException(422, 'API key must contain no spaces or line breaks')
    with lock:
        row = db.get(MusicSettings, 1) or MusicSettings(id=1, secret='')
        if body.clear_key: row.secret = ''
        elif value: row.secret = cipher().encrypt(value.encode()).decode()
        row.config = Config(**body.model_dump(include={'result_count','safe_search'})).model_dump_json()
        db.add(row); db.commit()
    return read(db)
