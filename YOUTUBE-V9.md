# YouTube playback and playlists (version 9)

## What was fixed

The existing search already requested `type=video`, `videoEmbeddable=true`, and `videoSyndicated=true`; these filters are retained and regression-tested. The player previously set the referrer policy only after it became ready, displayed a generic error, and had no queue advancement on video completion. The screenshot alone cannot identify which YouTube error occurred.

The iframe now receives `strict-origin-when-cross-origin`, its current HTTP(S) origin, and playback permissions before navigation. The IFrame API also receives `origin` and `playsinline`. Nginx's frontend location now explicitly retains the referrer header alongside its cache header. There was no Content Security Policy to amend.

Errors 100, 101 and 150 skip to the next candidate. Each unavailable queue entry is tried once; an entirely unavailable queue stops with an explanation. Error 153 reports an identification problem instead of skipping every video. Browser autoplay restrictions show a prompt to press Play. Open on YouTube remains available. Search filters cannot guarantee playback of region-restricted or subsequently removed videos.

## Continuous playback

- In Music → YouTube, select a search result to start from that result and continue through the results.
- Repeat queue is enabled initially; turn it off to stop at the end.
- Paste individual video links and use Add to queue, or paste a playlist link and select Import & play all. Playlist import fetches successive pages, up to 5,000 entries.
- Next advances manually. Play / retry retries the current video. The draggable compact player, size toggle, hide/show, positioning, and Open on YouTube link remain available. Track changes reuse the same player.
- A pasted single video is a one-item queue and repeats until you add more videos or turn repetition off. This is queue playback, not YouTube's personalized recommendation feed. Queues are not saved across page reloads.

## Connect your YouTube account (web/Docker)

An API key enables public search and public playlist import. Account playlists additionally require an OAuth client:

1. In Google Cloud, enable YouTube Data API v3 and configure the OAuth consent screen. Add your account as a test user if the app is in Testing.
2. Create a **Web application** OAuth client. Register the exact callback displayed in Settings, for example `http://localhost:8080/api/youtube/account/callback`. Use that same origin to open Studyspace; localhost and 127.0.0.1 are different origins. Non-localhost callbacks require HTTPS.
3. In Settings → YouTube account & playlists, save the client ID, client secret, and matching redirect URI.
4. Choose Connect YouTube, then Continue to Google sign-in. Complete sign-in in the same browser so the one-time verification cookie is present on return.
5. Return to Studyspace, refresh the connection, and open Music → My playlists. Select a playlist to import and play its videos. More playlists loads another page of your library.

Only read-only YouTube scope is requested. Client secrets and tokens are encrypted in the new `youtube_account` table using the existing `/data/email.key`; back up the entire data volume including that key. Callback state, a browser cookie, PKCE and expiry protect the connection flow. Authorization codes are omitted from callback access logs. The callback page alone uses `no-referrer` to protect the code; this does not apply to the embedded player. Disconnect clears local tokens and attempts Google revocation.

Connecting grants playlist API access; it does not log the embedded iframe into your Google account, enable Premium benefits, or bypass video restrictions. The API may not expose every special YouTube library. This OAuth flow is for the web/Docker app. The existing Windows installer has not been rebuilt; its system-browser sign-in flow belongs in the next desktop update.

The API key stays on the backend. Restrict it to YouTube Data API v3; HTTP-referrer website restrictions are unsuitable for these backend requests. Where practical use an appropriate server-IP restriction. Your Google Cloud restrictions cannot be verified from the app.

## Verification and installation

36 backend tests and 32 frontend tests passed, plus TypeScript checking and the production build. Tests cover the search filters, error skipping, ended-event advancement, retaining the hidden iframe, playlist pagination, OAuth state/cookie expiry, encrypted secrets, refresh and revocation. Google OAuth exchanges in tests are mocked; an actual account connection still requires your credentials and consent.

Live search returned video results using the existing local backend. The updated frontend played a result and advanced to the second in the same compact player. Automated tests verify the remaining error paths; external playback can still vary by video, browser and network.

See [UPGRADE.md](UPGRADE.md) for backup and Docker rebuild instructions. This package does not alter your running Docker installation automatically. The schema now contains 13 application tables; startup adds the account table without replacing existing data.

References: [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference), [Google web OAuth](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps), [playlist items API](https://developers.google.com/youtube/v3/docs/playlistItems/list).
