# DeskCharm explainer — narration script

Video: `DeskCharm-Explainer.mp4` (1920×1080, 30 fps, H.264 + AAC), 3:14 long, 474 words of narration (Kokoro `af_heart`). Captions: `DeskCharm-Explainer.srt`. Rebuild with `node docs/video/build-video.mjs` (the header of that file lists the raw material it expects).

Timings are positions in the finished video. Each scene starts 0.5 s before its narration and crossfades (0.5 s) into the next.

| # | Start | Voice | On-screen title | Footage |
|---|---|---|---|---|
| 1 | 0:00 | 13.4 s | Meet DeskCharm | `intro` → `intro` |
| 2 | 0:15 | 13.6 s | Install & start | still `install-wizard.png` → `start` → still `tray.png` |
| 3 | 0:30 | 15.7 s | Grab, fling, rest, ring, smash | `play` → `play` → `play` → `play` |
| 4 | 0:47 | 16.8 s | Quick menu · two charms · themes | still `overlay-quick-menu.png` → `two` → still `settings-themes.png` |
| 5 | 1:05 | 12.9 s | Desk visitors | `v-elephant` → `intro` → `v-monkey` → `v-peacock` |
| 6 | 1:20 | 8.9 s | Yogi · chai-wala · myna | `v-yogi` → `v-chai` → `v-bird` |
| 7 | 1:30 | 13.2 s | Vijay, the water buddy | `vijay` → `festival` |
| 8 | 1:45 | 8.0 s | Guided breathing | `breathe` |
| 9 | 1:55 | 10.3 s | Focus timer & tasks | `focus` → still `task-prompt.png` → `focus` |
| 10 | 2:07 | 9.7 s | Water · stretch · mood | `water` → `stretch` → `mood` |
| 11 | 2:18 | 15.0 s | Reminders · ambience · daily ritual | `reminder` + Windows notification → `intro` + rain / ambience caption → `ritual` |
| 12 | 2:35 | 11.7 s | Insights & Settings | `insights` → `settings` |
| 13 | 2:48 | 10.9 s | Tamil · shortcuts · backup | `general` → `tamil` → `general` |
| 14 | 3:00 | 8.9 s | Private by design | `outro` |

## Narration

### 1. Meet DeskCharm — 0:00–0:13

Meet DeskCharm. It is a little charm that hangs from the top of your screen, sways as your mouse passes by, and keeps you company while you work. And now and then, a friendly visitor strolls along your taskbar.

### 2. Install & start — 0:15–0:29

Getting started is easy. Run the installer — no admin rights needed — and DeskCharm starts right away, in the top-right corner. Its tray icon, near the clock, opens Settings, hides the charm, or quits.

### 3. Grab, fling, rest, ring, smash — 0:30–0:46

The charm is made for touching. Grab it and fling it, and it swings on a real string. Rest your cursor on it, and it glows softly, breathing in and out with you. Double-click to ring a bell. Rough day? Click it quickly, again and again, and smash it to calm.

### 4. Quick menu · two charms · themes — 0:47–1:04

Right-click for the quick menu: breathing, focus, your tasks, ambience and more. Hang one charm, or two side by side. Toro and Kuro have living cat faces — click one to poke it. And themes set both charms, a soft glow, and a sound in one click.

### 5. Desk visitors — 1:06–1:19

Every so often, a desk visitor drops by. A baby elephant trumpets and sprays the charm. A cat stretches and settles in. A cheeky monkey steals a bead! And a peacock fans its tail.

### 6. Yogi · chai-wala · myna — 1:20–1:29

The yogi floats in for three slow breaths. The chai-wala rides up with your break. And the myna bird lands to remind you to rest your eyes.

### 7. Vijay, the water buddy — 1:31–1:44

Vijay, your water buddy, offers a tumbler: drink some water? Say yes, and a glass is counted on your water ring. During festivals like Pongal, Holi, Diwali and Christmas, special guests visit too.

### 8. Guided breathing — 1:46–1:54

