"""Read-only YouTube account/playlist access. Credentials remain encrypted locally."""
import base64
import hashlib
import json
import logging
import re
import secrets
import threading
import time
import urllib.parse
import urllib.request
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session
from .database import get_db
from .models import YouTubeAccount
from .notifications import cipher
from .music_settings import key as api_key

router = APIRouter(prefix='/api/youtube', tags=['YouTube account and playlists'])
DB = Annotated[Session, Depends(get_db)]
SCOPE = 'https://www.googleapis.com/auth/youtube.readonly'
CALLBACK = '/api/youtube/account/callback'
COOKIE = 'studyspace_youtube_flow'
account_lock = threading.RLock()

class RedactCallback(logging.Filter):
    def filter(self, record):
        if isinstance(record.args, tuple) and len(record.args) == 5 and str(record.args[2]).startswith(CALLBACK):
            args = list(record.args); args[2] = CALLBACK + '?[redacted]'; record.args = tuple(args)
        return True

logging.getLogger('uvicorn.access').addFilter(RedactCallback())

class Settings(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    client_id: str = Field(default='', max_length=250)
    client_secret: str = Field(default='', max_length=500)
    redirect_uri: str = Field(default='', max_length=1000)

    @field_validator('client_id')
    @classmethod
    def client(cls, value):
        if value and not re.fullmatch(r'[A-Za-z0-9_-]+\.apps\.googleusercontent\.com', value):
            raise ValueError('Enter your Google OAuth Web application client ID')
        return value

    @field_validator('redirect_uri')
    @classmethod
    def redirect(cls, value):
        if not value: return value
        url = urllib.parse.urlsplit(value)
        if (not url.hostname or url.username or url.password or url.query or url.fragment or url.path != CALLBACK
            or not (url.scheme == 'https' or (url.scheme == 'http' and url.hostname in ('localhost', '127.0.0.1')))):
            raise ValueError('Use HTTPS, or localhost HTTP, with the exact /api/youtube/account/callback path')
        return value

def load(db):
    row = db.get(YouTubeAccount, 1)
    if not row: return YouTubeAccount(id=1, config='{}', secret=''), {}, {}
    try:
        return row, json.loads(row.config), json.loads(cipher().decrypt(row.secret.encode())) if row.secret else {}
    except Exception:
        raise HTTPException(503, 'YouTube credentials cannot be decrypted. Restore email.key from your backup.')

def persist(db, row, config, private):
    row.config = json.dumps(config)
    row.secret = cipher().encrypt(json.dumps(private).encode()).decode()
    db.add(row); db.commit()

def google_request(url, form=None, bearer=None):
    headers = {'User-Agent':'Studyspace/9.0'}
    if bearer: headers['Authorization'] = 'Bearer ' + bearer
    data = urllib.parse.urlencode(form).encode() if form is not None else None
    if data is not None: headers['Content-Type'] = 'application/x-www-form-urlencoded'
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers), timeout=12) as response:
            raw = response.read(2 * 1024 * 1024)
            return json.loads(raw) if raw else {}
    except Exception:
        # Never include a request URL, token, auth code or raw Google response in errors.
        raise HTTPException(502, 'YouTube could not complete the request. Check access, credentials and API quota; reconnect if authorization expired.')

@router.get('/account/settings')
def read_settings(db: DB):
    _, config, private = load(db)
    return {**{'client_id':'', 'redirect_uri':''}, **config, 'has_client_secret':bool(private.get('client_secret')),
            'connected':bool(private.get('access_token')), 'configured':bool(config.get('client_id') and config.get('redirect_uri') and private.get('client_secret'))}

@router.put('/account/settings')
def save_settings(body: Settings, db: DB):
    with account_lock:
        row, old, private = load(db)
        config = body.model_dump(exclude={'client_secret'})
        if config != old or (body.client_secret and body.client_secret != private.get('client_secret')):
            private = {'client_secret':body.client_secret or private.get('client_secret','')}
        elif body.client_secret: private['client_secret'] = body.client_secret
        persist(db,row,config,private)
    return read_settings(db)

