# Update your existing Docker installation

Version 7 removes the app-imposed pause on browser-tab changes and adds hide/show controls without destroying the player. Existing API keys, email settings and coursework are preserved. Existing coursework remains in the same SQLite database. Startup creates missing tables without replacing your courses or tasks.

1. In your existing project directory, back up your database:

   ```sh
   docker compose exec backend python -c "import sqlite3; s=sqlite3.connect('/data/academic.db'); d=sqlite3.connect('/data/academic-backup.db'); s.backup(d); d.close(); s.close()"
   docker compose cp backend:/data/academic-backup.db ./academic-backup.db
   ```

2. Extract `academic-dashboard-v8.zip`. Copy the contents of its `academic-dashboard` folder into your existing project folder, replacing source files. Keep your existing `.env`, backups, and any customized Compose project/volume settings. The default Compose project name remains `studyspace` and the volume remains `academic-data`.

3. From that same project folder, rebuild:

   ```sh
   docker compose up --build -d
   docker compose ps
   ```

4. Refresh your browser at http://localhost:8080 (or your configured address). Use a hard refresh if the old navigation remains visible.

Do not run `docker compose down -v`: it deletes the data volume. There is no need to seed example data or initialize a new database.

## Using the new features

- **To-do list:** opens today unless you previously selected a date that is still in the future. Choose Today, Tomorrow, or another future date. Past dates cannot be selected. Older plans remain stored; unfinished items are not silently moved to a new day.
- **Progress:** tick an item to complete it, or choose 0%, 25%, 50%, 75%, or 100%. The day's progress averages all items. Edit an item to rename or move it to another allowed date.
- **Suggestions:** unfinished coursework due from now until strictly less than seven days ahead, excluding deadlines before your selected plan date. Add a suggestion to make an independent reminder. Checking the reminder does not complete the course assignment. The original task remains accessible from the reminder.
- **Courses:** a dedicated card gallery replaces the scrolling sidebar course list. Add courses here and select a card to open its syllabus and assignments.
- **Appearance:** choose Original, Aurora, Midnight, or Study grid; upload JPG, PNG, WebP, GIF, MP4, or WebM files (up to 25 MB each). Video playback depends on browser codec support. Adjust dimming and movement; system reduced-motion preferences are respected.

Plans and uploaded backgrounds are stored in the Docker volume. Background selection, movement, dimming, theme, and the chosen planner date are specific to each browser. Uploads are shared across devices; removing an upload removes it for everyone using this local app.

For a complete backup after uploading backgrounds, stop the backend temporarily and copy the entire data directory, including the database and media:

```sh
docker compose stop backend
docker compose cp backend:/data ./studyspace-data-backup
docker compose start backend
```

Use a fresh backup destination each time. Preserve all files together when restoring.


## New in version 3

- **Meetings:** title, first date/time, duration, IANA time zone, place, video link, notes and calendar color. Repeat daily, weekly, fortnightly (every 2 weeks), monthly, or once. Choose an interval, an occurrence count, an inclusive final date, or no end. Calendar shows meetings alongside coursework; select a meeting to edit the series. Edits and deletion affect the entire series. This version does not send invitations or manage attendee responses.
- **Recurrence:** local wall time stays consistent across daylight-saving changes. Nonexistent times and missing month dates (such as February 31) are skipped; ambiguous clock-change times use the first occurrence. Counts include the first valid meeting. Meetings continuing past midnight appear on both days. Calendar displays times in the viewing device’s zone.
- **Interface themes:** open Appearance for Violet, Ocean, Forest, Rose or Amber, dark/light/device mode, soft/crisp/glass panels, comfortable/compact spacing, and larger text. Preferences apply immediately and persist per browser. Background selection remains separate.
- **Email reminders:** configure SMTP host, port, encryption, username, app password, sender and recipient. Save settings, preview a report, and use Send test email. Then enable scheduled delivery and save again. No external mail service is bundled; use an SMTP provider you already have.

### Email scheduling and credentials