When you need a pause, start a guided breathing session. The charm glows — in for four seconds, out for six. Just follow it.

### 9. Focus timer & tasks — 1:55–2:06

The focus timer gives you twenty-five minutes of focus, then a short break. It asks what you are working on, and shows your task and time right beside the charm.

### 10. Water · stretch · mood — 2:07–2:17

The water ring fills through the day. The yogi leads a quick stretch. And once a day, a mood check-in asks how you are feeling, with five simple faces.

### 11. Reminders · ambience · daily ritual — 2:18–2:33

Your own reminders arrive as a soft cue beside the charm, a visitor if you like, and a Windows notification. Add gentle ambience — rain, ocean, temple, or chimes — and a daily ritual for your mornings and evenings.

### 12. Insights & Settings — 2:35–2:47

Insights shows your calm minutes, breaks, water and streak, with a look at this week. And Settings lets you shape everything: the charm, play, visitors, calm tools, seasons and privacy.

### 13. Tamil · shortcuts · backup — 2:48–2:59

The charm and visitors can speak English or Tamil. Set shortcuts to send a visitor, count a glass of water, or take a breath, and back up your settings to a single file.

### 14. Private by design — 3:01–3:10

Best of all, it stays on your PC. No account, no analytics, no tracking. DeskCharm — a little calm, hanging on your desktop.

## Sound

Music bed: DeskCharm's own ambience synths (`src/js/ambience.js`, *temple* + *chimes*) rendered offline, about 18 dB under the voice and ducked further while it speaks (sidechain compressor), faded in over 2.5 s and out over 4 s.

## Re-making the footage

Raw material lives outside the repo in `%TEMP%/dcvid` (override with `DC_VIDEO_TMP`); the scripts that make it are in `docs/video/capture/`.

1. **Backdrop.** Put `wallpaper.jpg` (1920×1080 or larger), `icon.png` (the app icon) and `config.json` (a copy of a DeskCharm config, `%APPDATA%/com.deskcharm.desktop/config.json`; the Settings captures read it) in the folder.
2. **Server.** `node docs/video/capture/serve.mjs` serves `src/` on http://localhost:5347 and `/__vid/*` from `capture/` (`init.js`, `settings-host.html`) or the raw folder.
3. **Browser.** Open headless Edge with omp's browser (never the everyday browser): `browser.open({ name: 'vid', url: 'about:blank', app: { path: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args: ['--headless=new', '--user-data-dir=%TEMP%/edge-vid', '--autoplay-policy=no-user-gesture-required'] }, viewport: { width: 1537, height: 864, deviceScaleFactor: 1.875 } })`. `init.js` (injected by `rec.mjs`) paints the wallpaper, a mock taskbar and a visible cursor, and fakes the Tauri API for Settings.
4. **Record.** For each capture name used in the table above: `await tab.run(async ({ page }, name) => (await import('<repo>/docs/video/capture/shots.mjs')).SHOTS[name](page), { args: [name], timeout: 180 })`. Visitor captures are `SHOTS.visitor(page, '<id>')` saved as `v-<id>`. Frames land in `cap/<name>/` (CDP screencast JPEGs at 2882×1620 + `times.json`).
5. **Notification.** `capture/toast-real.png` is a real Windows toast from the installed app: back up the config, quit DeskCharm, start `deskcharm.exe` with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9336`, evaluate `__TAURI_INTERNALS__.invoke('reminder_test', { text: 'Call mum', visitor: '' })` in its page over CDP, screenshot the desktop and crop to the toast only; then restore the config and restart the app normally.
6. **Voice and music.** `vo/sNN.wav`: Kokoro `af_heart` reading each scene's text from `SCENES` in `build-video.mjs`. `music.wav`: the *temple* + *chimes* synths of `src/js/ambience.js` rendered in an OfflineAudioContext (at least as long as the video).
7. **Build.** `node docs/video/build-video.mjs` (ffmpeg/ffprobe via `FFMPEG` / `FFPROBE` or the defaults in its header) writes the MP4, the SRT and this file.
