# Update your existing Docker installation

This update adds recurring meetings, interface themes, and scheduled email reminders, alongside the daily planner and Courses gallery. Existing coursework remains in the same SQLite database. Startup creates missing tables without replacing your courses or tasks.

1. In your existing project directory, back up your database:

   ```sh
   docker compose exec backend python -c "import sqlite3; s=sqlite3.connect('/data/academic.db'); d=sqlite3.connect('/data/academic-backup.db'); s.backup(d); d.close(); s.close()"
   docker compose cp backend:/data/academic-backup.db ./academic-backup.db
   ```

2. Extract `academic-dashboard-v3.zip`. Copy the contents of its `academic-dashboard` folder into your existing project folder, replacing source files. Keep your existing `.env`, backups, and any customized Compose project/volume settings. The default Compose project name remains `studyspace` and the volume remains `academic-data`.

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

Choose separate daily-report and unfinished-work times, an IANA time zone (for example `Asia/Dubai`), the upcoming coursework window, and whether unfinished to-dos from previous days should be included. Daily reports include today's plan and unfinished coursework in the selected window, including overdue assignments. Unfinished reminders omit completed to-dos and are skipped when no unfinished to-do or coursework remains in scope. Future daily-plan items are not included before their plan day.

The backend checks every 30 seconds. Keep Docker, your computer, and internet access running. The browser may be closed. A missed time is caught up later on the same local day; previous days are not replayed. There is at most one attempt per report type per local day, persisted across restarts. Changing a send time after that day's attempt does not trigger another attempt. Failed or interrupted sends are not retried automatically because SMTP acceptance can be ambiguous; inspect Recent deliveries and use the test button after correcting settings. A `sent` status means the SMTP server accepted the message, not a guarantee of inbox delivery.

SMTP uses certificate-verified STARTTLS or SSL/TLS. Passwords are encrypted in SQLite with a key at `/data/email.key`. Back up the whole data directory, including that key, to retain credentials. Anyone with both the database and key can decrypt the password; this remains a trusted, local single-user app. The password is never returned by settings APIs. Leave the password field blank to keep it, or select Remove saved password. If the key is lost, enter and save the password again. OAuth-only email providers require an SMTP relay or an app-password-enabled account; OAuth login is not included.

Run one backend worker, as configured in the supplied Dockerfile. Disable scheduled email before running a restored backup alongside the original installation to avoid duplicate reports from separate copies.

### Design references

The implementation adapts useful patterns from [Google Calendar recurrence](https://support.google.com/calendar/answer/37115), [Google Calendar time zones](https://support.google.com/calendar/answer/37064), [Slack themes](https://slack.com/help/articles/205166337-Change-your-Slack-theme), [Slack compact display](https://slack.com/help/articles/213893898-Change-how-messages-are-displayed), [Notion appearance preferences](https://www.notion.com/en-gb/help/account-settings), and [Todoist notification settings](https://www.todoist.com/help/todoist/features/manage-your-notifications-in-todoist-QxQGXkMu).
