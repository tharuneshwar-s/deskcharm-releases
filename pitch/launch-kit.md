# DeskCharm launch kit

Copy for launch day and the two weeks around it. DeskCharm 1.8.0 · Windows 10 & 11 · free · private by design.
Website: https://deskcharm.in · Downloads: https://github.com/tharuneshwar-s/deskcharm-releases/releases/latest · Contact: support@deskcharm.in

Ground rules for all copy:
- Honest: no download numbers, ratings or user quotes until we have real ones. Pro is sold on deskcharm.in in ₹ only (₹69 launch / ₹99); cards from outside India are coming soon. No Microsoft Store yet.
- Lead with charm and culture; let wellness and privacy close the deal.
- Windows-first. macOS/Linux builds are **untested**; don't promise them.
- Assets: `docs/video/DeskCharm-Explainer.mp4` (3:14) + `poster.jpg`, `docs/guide/img/*.png`, `docs/guide/DeskCharm-Guide.pdf`, charm art in `src/*.png`.

---

## 1. Product Hunt

**Name:** DeskCharm

**Tagline (54 chars):** A nazar charm and calm nudges for your Windows desktop

Backup taglines:
- A lucky charm on your screen that helps you take breaks (56)
- Festival visitors, breathing and water nudges for Windows (56)

**Topics:** Productivity · Health & Fitness · Windows · Design Tools

**Description (≈260 chars):**
> DeskCharm hangs an evil-eye nazar at the top of your screen. Grab it, fling it, breathe with it. Little visitors walk across your taskbar to remind you to drink water, stretch and rest your eyes — with Diwali, Holi, Pongal and Christmas visits. Free, no account, everything stays on your PC.

**First comment (maker):**
> Hi Product Hunt 👋 We're Tharuneshwar and Saransakthi.
>
> In a lot of Indian homes and shops there's a nazar or a lemon-and-chilli hanging by the door. It's there to protect you — and it's also just *nice to look at*. We wanted that small, familiar thing on our desktops, where we spend most of the day.
>
> So DeskCharm started as a charm that sways at the top of the screen. Then it grew a job: it glows to help you breathe, and small visitors — a cat, a baby elephant, a yogi, and Vijay the water buddy with his steel tumbler — walk by to remind you to drink water, stand up and rest your eyes. On festival days you'll see a Pongal pot boil over or a Diwali diya being lit. The charm and visitors can speak Tamil too.
>
> A few things we care about:
> - **Private by design.** No account, no analytics. Settings and insights are files on your PC. It goes online only to check for updates (and for weather or calendar, only if you turn them on).
> - **Out of the way.** Clicks pass through. It hides during fullscreen apps, calls and screen shares.
> - **Free.** The charm, all visitors and every calm tool are free. DeskCharm Pro is a one-time lifetime licence (₹69 launch / ₹99, on deskcharm.in) with more charm packs, two charms and full Insights. Every install gets a 7-day Pro trial. No subscription.
>
> Honest status: Windows 10/11, version 1.8.0, six releases in the last month. The installer isn't code-signed yet, so SmartScreen will warn you (More info → Run anyway). We'd love to hear what helps your day — and which festival or charm we should add next.

**Gallery captions (5):**
1. *A little nazar for your desktop.* — The charm hanging from the top of a real desktop (video poster / `overlay-charm.png`).
2. *Grab it, fling it, squeeze it, slide its beads.* — `charm-fling.png` / `charm-bead.png`.
3. *Visitors who care about you.* — Vijay the water buddy and the stretch-reminder cat (`overlay-visitor-vijay.png`, `overlay-reminder.png`).
4. *Breathe, check in, rest your eyes.* — Guided breathing and mood check-in (`overlay-breathing.png`, `overlay-mood.png`).
5. *Your calm adds up — on your PC only.* — Insights this week vs last week (`settings-insights.png`) with a "No account · No tracking" label.

---

## 2. Reddit

General rules: read each subreddit's rules and self-promotion policy first; post from a personal account with normal history; reply to every comment; no vote asking; one subreddit per day; if a sub needs mod approval for self-promo, message mods first. Lead with the story or the question, put the link in a comment if the sub prefers that.

### r/Windows (or r/Windows11)
Check: some Windows subs only allow app posts on specific days or in a megathread — use that if so.

**Title:** I made a small desktop charm for Windows that sways at the top of the screen and nudges you to take breaks

**Body:**
> I wanted something on my desktop that's calm to look at and doesn't get in the way, so I built DeskCharm (Tauri + Rust, ~free and no account).
>
> What it does on Windows:
> - A charm (evil-eye nazar by default) hangs from the top of the screen in a click-through transparent window. You can grab and fling it.
> - It hides itself during fullscreen apps, calls and presentations, and it's excluded from screen sharing and recordings.
> - Optional reminders: breaks, 20-20-20 eye rest, water, stretch — delivered by little characters walking along the taskbar.
> - Everything is stored locally; it only goes online for update checks (and weather/calendar if you opt in).
>
> Known rough edge: the installer isn't code-signed yet, so SmartScreen warns. I'd really like feedback on performance on your machines and anything that feels un-Windows-like. Link in comments if allowed.

