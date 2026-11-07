# DeskCharm release QA

Run before every release on the installed build (not `tauri dev`), Windows first. Automated
checks (`npm test`, `cargo test --lib`, CI) cover logic; this list is what only a person can see.
Tick each line; note the build and date at the top of the release PR.

## Install & start
- [ ] Installer runs as the current user without admin; DeskCharm starts and the charm appears.
- [ ] Starting DeskCharm again while it runs opens Settings (no second charm).
- [ ] Settings › General shows the right version; About links (Website → deskcharm.in, What's new, Email support → support@deskcharm.in) open in the browser / mail app.
- [ ] SmartScreen "Windows protected your PC" → More info → Run anyway works; the installer's SHA-256 (`Get-FileHash`) matches the one on the deskcharm-releases page.

## Charm
- [ ] Drag: the grabbed spot stays under the cursor, no twist on grab; fling follows the hand.
- [ ] Quick grab of a moving charm works; clicks next to the charm reach the desktop.
- [ ] Squeeze, bead slide, double-click bell, right-click quick menu.
- [ ] Smooth at 60 Hz and at a high refresh rate (if available).
- [ ] Charm page › Charms: Two shows Charm 1 / Charm 2 tabs; picking under Charm 2 changes only the second charm (preview shows it); One hides it and Two brings the same one back.
- [ ] Right-click › Two charms is ticked when two hang; toggling it adds/removes charm 2 and Settings follows. On with none chosen shows a sibling (Toro → Kuro) or Gold.
- [ ] How it hangs › Second charm: Beside (clinks against the first) vs Opposite corner (other top corner, mirrors Nudge sideways; Left/Right swaps both). Charm 2 size and string length change only it.
- [ ] Two charms: breathing session glows both with one "Breathe in…" cue and ring under the main charm; focus aura behind both; music sway / typing breeze / weather wind move both; both can be dragged and flung.
- [ ] Toro + Kuro: hovering either opens both faces' eyes, which follow the cursor.
- [ ] Applying a theme sets Two; switching to One afterwards makes the theme Custom. An older config with a second charm opens as Two.

## Visitors (Settings › Visitors)
- [ ] Gallery shows every visitor drawn; hovering a card plays its trick; preview stage walks.
- [ ] "Show now" on a card sends that visitor along the top of the taskbar (feet on the taskbar edge,
      taskbar at the bottom; also try it moved to the side or set to auto-hide).
- [ ] Clicking a visitor replays its trick; clicks beside it reach the desktop.
- [ ] Per-visitor: look, size, walk direction, stop point, sounds, speech bubbles, name and greeting
      each change what the next visit does; "Reset" restores only that visitor.
- [ ] Charm trick off: the monkey takes no bead; on: the bead comes back (click him, or 10 s after).
- [ ] Fling the charm hard at a visitor: it yelps and runs off.
- [ ] Quiet hours and "Pause visitors for 1 hour" (right-click menu) stop scheduled visits.
- [ ] Visitors fade with smart hiding (fullscreen video) and never come while it's on.
- [ ] "Visits today" and the Today log count visits.

## Water reminder (Settings › Calm)
- [ ] "Try it now": Vijay walks in, "Vanakkam nanba! 🙏", then "Hey <name>, drink some water? 💧".
- [ ] YES (real mouse click): happy pose, "Verithanam 🔥 n/goal", the count goes up.
- [ ] NO: "When should I come back?" with 15 min / 30 min / 1 hour; the pick snoozes that long
      (no pick in 12 s = 20 min); then the sad pose, "Please drink some water 🥺" and "Rendey rendu…".
- [ ] No answer for 20 s counts as NO; he asks again about 20 min later.
- [ ] The water ring by the hook shows n/goal, pulses on a glass, turns teal at the goal; Insights shows water bars.
- [ ] Your name in Calm appears in the question; empty name reads "Hey, drink some water?".
- [ ] No white fringe around him on a dark and on a light wallpaper.

## v1.4 features
- [ ] Idle: leave the PC alone for 2 minutes; Task Manager shows DeskCharm near 0 % CPU; the charm reacts at once when you move the mouse.
- [ ] Living charm (Classic Blue): eye follows the cursor, blinks, dizzy after a hard fling, sleeps when idle.
- [ ] First-run tips on a fresh config: fling → rest → right-click; × skips; "Show tips" in General brings them back.
- [ ] Ambience: each sound from the quick menu plays and loops smoothly; Mute silences it; it fades when smart hiding.
- [ ] Stretch/posture "Try it now": the yogi demonstrates; clicking him says "Nice! 💪".
- [ ] Focus guard: add notepad.exe, start focus, open Notepad: a visitor says "Back to focus? 🎯" (at most once per 5 min).
- [ ] Calls: with the mic in use (start a voice recorder), no scheduled visitors come; calendar Test shows the next busy block.
- [ ] Shortcuts: record a visitor/water/breathe key in General; each works from any app; a taken key shows a warning.
- [ ] Export settings, change something, Import: settings and custom charms come back.
- [ ] Open log folder opens `%APPDATA%\com.deskcharm.desktop\logs`.
- [ ] Language தமிழ்: Vijay's question, buttons and the charm cues show in Tamil; Settings stays English.

## Comfort & privacy
- [ ] Reduced motion (Windows setting or Privacy page): visitors fade in and out instead of walking.
- [ ] Fullscreen hiding; hiding during calls (if enabled); invisible in screen share / screenshots.
- [ ] Hotkey and tray "Hide/Show".

## Settings
- [ ] Every page opens; changes save ("All changes saved"); per-page "Reset to defaults".
- [ ] Custom charm add, rename, delete.

## Pro & website (deskcharm.in)
- [ ] Settings › General › DeskCharm Pro shows "Lifetime Pro · ₹69 launch / ₹99"; the upsell sheet shows the same; no $ price and no "Restore Store purchase".
- [ ] Buy Pro opens https://deskcharm.in/pricing.html?src=app.
- [ ] Pricing page: empty / bad name, email and phone show messages; phone defaults to India +91; both consent boxes start unticked; Terms and Privacy links work; desktop and phone widths look right.
- [ ] Test purchase (Razorpay test mode): checkout opens prefilled with name, email and phone; the key appears on the page and arrives by email from support@deskcharm.in; the row is in Supabase `purchases` with the right consents and `source`.
- [ ] The key activates in Settings; Remove works.
- [ ] Find my key (email + payment id) shows the same generic message for right and wrong details; the right ones get an email.
- [ ] Privacy policy shows version 2026-11-01; Terms, Refunds and Contact show support@deskcharm.in.
- [ ] Report a problem opens an issue on github.com/tharuneshwar-s/deskcharm-releases.

## Other platforms (beta)
- [ ] macOS and Linux: app starts, charm drags, a visitor walks along the bottom edge.

_Deferred until release files are public:_ real auto-update test (install the previous release →
publish the next one on tharuneshwar-s/deskcharm-releases → update in-app). Needs a build signed with `TAURI_SIGNING_PRIVATE_KEY`.