Choose separate daily-report and unfinished-work times, an IANA time zone (for example `Asia/Dubai`), the upcoming coursework window, and the upcoming coursework window. Daily reports include today and yesterday's unfinished to-dos and unfinished coursework in the selected window, including overdue assignments. Unfinished reminders omit completed to-dos and are skipped when no unfinished to-do or coursework remains in scope. Future daily-plan items are not included before their plan day.

The backend checks every 30 seconds. Keep Docker, your computer, and internet access running. The browser may be closed. A missed time is caught up later on the same local day; previous days are not replayed. There is at most one attempt per report type per local day, persisted across restarts. Changing a send time after that day's attempt does not trigger another attempt. Failed or interrupted sends are not retried automatically because SMTP acceptance can be ambiguous; inspect Recent deliveries and use the test button after correcting settings. A `sent` status means the SMTP server accepted the message, not a guarantee of inbox delivery.

SMTP uses certificate-verified STARTTLS or SSL/TLS. Passwords are encrypted in SQLite with a key at `/data/email.key`. Back up the whole data directory, including that key, to retain credentials. Anyone with both the database and key can decrypt the password; this remains a trusted, local single-user app. The password is never returned by settings APIs. Leave the password field blank to keep it, or select Remove saved password. If the key is lost, enter and save the password again. OAuth-only email providers require an SMTP relay or an app-password-enabled account; OAuth login is not included.

Run one backend worker, as configured in the supplied Dockerfile. Disable scheduled email before running a restored backup alongside the original installation to avoid duplicate reports from separate copies.

### Design references