### r/productivity
Check: many productivity subs ban direct self-promotion; frame it as a method + ask, offer the link only if mods allow / someone asks.

**Title:** Gentle reminders worked better for me than strict timers — here's what I changed

**Body:**
> Hard pop-ups and red notifications made me dismiss break reminders on reflex. What worked better was making the reminder *pleasant*:
> 1. Something calm always visible (I use a small charm at the top of my screen; resting the cursor on it starts a slow breathing glow).
> 2. Reminders that ask instead of interrupt — "Stand up and stretch?" with Done / Later.
> 3. Seeing a weekly count of breaks, water and calm minutes, not a score.
>
> I ended up building this into a small free Windows app with a friend (DeskCharm), but the ideas work with anything. What's the softest reminder system that actually stuck for you?

### r/india / r/Chennai / r/TamilNadu (culture angle)
Check: r/india and city subs often have flair rules and self-promo limits (sometimes a weekly thread). Use the correct flair (e.g. "Non-Political", "Technology" or "Ask/Show") or post in the allowed thread.

**Title:** We put a nazar on the Windows desktop — with Pongal, Diwali and Holi visitors (and it speaks Tamil)

**Body:**
> Two of us have been building a small desktop app as a side project. It started with one idea: the nazar / nimbu-mirchi that hangs in every shop, but on your laptop screen.
>
> Now on festival days a visitor walks across the taskbar — a Pongal pot boils over ("Pongalo Pongal!"), a kid lights a diya for Diwali, colour for Holi. There's Vijay the water buddy with a steel tumbler reminding you to drink water, a monkey that steals a bead off the charm, and a yogi for breathing. The charm and visitors can speak தமிழ்.
>
> It's free and nothing leaves your PC. We'd love ideas: which festivals and charms should we add next? (Onam? Ugadi? Kolam?) Link in comments if mods allow.

### r/IndieDev (also r/tauri, r/rust for the tech story)
Self-promo is welcome in r/IndieDev; still tell the story.

**Title:** Six releases in a month: my desktop-charm app built with Tauri + Rust (what I learned)

**Body:**
> DeskCharm is a transparent, click-through overlay that hangs a physics charm on your desktop, plus little sprite "visitors" and calm tools (breathing, breaks, water, mood, insights).
>
> Some things that were harder than expected:
> - Click-through everywhere except the charm (hit-testing a transparent window per frame).
> - Hiding during fullscreen apps and excluding the window from screen capture on Windows.
> - Rope physics that feels nice at 60 fps without eating CPU.
> - Keeping it fully local: no analytics, settings as files, only opt-in network.
>
> 110 JS + 58 Rust tests, a guide and a 3-min explainer. Next: code signing (and later a Microsoft Store listing). Happy to answer questions about Tauri overlays — and I'd love feedback on the onboarding.

---

## 3. Microsoft Store listing (later)

_Not now: there is no Store account yet. Keep this copy for when the Store listing happens; until then, sell only on deskcharm.in._

**App name:** DeskCharm

**Short description (≤100 chars, used in search tiles):**
> A calming nazar charm for your desktop, with gentle break, water and breathing reminders.

**Description (long):**
> DeskCharm hangs a small charm at the top of your screen — an evil-eye nazar, Ganesha, Om or a temple bell. It sways as you move past. Grab it when you're tense, fling it, squeeze it, slide its beads. Rest your cursor on it and it glows in a slow breathing rhythm.
>
> Now and then a desk visitor walks along your taskbar: a cat, a baby elephant, a peacock, a yogi, a monkey who steals a bead, and Vijay, the water buddy. They can bring your reminders — "Stand up and stretch?" — with Done and Later. On Diwali, Holi, Pongal and Christmas, festival visitors drop by.
>
> Calm tools for the whole day:
> • Guided breathing (1, 3 or 5 minutes)
> • Focus timer with tasks
> • Break reminders and 20-20-20 eye rest
> • Water reminder with a daily ring
> • Stretch and posture nudges
> • Daily mood check-in and daily ritual
> • Ambient sounds and your own reminders
> • Insights: calm minutes, breaks, water, mood and streak
>
> Out of your way: clicks pass straight through, and the charm hides during fullscreen apps, calls and screen shares. Ctrl+Shift+D hides it any time.
>
> Private by design: no account, no ads, no analytics. Your settings and insights are files on your PC. DeskCharm goes online only to check for updates, and for live weather or calendar quiet if you turn them on.
>
> The charm and visitors speak English or Tamil.

