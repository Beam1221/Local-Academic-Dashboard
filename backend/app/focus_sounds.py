from pathlib import Path
from typing import Annotated
from urllib.parse import unquote
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response, Query
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import data_dir, get_db
from .models import FocusSound

router = APIRouter(prefix="/api/focus-sounds", tags=["Focus sounds"])
DB = Annotated[Session, Depends(get_db)]
ASSET_DIR = data_dir / "focus-sounds"
MAX_BYTES = 10 * 1024 * 1024
TYPES = {"audio/mpeg": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/ogg": ".ogg", "audio/flac": ".flac", "audio/mp4": ".m4a", "audio/webm": ".webm"}


def describe(item):
    return {"id": item.id, "name": item.name, "content_type": item.content_type, "url": f"/api/focus-sounds/{item.id}/file"}


def valid_signature(kind, header):
    return {
        "audio/mpeg": header.startswith(b"ID3") or (len(header) > 1 and header[0] == 255 and header[1] & 224 == 224),
        "audio/wav": header[:4] == b"RIFF" and header[8:12] == b"WAVE",
        "audio/x-wav": header[:4] == b"RIFF" and header[8:12] == b"WAVE",
        "audio/ogg": header.startswith(b"OggS"),
        "audio/flac": header.startswith(b"fLaC"),
        "audio/mp4": header[4:8] == b"ftyp",
        "audio/webm": header.startswith(b"\x1aE\xdf\xa3"),
    }.get(kind, False)


@router.get("")
def list_music(db: DB):
    return [describe(item) for item in db.scalars(select(FocusSound).order_by(FocusSound.id))]


@router.post("", status_code=201)
async def upload_track(request: Request, db: DB):
    kind = request.headers.get("content-type", "").split(";")[0].lower()
    if kind not in TYPES:
        raise HTTPException(415, "Choose MP3, WAV, Ogg, FLAC, M4A, or WebM audio")
    name = unquote(request.headers.get("x-file-name", "Track")).strip()[:255] or "Track"
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    storage_name = uuid4().hex + TYPES[kind]
    target = ASSET_DIR / storage_name
    temporary = ASSET_DIR / (storage_name + ".part")
    committed = False
    try:
        size = 0
        header = b""
        with temporary.open("xb") as output:
            async for chunk in request.stream():
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(413, "Each track must be 10 MB or smaller")
                if len(header) < 16:
                    header = (header + chunk)[:16]
                output.write(chunk)
        if not valid_signature(kind, header):
            raise HTTPException(415, "The file contents do not match supported audio")
        temporary.replace(target)
        item = FocusSound(name=name, content_type=kind, storage_name=storage_name)
        db.add(item); db.commit()
        committed = True
        db.refresh(item)
        return describe(item)
    finally:
        temporary.unlink(missing_ok=True)
        if not committed:
            target.unlink(missing_ok=True)


@router.get("/{asset_id}/file")
def read_track(asset_id: int, db: DB):
    item = db.get(FocusSound, asset_id)
    if item is None:
        raise HTTPException(404, "Track not found")
    path = ASSET_DIR / item.storage_name
    if not path.is_file():
        raise HTTPException(404, "Track file not found")
    return FileResponse(path, media_type=item.content_type, headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=31536000, immutable"})


@router.delete("/{asset_id}", status_code=204)
def delete_track(asset_id: int, db: DB):
    item = db.get(FocusSound, asset_id)
    if item is None:
        raise HTTPException(404, "Track not found")
    path = ASSET_DIR / item.storage_name
    db.delete(item); db.commit()
    path.unlink(missing_ok=True)
    return Response(status_code=204)