The implementation adapts useful patterns from [Google Calendar recurrence](https://support.google.com/calendar/answer/37115), [Google Calendar time zones](https://support.google.com/calendar/answer/37064), [Slack themes](https://slack.com/help/articles/205166337-Change-your-Slack-theme), [Slack compact display](https://slack.com/help/articles/213893898-Change-how-messages-are-displayed), [Notion appearance preferences](https://www.notion.com/en-gb/help/account-settings), and [Todoist notification settings](https://www.todoist.com/help/todoist/features/manage-your-notifications-in-todoist-QxQGXkMu).


## Version 4: clearer email reports and Music (date filtering updated in version 5)

### Email changes

Both daily reports and unfinished-work reminders now include **unfinished to-dos planned for today and yesterday**, using the configured email time zone. Earlier plans, future plans and completed to-dos are excluded. The legacy previous-days toggle is removed and ignored even if it was enabled before upgrading. Existing SMTP settings and encrypted passwords are preserved.

Reports have readable HTML tables with Task, Status and Deadline columns, a plain-text fallback, and attached PNG copies. Long reports are split into image pages rather than shrinking the font. All three versions use the same data. The setup screen previews the formatted HTML. Send test email now sends a sample report using your current data, marked TEST.

For reminders linked to coursework, Deadline is the linked assignment's due time. Personal to-dos have no deadline field in this version and are clearly labeled **No deadline**. Upcoming and overdue coursework remains in its own table and continues to use your configured upcoming-days window. Today's to-do completion is independent from assignment completion.

### Music

Open **Music** in the sidebar. Upload MP3, WAV, Ogg, FLAC, M4A or WebM audio (up to 100 MB per file), search your uploaded songs, and click a song to play. The bottom player stays mounted when you navigate to other sections. It offers pause/resume, seeking, previous/next, shuffle, single-track repeat and volume controls. Playback starts only after a click and does not resume automatically after reloading or closing the app. Browser audio codec support varies; unsupported files show an error.

**Online radio** searches the public Radio Browser directory by station name and genre. It is live radio, not an on-demand commercial song catalogue. Pick a genre or search and choose a station; no API key is required. Directory and stream availability depend on external services. The backend queries only the directory; your browser connects directly to the selected station. Only HTTPS stream URLs are offered. No coursework is sent to the directory. Uploaded songs continue to work without internet access.

Favorites and volume are browser-local. Uploaded files and their metadata persist in the existing Docker volume at `/data/music` and in SQLite. Include that folder when backing up `/data`. Removing an uploaded song deletes it from the shared library. Use audio files you are permitted to store and play.

The image renderer adds Pillow and DejaVu fonts to the Docker image; rebuild both services. The database gains one new music table without replacing coursework. Nginx accepts uploads up to 101 MB; the audio API enforces its own 100 MB limit and the background API retains its 25 MB limit.

Reference: [Radio Browser API](https://docs.radio-browser.info/).


## New in version 5

### Meeting emails and two-day reports

In **Email reminders**, enable **Meeting reminders** along with scheduled delivery. Your existing SMTP settings are reused. Each meeting occurrence, including recurring meetings, gets one attempt approximately one hour before its start. The email includes title, local start time and time zone, duration, location, meeting link and notes. The scheduler checks every 30 seconds. If the app starts during that final hour, it sends a catch-up reminder with the actual minutes remaining; meetings already started are excluded. Keep Docker and the computer running. Delivery history records each attempt; failed or interrupted sends are not automatically retried to avoid duplicates after ambiguous SMTP acceptance.

Daily reports and unfinished reminders include unfinished to-dos from **today and yesterday only**, in separate labeled tables. The email time zone defines those dates. Each row includes status/progress and the linked assignment deadline, if any. Personal to-dos show No deadline. Coursework keeps its separately configured upcoming/overdue window. These rules replace version 4's today-only filter.

### Focus completion sounds

Expand the focus timer, then **Finish sound**. Choose Gentle chime, Bell, Beeps or Silent, adjust volume, and use Test sound. Upload an audio file up to 10 MB for your own alert. Custom alerts play up to eight seconds; Stop sound stops a preview. Supported formats match the local music player and depend on browser codecs. Files persist in `/data/focus-sounds`; selection and volume persist per browser. The alert plays once when focus or break time naturally expires; finishing early does not sound it.

Start/Resume or Test sound unlocks browser audio. Keep the app open and the computer awake; muted tabs, OS sleep and browser background throttling can prevent or delay alerts. This is a browser timer, not an operating-system alarm.

### More music and YouTube

Online radio starts with **All genres**, with pop, rock, hip-hop, R&B, electronic, dance, Arabic, African, reggae and other filters. In **Music → YouTube**, paste a video link to open the visible mini-player without an API key. It stays available as you navigate within Studyspace; playing YouTube pauses radio/local audio, and vice versa. Video embedding availability depends on the uploader.

To enable in-app search:

1. Create a Google Cloud project and enable **YouTube Data API v3** following the [official setup guide](https://developers.google.com/youtube/v3/getting-started).
2. Create an API key, restrict it to YouTube Data API v3, and add `YOUTUBE_API_KEY=your-key` to your existing `.env` (do not replace your other settings). The backend keeps the key out of frontend responses.
3. Run `docker compose up --build -d`. Search by song, artist or study genre in Music → YouTube. API quotas apply; pasting links remains available without search.

The original version 5 integration uses the official [search API](https://developers.google.com/youtube/v3/docs/search/list) and embedded player. In accordance with [YouTube player policies](https://developers.google.com/youtube/terms/developer-policies), the video remains visible and playback pauses when the browser tab is hidden. YouTube audio-only or hidden background playback is not supported. Local uploads and radio retain their normal background playback. YouTube receives your search query and browser/player requests; coursework is not sent.

### Custom interface colors

Open **Appearance** and choose accent and surface-tint colors, then **Use my custom colors**. They work with dark/light mode and existing panel styles, separately from backgrounds. Accent contrast adjusts for readability. Preset palettes and Reset remain available. Preferences are saved per browser.

Version 5 adds the `focus_sounds` table (11 tables total) without replacing existing data. Include `/data/focus-sounds` in full-volume backups. Verification: 30 backend tests and 18 frontend tests pass, plus a production frontend build. SMTP tests use mocks and do not send real mail. Live YouTube search requires your API key; audible playback and external stream availability cannot be guaranteed by these tests.


## Version 6: movable player and Settings (playback behavior updated in version 7)

- **Settings → YouTube & music:** save or replace your YouTube Data API v3 key directly in the app. Choose 6, 12, 18 or 25 results and a search-filter level. No Docker restart is needed after saving. Enable YouTube Data API v3 in Google Cloud for your key. Saving stores the key; a search checks whether it is valid and has available quota.
- API keys are encrypted in the `music_settings` table using the existing `/data/email.key`. Blank input preserves a saved key; Remove saved key removes it. A saved key takes precedence over `YOUTUBE_API_KEY` in Docker. After removal, an environment key becomes active again. Keys are never returned to the frontend. Back up the entire `/data` directory, including the encryption key. This remains a trusted local app without account authentication.
- The **mini-player now appears above navigation**. Drag the four-arrow handle with a mouse or touch, or focus it and use arrow keys. Compact/Larger toggles video size; Reset position returns it to the upper-right. Position and size persist in this browser. Resizing the browser brings an off-screen player back into reach.
- The visible player remains mounted while navigating to To-do, Courses, Settings or other sections. It pauses when the browser tab is hidden. YouTube-to-audio conversion and hidden YouTube playback are not included because the official API's policies prohibit these features. Use uploaded music or online radio for background audio. See [YouTube developer policies](https://developers.google.com/youtube/terms/developer-policies).
- Settings also links to Appearance and email configuration. Existing email configuration and behavior are unchanged.

The database now has 12 tables. Verification: 31 backend tests and 21 frontend tests passed; the production build passed. Browser checks confirmed the Settings controls, drag movement, size toggle and mini-player persistence when navigating. Live YouTube playback could not be verified because the external embedded player did not finish loading in the test browser; no real API key or email was used in tests.


## New in version 7: hide/show and tab switching

This section supersedes the tab-visibility behavior described in versions 5 and 6 above. Studyspace no longer calls pause when you switch browser tabs, and does not pause a playing video because the document is hidden.

Click the **eye-off icon** in the mini-player header to hide the video without stopping it. A small **Show player** control remains, with Pause and Stop buttons. Show player restores the existing embedded player, preserving its playback position. The X button explicitly stops and closes it. Starting local music or radio still pauses YouTube to prevent overlapping audio. Selecting another video opens its player again.

Keep Studyspace open. This removes the app's forced pause; it cannot guarantee background playback if YouTube, the browser, mobile power management or OS sleep suspends it. No audio extraction, conversion or download is included. Hidden/background use is outside YouTube's documented API player policies; this update should not be represented as a compliant public YouTube API client.

Update using the backup and rebuild steps above. The saved API key stays in your existing Docker volume; no new key setup or database migration is required. Verification: production build and 21 frontend tests passed. Browser checks verified that hiding leaves the embedded player mounted and Show player restores it. External YouTube playback did not finish loading in the test browser, so uninterrupted audible playback across tabs was not verified. No changes were made to email logic.


## New in version 8: Ethiopian radio

In **Music**, click **🇪🇹 Ethiopian radio**. This opens Online radio, selects Ethiopia, and clears the previous station name and genre so you see the widest selection. The Radio country dropdown lets you switch between Ethiopia and Worldwide. Search by station name or filter by genre; favorites and background audio use the existing player.

Ethiopia requests the directory's full country listing (rather than the worldwide top 30), using the standardized `ET` country code. This is a live directory, not a hardcoded station list. Only secure public stream URLs pass the existing checks. Offline stations, unsupported streams, broadcasters missing from the directory, and diaspora stations listed under another country may not appear. No API key is needed. Source: [Radio Browser API](https://docs.radio-browser.info/).

Existing data, favorites, email settings and YouTube keys are preserved. Rebuild both services using the upgrade steps above. The two radio API tests passed, covering the country filter, more than 30 results, genre/name filters, worldwide selection and unsafe URLs. The production frontend build passed. Live directory verification returned an unavailable error in the development environment; individual station availability and audible playback were not verified.