**Features list (Store "Product features", ≤20):**
1. A swaying charm you can grab, fling and squeeze
2. Breathing glow when you rest your cursor on the charm
3. Desk visitors who walk along your taskbar
4. Festival visitors for Diwali, Holi, Pongal and Christmas
5. Guided breathing sessions
6. Focus timer with tasks
7. Break and 20-20-20 eye-rest reminders
8. Water reminder with a daily ring
9. Stretch and posture nudges
10. Daily mood check-in
11. Your own reminders, asked by a visitor
12. Insights: calm minutes, breaks, water, mood and streak
13. Nazar, Indian gods and your own PNG charms
14. Seasonal and day/night moods
15. Hides during fullscreen apps, calls and screen shares
16. Click-through: never blocks your work
17. English and Tamil speech bubbles
18. No account, no ads, no analytics

**Search keywords (Store allows up to 7 terms):** desktop charm · break reminder · water reminder · breathing · evil eye nazar · desktop pet · wellness

**What's new in this version (1.6.0):**
> • Mood check-in: once a day the charm asks "How are you feeling?" — on a rough day it offers a minute of breathing and a visitor comes to cheer you up.
> • Themes: ten one-click looks, including Temple morning, Diwali glow and Pongal.
> • 16 new Friends charms, from Baby Ganesha and Temple Cow to Tamil cinema minis.
> • One or two charms, hanging side by side or from opposite corners.
> • Redrawn cat, elephant, peacock, monkey and myna visitors.

(Matches the 1.6.0 entry in `docs/changelog.html`; update both together.)

**Category:** Productivity (secondary: Health & fitness) · **Age rating:** 3+ · **Privacy policy URL:** https://deskcharm.in/legal/privacy.html

---

## 4. Social captions

### Instagram — English
**Post 1 (reel: charm fling + Vijay):**
> Every shop has a nazar by the door. Now your desktop does too. 🧿
> Grab it, fling it, breathe with it — and when it's time for water, Vijay walks by with his tumbler. 💧
> Free for Windows · no account · stays on your PC.
> Link in bio.
> #DeskCharm #nazar #evileye #desksetup #wellness #madeinindia #windows11

**Post 2 (festival carousel):**
> Pongalo Pongal! 🍚 On festival days, a visitor walks across your taskbar — a Pongal pot, a Diwali diya, colours for Holi, a reindeer at Christmas. Which festival should we add next? 👇
> #DeskCharm #Pongal #Diwali #Holi #festivevibes

**Post 3 (calm tools):**
> Small nudges, not alarms. Breathe for a minute, stand up, rest your eyes, drink water. Your week adds up in Insights — and never leaves your PC. 🌿
> #DeskCharm #selfcare #workfromhome #breaks

### Instagram — Tamil
**Post 1:**
> ஒவ்வொரு கடையிலும் வாசலில் ஒரு திருஷ்டி கண் இருக்கும். இப்போது உங்கள் கணினித் திரையிலும்! 🧿
> பிடிங்க, வீசுங்க, அதோடு மூச்சு விடுங்க — தண்ணீர் குடிக்கும் நேரம் வந்தால், விஜய் டம்ளரோடு நடந்து வருவார். 💧
> Windows-க்கு இலவசம் · கணக்கு தேவையில்லை · எல்லாம் உங்கள் கணினியிலேயே.
> லிங்க் bio-வில்.
> #DeskCharm #திருஷ்டி #தமிழ் #desksetup

**Post 2:**
> பொங்கலோ பொங்கல்! 🍚 பண்டிகை நாட்களில் உங்கள் taskbar-ல் ஒரு விருந்தாளி நடந்து போவார் — பொங்கல் பானை, தீபாவளி விளக்கு, ஹோலி வண்ணங்கள். அடுத்து எந்த பண்டிகை வேண்டும்? சொல்லுங்க 👇
> #DeskCharm #பொங்கல் #தீபாவளி

**Post 3:**
> அலாரம் இல்லை, அன்பான நினைவூட்டல் மட்டும். ஒரு நிமிடம் மூச்சு, கொஞ்சம் நீட்டி நில்லுங்க, கண்களுக்கு ஓய்வு, தண்ணீர். உங்கள் வாரக் கணக்கு உங்கள் கணினியை விட்டு வெளியே போகாது. 🌿
> #DeskCharm #நலம்

(Have a native speaker proof-read before posting.)

### X (Twitter)
1. > We put a nazar on the Windows desktop. 🧿 It sways, you can fling it, and it glows when you breathe. Free, no account, everything stays on your PC. [link]
2. > Our water reminder is a man in a veshti with a steel tumbler. That's it. That's the tweet. 💧 [video]
3. > On Pongal, a pot boils over on your taskbar. On Diwali, a kid lights a diya. Desktop apps can have festivals too. [link]
4. > Building in public: 6 releases in a month, 110 JS + 58 Rust tests, a guide and a 3-min explainer. Next: code signing. #buildinpublic #tauri #rustlang

