from pathlib import Path
from typing import Annotated
from urllib.parse import unquote
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response, Query
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import data_dir, get_db
from .models import MusicTrack

router = APIRouter(prefix="/api/music", tags=["Music"])
DB = Annotated[Session, Depends(get_db)]
ASSET_DIR = data_dir / "music"
MAX_BYTES = 100 * 1024 * 1024
TYPES = {"audio/mpeg": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/ogg": ".ogg", "audio/flac": ".flac", "audio/mp4": ".m4a", "audio/webm": ".webm"}


def describe(item):
    return {"id": item.id, "name": item.name, "content_type": item.content_type, "url": f"/api/music/{item.id}/file"}


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
    return [describe(item) for item in db.scalars(select(MusicTrack).order_by(MusicTrack.id))]


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
                    raise HTTPException(413, "Each track must be 100 MB or smaller")
                if len(header) < 16:
                    header = (header + chunk)[:16]
                output.write(chunk)
        if not valid_signature(kind, header):
            raise HTTPException(415, "The file contents do not match supported audio")
        temporary.replace(target)
        item = MusicTrack(name=name, content_type=kind, storage_name=storage_name)
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
    item = db.get(MusicTrack, asset_id)
    if item is None:
        raise HTTPException(404, "Track not found")
    path = ASSET_DIR / item.storage_name
    if not path.is_file():
        raise HTTPException(404, "Track file not found")
    return FileResponse(path, media_type=item.content_type, headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=31536000, immutable"})


@router.delete("/{asset_id}", status_code=204)
def delete_track(asset_id: int, db: DB):
    item = db.get(MusicTrack, asset_id)
    if item is None:
        raise HTTPException(404, "Track not found")
    path = ASSET_DIR / item.storage_name
    db.delete(item); db.commit()
    path.unlink(missing_ok=True)
    return Response(status_code=204)


@router.get('/radio/search')
def radio_search(q: str = Query(default='', max_length=100), genre: str = Query(default='', max_length=50), country: str = Query(default='', pattern=r'^(ET)?$')):
    """Only the public directory is fetched server-side. Playback goes directly to the station."""
    import json
    import urllib.request
    import urllib.parse
    params = {'name': q.strip(), 'tag': genre.strip(), 'limit': 100000 if country == 'ET' else 30, 'hidebroken': 'true', 'order': 'votes', 'reverse': 'true', 'is_https': 'true'}
    if country: params['countrycode'] = country
    for host in ['de1.api.radio-browser.info', 'nl1.api.radio-browser.info']:
        try:
            req = urllib.request.Request('https://' + host + '/json/stations/search?' + urllib.parse.urlencode(params), headers={'User-Agent': 'Studyspace/4.0'})
            with urllib.request.urlopen(req, timeout=8) as response:
                rows = json.loads(response.read(8 * 1024 * 1024))
            result = []
            for row in rows:
                url = row.get('url_resolved', '')
                parsed = urllib.parse.urlsplit(url)
                if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password: continue
                # Reject obvious local destinations from the community directory.
                import ipaddress
                if parsed.hostname.lower() in ('localhost',) or parsed.hostname.lower().endswith(('.local', '.localhost')): continue
                try:
                    if not ipaddress.ip_address(parsed.hostname).is_global: continue
                except ValueError: pass
                result.append({'id': row['stationuuid'], 'name': row['name'][:255], 'url': url, 'country': row.get('country', ''), 'tags': row.get('tags', '')[:150]})
            return result
        except Exception:
            continue
    raise HTTPException(502, 'The radio directory is unavailable. Try again later; your uploaded library still works.')

@router.get('/youtube/search')
def youtube_search(db: DB, q: str = Query(min_length=1, max_length=150)):
    import os, json, re
    import urllib.parse, urllib.request
    from .music_settings import key as stored_key, config
    key = stored_key(db)
    options = config(db)
    if not key:
        raise HTTPException(503, 'Add your YouTube API key in Settings. You can paste a YouTube link without a key.')
    params = {'part':'snippet', 'type':'video', 'videoEmbeddable':'true', 'videoSyndicated':'true', 'maxResults':options.result_count, 'safeSearch':options.safe_search, 'q':q, 'key':key}
    try:
        req=urllib.request.Request('https://www.googleapis.com/youtube/v3/search?' + urllib.parse.urlencode(params), headers={'User-Agent':'Studyspace/5.0'})
        with urllib.request.urlopen(req,timeout=12) as response:
            data=json.loads(response.read(1024*1024))
        return [{'id':v['id']['videoId'], 'title':v['snippet']['title'], 'channel':v['snippet']['channelTitle']} for v in data.get('items',[]) if re.fullmatch(r'[A-Za-z0-9_-]{11}',v.get('id',{}).get('videoId',''))]
    except Exception:
        raise HTTPException(502, 'YouTube search is unavailable. Check your API key, enabled YouTube Data API and quota. Paste a video link to play directly.')