@router.post('/account/connect')
def connect(request: Request, response: Response, db: DB):
    with account_lock:
        row, config, private = load(db)
        if not all([config.get('client_id'),config.get('redirect_uri'),private.get('client_secret')]):
            raise HTTPException(422, 'Save OAuth client ID, client secret and redirect URI in Settings first.')
        expected = urllib.parse.urlsplit(config['redirect_uri'])
        browser_origin = request.headers.get('origin')
        if browser_origin != f'{expected.scheme}://{expected.netloc}':
            raise HTTPException(422, 'Open Studyspace at the same origin as your configured redirect URI before connecting.')
        state, nonce, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(32), secrets.token_urlsafe(64)
        private['pending'] = {'state':state,'nonce':nonce,'verifier':verifier,'expires':time.time()+600}
        persist(db,row,config,private)
    response.set_cookie(COOKIE, nonce, httponly=True, secure=expected.scheme=='https', samesite='lax', max_age=600, path=CALLBACK)
    params = {'client_id':config['client_id'],'redirect_uri':config['redirect_uri'],'response_type':'code','scope':SCOPE,
              'state':state,'access_type':'offline','prompt':'consent','code_challenge_method':'S256',
              'code_challenge':base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')}
    return {'url':'https://accounts.google.com/o/oauth2/v2/auth?'+urllib.parse.urlencode(params)}

@router.get('/account/callback')
def callback(request: Request, db: DB, state: str = Query(default='',max_length=500), code: str = Query(default='',max_length=2048), error: str = Query(default='',max_length=200)):
    with account_lock:
        row, config, private = load(db)
        pending = private.get('pending',{})
        if (not state or not secrets.compare_digest(state,pending.get('state','')) or pending.get('expires',0)<time.time()
            or not secrets.compare_digest(request.cookies.get(COOKIE,''),pending.get('nonce','!'))):
            raise HTTPException(400, 'Expired or invalid sign-in session. Start again from Settings in the same browser.')
        private.pop('pending',None)
        persist(db,row,config,private)  # consume state once, including denied/failed attempts
        if error or not code:
            message = 'YouTube connection was cancelled. Return to Settings to try again.'
        else:
            tokens = google_request('https://oauth2.googleapis.com/token',form={'client_id':config['client_id'],
                'client_secret':private['client_secret'],'redirect_uri':config['redirect_uri'],'code':code,
                'grant_type':'authorization_code','code_verifier':pending['verifier']})
            if not tokens.get('access_token') or SCOPE not in tokens.get('scope','').split():
                raise HTTPException(403, 'YouTube read-only permission was not granted. Connect again and allow playlist access.')
            private.update({'access_token':tokens['access_token'],'refresh_token':tokens.get('refresh_token',''),
                            'expires':time.time()+int(tokens.get('expires_in',3600))})
            persist(db,row,config,private)
            message = 'YouTube connected. Return to Music and choose My playlists.'
    html = f'<!doctype html><html><head><meta name="referrer" content="no-referrer"><title>YouTube connection</title></head><body style="font:18px system-ui;padding:40px"><h1>Studyspace</h1><p>{message}</p><a href="/#music">Return to Studyspace</a></body></html>'
    response = HTMLResponse(html, headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'})
    response.delete_cookie(COOKIE,path=CALLBACK)
    return response

@router.post('/account/disconnect')
def disconnect(db: DB):
    with account_lock:
        row, config, private = load(db)
        token = private.get('refresh_token') or private.get('access_token')
        revoked = False
        if token:
            try: google_request('https://oauth2.googleapis.com/revoke',form={'token':token}); revoked=True
            except HTTPException: pass
        persist(db,row,config,{'client_secret':private.get('client_secret','')})
    return {'disconnected':True,'revoked':revoked}

def access_token(db):
    with account_lock:
        row, config, private = load(db)
        if not private.get('access_token'): raise HTTPException(401, 'Connect your YouTube account in Settings first.')
        if private.get('expires',0) < time.time()+60:
            if not private.get('refresh_token'): raise HTTPException(401,'YouTube authorization expired. Reconnect in Settings.')
            tokens = google_request('https://oauth2.googleapis.com/token',form={'client_id':config['client_id'],
                'client_secret':private['client_secret'],'refresh_token':private['refresh_token'],'grant_type':'refresh_token'})
            if not tokens.get('access_token'): raise HTTPException(401,'Reconnect your YouTube account in Settings.')
            private.update({'access_token':tokens['access_token'],'expires':time.time()+int(tokens.get('expires_in',3600))})
            persist(db,row,config,private)
        return private['access_token']

def youtube_request(db, endpoint, params, personal=False):
    bearer = access_token(db) if personal else None
    if not bearer:
        key = api_key(db)
        if not key: raise HTTPException(422,'Save an API key or connect your YouTube account before importing playlists.')
        params = {**params,'key':key}
    return google_request('https://www.googleapis.com/youtube/v3/'+endpoint+'?'+urllib.parse.urlencode(params),bearer=bearer)

@router.get('/account/playlists')
def playlists(db: DB, page_token: str = Query(default='',max_length=500)):
    data = youtube_request(db,'playlists',{'part':'snippet,contentDetails','mine':'true','maxResults':50,'pageToken':page_token},True)
    return {'items':[{'id':x['id'],'title':x['snippet']['title'],'count':x.get('contentDetails',{}).get('itemCount',0)} for x in data.get('items',[])], 'next_page':data.get('nextPageToken','')}

@router.get('/playlist-items/{playlist_id}')
def playlist_items(playlist_id: str, db: DB, page_token: str = Query(default='',max_length=500), personal: bool = False):
    if not re.fullmatch(r'[A-Za-z0-9_-]{2,150}',playlist_id): raise HTTPException(422,'Invalid playlist ID')
    data = youtube_request(db,'playlistItems',{'part':'snippet,contentDetails','playlistId':playlist_id,'maxResults':50,'pageToken':page_token},personal)
    items = []
    for item in data.get('items',[]):
        snippet = item.get('snippet',{})
        video = snippet.get('resourceId',{}).get('videoId','')
        if re.fullmatch(r'[A-Za-z0-9_-]{11}',video) and snippet.get('title') not in ('Deleted video','Private video'):
            items.append({'id':video,'title':snippet.get('title','YouTube video'),'channel':snippet.get('videoOwnerChannelTitle','')})
    return {'items':items, 'next_page':data.get('nextPageToken','')}