### LinkedIn
> **We built a calmer desktop — starting with something every Indian home already has.**
>
> A nazar by the door. A lemon and chillies at the shop. Small things that make a space feel looked after.
>
> DeskCharm brings that to the Windows desktop: a charm that sways at the top of your screen, and friendly visitors that remind you to drink water, stretch, rest your eyes and breathe — with visits on Diwali, Holi, Pongal and Christmas.
>
> What we care about:
> • Private by design — no account, no analytics; data stays on the PC.
> • Out of the way — click-through, hides in meetings, fullscreen and screen shares.
> • Gentle — nudges you can say "Later" to, and a weekly view of breaks, water and mood.
>
> Status: version 1.8.0 for Windows, six releases in one month. We're opening a beta and looking for **3–5 companies for a free 30-day pilot** to see if gentle nudges help teams take real breaks.
>
> If your team might want to try it, or you can help us with incubation and code-signing, message us. — Tharuneshwar S & Saransakthi N
> #wellbeing #productivity #startupindia #madeinindia

---

## 5. Beta sign-up blurb

**Short (button / bio):**
> Join the DeskCharm beta — new charms and visitors first, and a direct line to the makers.

**Long (site / email / forms):**
> **Help shape DeskCharm.** We're two co-founders building a calmer desktop for Windows. Beta testers get new charms, visitors and festival packs before anyone else, a direct line to us for bugs and ideas, and first word when Pro is ready. It takes two minutes a week: tell us what helped your day and what got in the way. No account in the app, and we'll only email you about the beta.
>
> Sign up: support@deskcharm.in (subject "DeskCharm beta")

Goal: 500 beta users in 60 days and 3 pilot companies.

---

## 6. Two-week launch timeline

Launch day = **Day 0** (pick a Tuesday–Thursday; Product Hunt day starts 00:01 PT = 12:31 IST).

### Week −1 (prepare)
- [ ] Day −7: Publish the refreshed site (`docs/index.html`), check the video, guide PDF and download link on desktop and phone.
- [ ] Day −7: Publish the release on tharuneshwar-s/deskcharm-releases (installer + latest.json + SHA-256); check https://deskcharm.in download links.
- [ ] Day −6: Check the privacy policy (v2026-11-01) and find-key page; set up a simple beta sign-up (form or mail filter).
- [ ] Later (not this launch): submit the Microsoft Store listing (copy above, screenshots from `docs/guide/img`, 1:1 and 16:9 tiles); certification can take days.
- [ ] Day −5: Create the Product Hunt draft: gallery (5 images + video), first comment, topics; line up a hunter or self-hunt.
- [ ] Day −5: Prepare short clips from the explainer: charm fling (10 s), Vijay water (8 s), Pongal visitor (8 s).
- [ ] Day −4: Read rules of every target subreddit; message mods where self-promo needs approval.
- [ ] Day −3: Send personal messages to friends, classmates and college groups: "we launch on Day 0, please try it and leave honest feedback" (no vote asking).
- [ ] Day −2: Email 10–15 company contacts about the free 30-day pilot.
- [ ] Day −1: Final smoke test of the installer on a clean Windows 10 and 11 machine; prepare an FAQ reply doc (SmartScreen, privacy, macOS).

### Week 0 (launch)
- [ ] Day 0: Product Hunt live at 12:31 IST; post the first comment; reply to every comment all day.
- [ ] Day 0: X + LinkedIn launch posts; Instagram reel (English) + story.
- [ ] Day 1: r/IndieDev post (tech story); Tamil Instagram post.
- [ ] Day 2: r/Windows (or its app thread); reply to performance questions.
- [ ] Day 3: r/india / r/Chennai / r/TamilNadu culture post with correct flair.
- [ ] Day 4: r/productivity (method post, link only if allowed).
- [ ] Day 5: Collect all feedback into GitHub issues; ship a small fix release if needed and post "you asked, we fixed".
- [ ] Day 6: Thank-you post with honest numbers (beta sign-ups, downloads — only real ones).

### Week +1 (follow-through)
- [ ] Day 7–8: Follow up with pilot companies; book 2–3 calls.
- [ ] Day 9: Apply to incubators / Startup TN with the deck and the launch learnings.
- [ ] Day 10: Write a short "what we learned launching" post (LinkedIn + dev.to).
- [ ] Day 11–12: Plan the next festival pack (Diwali is close: check dates) and tease it.
- [ ] Day 13: Review: beta sign-ups vs the 500 goal, top 5 requests, Pro sales.
- [ ] Day 14: Decide next two weeks (code signing, first Pro pack; Store later).
