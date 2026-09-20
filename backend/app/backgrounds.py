from pathlib import Path
from typing import Annotated
from urllib.parse import unquote
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import data_dir, get_db
from .models import BackgroundAsset

router = APIRouter(prefix="/api/backgrounds", tags=["Backgrounds"])
DB = Annotated[Session, Depends(get_db)]
ASSET_DIR = data_dir / "backgrounds"
MAX_BYTES = 25 * 1024 * 1024
TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "video/mp4": ".mp4", "video/webm": ".webm"}


def describe(item):
    return {"id": item.id, "name": item.name, "content_type": item.content_type, "url": f"/api/backgrounds/{item.id}/file"}


def valid_signature(kind, header):
    return {
        "image/jpeg": header.startswith(b"\xff\xd8\xff"),
        "image/png": header.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/gif": header.startswith((b"GIF87a", b"GIF89a")),
        "image/webp": header[:4] == b"RIFF" and header[8:12] == b"WEBP",
        "video/mp4": header[4:8] == b"ftyp",
        "video/webm": header.startswith(b"\x1aE\xdf\xa3"),
    }.get(kind, False)


@router.get("")
def list_backgrounds(db: DB):
    return [describe(item) for item in db.scalars(select(BackgroundAsset).order_by(BackgroundAsset.id))]


@router.post("", status_code=201)
async def upload_background(request: Request, db: DB):
    kind = request.headers.get("content-type", "").split(";")[0].lower()
    if kind not in TYPES:
        raise HTTPException(415, "Choose a JPG, PNG, WebP, GIF, MP4, or WebM file")
    name = unquote(request.headers.get("x-file-name", "Background")).strip()[:255] or "Background"
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
                    raise HTTPException(413, "Each background must be 25 MB or smaller")
                if len(header) < 16:
                    header = (header + chunk)[:16]
                output.write(chunk)
        if not valid_signature(kind, header):
            raise HTTPException(415, "The file contents do not match a supported image or video")
        temporary.replace(target)
        item = BackgroundAsset(name=name, content_type=kind, storage_name=storage_name)
        db.add(item); db.commit()
        committed = True
        db.refresh(item)
        return describe(item)
    finally:
        temporary.unlink(missing_ok=True)
        if not committed:
            target.unlink(missing_ok=True)


@router.get("/{asset_id}/file")
def read_background(asset_id: int, db: DB):
    item = db.get(BackgroundAsset, asset_id)
    if item is None:
        raise HTTPException(404, "Background not found")
    path = ASSET_DIR / item.storage_name
    if not path.is_file():
        raise HTTPException(404, "Background file not found")
    return FileResponse(path, media_type=item.content_type, headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=31536000, immutable"})


@router.delete("/{asset_id}", status_code=204)
def delete_background(asset_id: int, db: DB):
    item = db.get(BackgroundAsset, asset_id)
    if item is None:
        raise HTTPException(404, "Background not found")
    path = ASSET_DIR / item.storage_name
    db.delete(item); db.commit()
    path.unlink(missing_ok=True)
    return Response(status_code=204)
