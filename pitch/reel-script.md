# DeskCharm — 30-second vertical reel

Files:
- `DeskCharm-Reel-30s.mp4`: English captions
- `DeskCharm-Reel-30s-ta.mp4`: Tamil captions, same English voice

Both are 1080×1920, 30 fps, H.264 + AAC 48 kHz stereo, 29.4 s long.
`reel-contact.jpg` / `reel-contact-ta.jpg` show one frame from each shot.

- **Footage:** the raw explainer captures (2882×1620 CDP screencast frames). Each shot is a 9:16 crop of the action with a slow push-in.
- **Voice:** Kokoro `af_heart` (local TTS). One line per shot; silence is trimmed from the start and end of each line.
- **Music:** the explainer's music bed (DeskCharm ambience, *temple* + *chimes*). It is ducked under the voice with a sidechain compressor.
- **Loudness:** the mix is normalised to −14 LUFS integrated with a true peak of −1.5 dBTP.
- **Fonts:** English captions use Segoe UI Black. Tamil captions use Nirmala UI, rendered through headless Edge so the Tamil text is shaped correctly.

| Time | Shot (capture) | Voiceover | Caption EN | Caption TA |
|---|---|---|---|---|
| 0.0 | Vijay offers a tumbler, "drink some water?" bubble (vijay) | Drink some water? | **Drink some water?** (blue hook card) | கொஞ்சம் தண்ணீர் குடிக்கலாமா? |
| 2.0 | Nazar hanging, swaying (play) | Your desktop needs a little nazar. | Your desktop needs a little nazar | உங்கள் டெஸ்க்டாப்புக்கு ஒரு திருஷ்டி கண் |
| 4.2 | Nazar swinging after a fling (play) | Fling it, and it swings on a real string. | Fling it. It swings. | இழுத்து விடுங்கள் — ஆடும்! |
| 6.6 | Breathing glow (breathe) | Rest your cursor, and it breathes with you. | It breathes with you | உங்களோடு சேர்ந்து மூச்சு விடும் |
| 8.9 | Baby elephant (v-elephant) | Little visitors drop by. | Little visitors drop by | குட்டி விருந்தினர்கள் வருவார்கள் |
| 10.6 | Monkey "Mine!" (v-monkey) | A cheeky monkey steals a bead! | A cheeky monkey steals a bead! | குறும்புக் குரங்கு மணியைத் திருடும்! |
| 12.6 | Peacock fans its tail (v-peacock) | (music only) | A peacock fans its tail | மயில் தோகை விரிக்கும் |
| 14.3 | Chai-wala on his cycle (v-chai) | The chai-wala brings your break. | Chai break, right on time | சரியான நேரத்தில் டீ பிரேக் |
| 16.1 | Vijay, glass counted 1/8 (vijay) | Gentle nudges for water, breaks and breathing. | Water · breaks · breathing | தண்ணீர் · இடைவேளை · மூச்சுப் பயிற்சி |
| 18.7 | Vijay greets "வணக்கம் நண்பா!" (tamil) | It even speaks Tamil. | It even speaks Tamil | தமிழிலும் பேசும் |
| 20.3 | Diwali kid carrying a diya (festival) | Made for Diwali, Pongal, and every festival. | Diwali · Pongal · every festival | தீபாவளி · பொங்கல் · எல்லா பண்டிகைகளும் |
| 23.2 | Mood check-in under the charm (mood) | And it all stays on your PC. | Private: it stays on your PC | எல்லாம் உங்கள் கணினியிலேயே — தனிப்பட்டது |
| 25.0–29.4 | End card: nazar on a string over a sunset gradient | DeskCharm. A little calm on your desktop. Beta soon. | **DeskCharm** · a little calm on your desktop · *beta soon* | **DeskCharm** · உங்கள் டெஸ்க்டாப்பில் கொஞ்சம் அமைதி · *பீட்டா விரைவில்* |

Measured on the EN file: −14.3 LUFS integrated, max −1.5 dBFS, LRA 3.1 LU. Mean level is about −17 dB in voiced sections and −22 dB in the music-only peacock shot.

Rebuild: `node %TEMP%/dcreel/reel.mjs`. This script only reads `%TEMP%/dcvid` (captures + `music.wav`) and writes to `docs/pitch/`.
