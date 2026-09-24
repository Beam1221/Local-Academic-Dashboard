"""Frozen Windows backend, started and owned by the Electron main process."""
import json
import os
import secrets
import socket
import sys
import threading
from pathlib import Path


def main():
    token = os.environ.get('STUDYSPACE_DESKTOP_TOKEN', '')
    if len(token) < 32 or not os.environ.get('DATA_DIR'):
        raise RuntimeError('Start this backend through Studyspace.exe')
    from app.main import app
    from starlette.responses import JSONResponse
    from starlette.staticfiles import StaticFiles
    import uvicorn

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
    port = int(os.environ.get('STUDYSPACE_PORT', '0'))
    try:
        sock.bind(('127.0.0.1', port))
    except OSError:
        sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
    origin = f'http://127.0.0.1:{port}'

    @app.middleware('http')
    async def desktop_only(request, call_next):
        supplied = request.headers.get('x-studyspace-token', '')
        if not secrets.compare_digest(supplied, token):
            return JSONResponse({'detail': 'Desktop session required'}, status_code=403)
        if request.headers.get('origin') not in (None, origin):
            return JSONResponse({'detail': 'Untrusted origin'}, status_code=403)
        response = await call_next(request)
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    @app.get('/api/desktop-health')
    def health():
        return {'ready': True, 'desktop': True}

    web = Path(os.environ['STUDYSPACE_WEB_DIR']).resolve()
    if not (web / 'index.html').is_file():
        raise RuntimeError('The bundled frontend is missing. Reinstall Studyspace.')
    app.mount('/', StaticFiles(directory=web, html=True), name='desktop-web')
    server = uvicorn.Server(uvicorn.Config(app, host='127.0.0.1', port=port, access_log=False, log_level='warning'))

    def parent_watch():
        # EOF also shuts down the backend if Electron crashes.
        sys.stdin.buffer.read()
        server.should_exit = True

    threading.Thread(target=parent_watch, daemon=True).start()
    print(json.dumps({'port': port}), flush=True)
    server.run(sockets=[sock])


if __name__ == '__main__':
    import multiprocessing
    multiprocessing.freeze_support()
    main()
