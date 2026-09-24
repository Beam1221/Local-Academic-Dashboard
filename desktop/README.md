# Studyspace for Windows

Install `Studyspace-Setup-1.0.0-x64.exe` on Windows 10/11, 64-bit x64. Python, Node.js, Docker and a virtual environment are not required on the receiving computer. ARM64 is not a native target of this build.

The installer is unsigned. Windows may display an unknown-publisher/SmartScreen warning. No signing certificate is bundled. Share the installer, not your data directory.

## Everyday use

- Launch Studyspace from its desktop or Start menu shortcut.
- Closing the window keeps the app running in the system tray, so email scheduling and music can continue while the computer is awake. Right-click the tray icon and choose **Quit Studyspace** to stop everything.
- **Start with Windows** is optional in the tray or application menu. It is off unless enabled by you.
- The app has its own database and uploads at `%APPDATA%\Studyspace\data`. Open this location through the menu. Updates and uninstall do not intentionally remove this directory.
- Each user gets an empty installation and supplies their own SMTP credentials and YouTube API key. Internet is required for external music, directory searches and email delivery.
- The backend binds only to this computer and accepts requests authenticated by the desktop session. The Docker version remains available for LAN/tablet access.
- Radio/YouTube availability, autoplay, codecs, protected content and device sleep can affect playback. Packaging does not guarantee that every online stream will work.

## Move existing Docker data

Do this only on your own computer. Do not include this backup with an installer shared with someone else.

1. In the Docker app, disable scheduled email and save. This prevents two installations from sending the same reminders.
2. Quit the desktop app through its tray menu. If you have desktop data already, back up its entire data folder first; these steps replace that data, they do not merge databases.
3. In your existing Docker project directory, stop its backend and copy a consistent snapshot:

   ```powershell
   docker compose stop backend
   docker compose cp backend:/data ./studyspace-desktop-backup
   docker compose start backend
   ```

4. Copy the **contents** of that backup into `%APPDATA%\Studyspace\data`. Include `academic.db`, `email.key`, and upload folders such as `music`, `backgrounds`, and `focus-sounds`. The encryption key is necessary to recover saved SMTP and YouTube credentials. Keep database companion files with the snapshot if present.
5. Launch Studyspace, check your courses/uploads/settings, then enable email only in the installation you intend to use. A YouTube key configured solely in Docker `.env` must be entered again in desktop Settings.

Browser-local favorites, colors and timer preferences are separate from SQLite and are not transferred by this procedure. Existing delivery history is retained; a report already attempted today will not be resent automatically.

For future backups, quit through the tray menu and copy the entire desktop `data` folder to a new backup location. Keep both data and `email.key` together.

## Build from source

On a Windows x64 build machine install Python 3.13 and Node.js 22.12 or newer, then run `desktop/build.ps1` from PowerShell. Build dependencies are only needed by the developer. The script bundles the backend with PyInstaller, builds React, and creates an Electron/NSIS installer. Versions are pinned in package-lock.json and the backend lock file. The current output path is `outputs/windows-release` relative to the supplied workspace layout.

No `.env`, database, credentials, user uploads, virtual environment, or demo data is copied into the installer. Packaging uses explicit frontend/backend resource folders. Source code signing can be configured through electron-builder when a publisher certificate is available.

Logs are at `%APPDATA%\Studyspace\desktop.log`. If a port is already occupied, the backend chooses another local port; browser-local display preferences may reset because the origin changes. Coursework stays in the same database.

## Verification

The desktop supports an isolated `--smoke-test` mode with `STUDYSPACE_TEST_DATA` set to a disposable directory. It checks packaged startup, frontend loading, local session and origin protection, course create/delete, music settings and email preview, and exits without sending email. It writes `smoke-result.json` only on success. It never imports your Docker data. Add `--backend-only` for the packaged backend/API checks without creating a browser window; the result explicitly reports `frontendLoaded: false`.

For this build, the frozen backend tests and packaged backend-only smoke test passed. They verified startup, session/origin protection, course CRUD, encrypted settings, email preview, frontend file serving, and graceful shutdown. The desktop renderer/tray checks could not pass in the restricted build environment: Chromium GPU child processes failed and the shell could not create a tray icon. Full desktop UI, live media playback, Windows login startup, and install/uninstall on a clean second PC remain unverified. The installer was built successfully, but treat the first normal Windows launch as a compatibility check. No production Docker data was used or modified.
