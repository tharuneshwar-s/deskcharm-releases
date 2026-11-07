// Assembles docs/video/DeskCharm-Explainer.mp4 (+ .srt and script.md) from raw material kept
// outside the repo (default %TEMP%/dcvid, override with DC_VIDEO_TMP):
//   cap/<shot>/NNNNNN.jpg + times.json  CDP screencast frames of the overlay / Settings in headless
//                                       Edge (2882x1620 = 1537x864 CSS at DPR 1.875) over a generated
//                                       wallpaper + mock taskbar; times are wall-clock seconds
//   vo/sNN.wav                          narration per scene (Kokoro af_heart), text = SCENES[].text
//   music.wav                           calm bed rendered from src/js/ambience.js ('temple' + 'chimes')
//                                       in an OfflineAudioContext
//   wallpaper.jpg                       the backdrop also used behind the stills
// Stills come from docs/guide/img; the Windows notification is docs/video/capture/toast-real.png. The footage is made
// with the scripts in docs/video/capture (steps: script.md › "Re-making the footage"). Needs ffmpeg/ffprobe
// (FFMPEG / FFPROBE env or the defaults below) and sharp from the repo's node_modules.
//
//   node docs/video/build-video.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const require = createRequire(import.meta.url);
const sharp = require(path.join(ROOT, 'node_modules', 'sharp'));

const TMP = process.env.DC_VIDEO_TMP || path.join(os.tmpdir(), 'dcvid');
const TOOLS = path.join(os.tmpdir(), 'vidtools', 'node_modules');
const FFMPEG = process.env.FFMPEG || path.join(TOOLS, 'ffmpeg-static', 'ffmpeg.exe');
const FFPROBE = process.env.FFPROBE || path.join(TOOLS, 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe');
const WORK = path.join(TMP, 'build');
const IMG = path.join(ROOT, 'docs', 'guide', 'img');
const OUT = path.join(HERE, 'DeskCharm-Explainer.mp4');
const FONT = 'C\\:/Windows/Fonts/segoeuisl.ttf';
const FONT_B = 'C\\:/Windows/Fonts/segoeuib.ttf';

const W = 1920, H = 1080, FPS = 30;
const XF = 0.5;          // crossfade between scenes (s)
const LEAD = 0.5;        // silence before the narration in each scene (s)
const TAIL = 1.1;        // footage after the narration ends (s)
const MUSIC_BELOW_VOICE_DB = 18;

// Crops in screencast pixels (2882x1620).
const C = {
    wide: [0, 0, 2882, 1620],
    med: [400, 400, 2160, 1215],        // visitors on the taskbar + the charm
    fest: [0, 405, 2160, 1215],
    charm: [1089, 300, 1440, 810],      // close-up: charm + cue under it
    charmLow: [1089, 400, 1440, 810],   // close-up with the mood faces / ritual cue
    charmRope: [480, 0, 2400, 1350],    // charm with its whole string (fling)
    top: [1250, 0, 1440, 810],          // water ring by the hook
    two: [700, 150, 2160, 1215],
    set: [160, 60, 2560, 1440],         // Settings window
    peacock: [760, 1080, 960, 540],     // close-up of the taskbar strip where the peacock fans its tail
    festLow: [80, 945, 1200, 675],      // close-up of the festival guest walking in from the left
};

// seg: { cap, from, dur, crop, speed } (dur in output seconds; the last seg of a scene fills the rest)
//      { still, dur }  still from docs/guide/img on the wallpaper with a slow zoom
const SCENES = [
    { id: 's01', title: 'Meet DeskCharm',
        text: 'Meet DeskCharm. It is a little charm that hangs from the top of your screen, sways as your mouse passes by, and keeps you company while you work. And now and then, a friendly visitor strolls along your taskbar.',
        segs: [{ cap: 'intro', from: 0.5, dur: 6, crop: C.wide }, { cap: 'intro', from: 13, crop: C.med }] },
    { id: 's02', title: 'Install & start',
        text: 'Getting started is easy. Run the installer — no admin rights needed — and DeskCharm starts right away, in the top-right corner. Its tray icon, near the clock, opens Settings, hides the charm, or quits.',
        segs: [{ still: 'install-wizard.png', dur: 5.2 }, { cap: 'start', from: 2, dur: 4.3, crop: C.wide }, { still: 'tray.png' }] },
    { id: 's03', title: 'Grab, fling, rest, ring, smash',
        text: 'The charm is made for touching. Grab it and fling it, and it swings on a real string. Rest your cursor on it, and it glows softly, breathing in and out with you. Double-click to ring a bell. Rough day? Click it quickly, again and again, and smash it to calm.',
        segs: [{ cap: 'play', from: 3, dur: 6, crop: C.charmRope }, { cap: 'play', from: 10.5, dur: 4.6, crop: C.charm },
            { cap: 'play', from: 16.2, dur: 1.8, crop: C.charm }, { cap: 'play', from: 18, crop: C.charm }] },
    { id: 's04', title: 'Quick menu · two charms · themes',
        text: 'Right-click for the quick menu: breathing, focus, your tasks, ambience and more. Hang one charm, or two side by side. Toro and Kuro have living cat faces — click one to poke it. And themes set both charms, a soft glow, and a sound in one click.',
        segs: [{ still: 'overlay-quick-menu.png', dur: 4.2 }, { cap: 'two', from: 4, dur: 10.2, crop: C.two }, { still: 'settings-themes.png' }] },
    { id: 's05', title: 'Desk visitors',
        text: 'Every so often, a desk visitor drops by. A baby elephant trumpets and sprays the charm. A cat stretches and settles in. A cheeky monkey steals a bead! And a peacock fans its tail.',
        segs: [{ cap: 'v-elephant', from: 3.5, dur: 5, crop: C.med }, { cap: 'intro', from: 19.5, dur: 3, crop: C.med },
            { cap: 'v-monkey', from: 7.2, dur: 3.4, crop: C.med }, { cap: 'v-peacock', from: 9.2, crop: C.peacock }] },
    { id: 's06', title: 'Yogi · chai-wala · myna',
        text: 'The yogi floats in for three slow breaths. The chai-wala rides up with your break. And the myna bird lands to remind you to rest your eyes.',
        segs: [{ cap: 'v-yogi', from: 11.5, dur: 3.5, crop: C.med }, { cap: 'v-chai', from: 4.5, dur: 3.3, crop: C.med }, { cap: 'v-bird', from: 4.5, crop: C.med }] },
    { id: 's07', title: 'Vijay, the water buddy',
        text: 'Vijay, your water buddy, offers a tumbler: drink some water? Say yes, and a glass is counted on your water ring. During festivals like Pongal, Holi, Diwali and Christmas, special guests visit too.',
        segs: [{ cap: 'vijay', from: 10.5, dur: 9, crop: C.med }, { cap: 'festival', from: 5, crop: C.festLow }] },
    { id: 's08', title: 'Guided breathing',
        text: 'When you need a pause, start a guided breathing session. The charm glows — in for four seconds, out for six. Just follow it.',
        segs: [{ cap: 'breathe', from: 0.3, crop: C.charm }] },
    { id: 's09', title: 'Focus timer & tasks',
        text: 'The focus timer gives you twenty-five minutes of focus, then a short break. It asks what you are working on, and shows your task and time right beside the charm.',
        segs: [{ cap: 'focus', from: 0.3, dur: 3.6, crop: C.charm }, { still: 'task-prompt.png', dur: 3.6 }, { cap: 'focus', from: 4, crop: C.charm }] },
    { id: 's10', title: 'Water · stretch · mood',
        text: 'The water ring fills through the day. The yogi leads a quick stretch. And once a day, a mood check-in asks how you are feeling, with five simple faces.',
        segs: [{ cap: 'water', from: 0.5, dur: 3.4, crop: C.top }, { cap: 'stretch', from: 12, dur: 3.4, crop: C.med }, { cap: 'mood', from: 1.5, crop: C.charmLow }] },
    { id: 's11', title: 'Reminders · ambience · daily ritual',
        text: 'Your own reminders arrive as a soft cue beside the charm, a visitor if you like, and a Windows notification. Add gentle ambience — rain, ocean, temple, or chimes — and a daily ritual for your mornings and evenings.',
        segs: [{ cap: 'reminder', from: 1.5, dur: 7.6, crop: C.med, toast: true }, { cap: 'intro', from: 0.5, dur: 4.4, crop: C.charm, ambience: true },
            { cap: 'ritual', from: 0.3, crop: C.charmLow }] },
    { id: 's12', title: 'Insights & Settings',
        text: 'Insights shows your calm minutes, breaks, water and streak, with a look at this week. And Settings lets you shape everything: the charm, play, visitors, calm tools, seasons and privacy.',
        segs: [{ cap: 'insights', from: 1.5, dur: 6, crop: C.set }, { cap: 'settings', from: 0.8, crop: C.set, speed: 1.5 }] },
    { id: 's13', title: 'Tamil · shortcuts · backup',
        text: 'The charm and visitors can speak English or Tamil. Set shortcuts to send a visitor, count a glass of water, or take a breath, and back up your settings to a single file.',
        segs: [{ cap: 'general', from: 1.2, dur: 3.8, crop: C.set }, { cap: 'tamil', from: 9.8, dur: 3.6, crop: C.med }, { cap: 'general', from: 6.2, crop: C.set }] },
    { id: 's14', title: 'Private by design',
        text: 'Best of all, it stays on your PC. No account, no analytics, no tracking. DeskCharm — a little calm, hanging on your desktop.',
        segs: [{ cap: 'outro', from: 0.3, crop: C.wide }], outroCard: true },
];
const OUTRO_HOLD = 3;    // the title card stays after the last words

// ---------- helpers ----------
const sh = (bin, args) => execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 }).toString();
const ff = (args) => execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const probeDur = (f) => Number(sh(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).trim());
const fmt = (n) => n.toFixed(3);
const X264 = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS)];

/** Mean and peak level in dB (ffmpeg volumedetect, which reports on stderr). */
function detect(file) {
    const r = spawnSync(FFMPEG, ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
    const mean = Number(/mean_volume: (-?[\d.]+) dB/.exec(r.stderr)?.[1]);
    const max = Number(/max_volume: (-?[\d.]+) dB/.exec(r.stderr)?.[1]);
    return { mean, max };
}

/** Frames of capture `cap` covering source [from, from+len) → concat-demuxer list. */
function frameList(cap, from, len) {
    const dir = path.join(TMP, 'cap', cap);
    const { t0, end, times } = JSON.parse(fs.readFileSync(path.join(dir, 'times.json'), 'utf8'));
    const ts = times.map((t) => t - t0);
    const stop = Math.min(from + len, end - t0);
    let i = 0;   // the frame on screen at `from` (the first one if `from` is earlier)
    while (i + 1 < ts.length && ts[i + 1] <= from) i++;
    const lines = [];
    let at = from;
    for (; i < ts.length && at < stop - 1e-6; i++) {
        const next = Math.min(i + 1 < ts.length ? ts[i + 1] : end - t0, stop);
        const d = next - at;
        if (d > 0) lines.push(`file '${path.join(dir, String(i).padStart(6, '0') + '.jpg').replace(/\\/g, '/')}'`, `duration ${fmt(d)}`);
        at = next;
    }
    lines.push(lines[lines.length - 2]); // concat demuxer: repeat the last file so its duration counts
    return { text: lines.join('\n') + '\n', avail: stop - from };
}

/** One footage segment → mp4 of exactly `dur` output seconds. */
function renderCapture(seg, dur, out) {
    const speed = seg.speed || 1;
    const { text, avail } = frameList(seg.cap, seg.from, dur * speed);
    const list = out + '.txt';
    fs.writeFileSync(list, text);
    const [x, y, w, h] = seg.crop;
    const shown = avail / speed;
    const pad = Math.max(0, dur - shown);
    const vf = [`setpts=PTS/${speed}`, `crop=${w}:${h}:${x}:${y}`, `scale=${W}:${H}:flags=lanczos`, `fps=${FPS}`,
        pad > 0 ? `tpad=stop_mode=clone:stop_duration=${fmt(pad)}` : null, 'format=yuv420p'].filter(Boolean).join(',');
    ff(['-f', 'concat', '-safe', '0', '-i', list, '-vf', vf, '-t', fmt(dur), ...X264, '-an', out]);
}

async function wallpaperBlur() {
    const f = path.join(WORK, 'wall-blur.png');
    if (!fs.existsSync(f)) {
        await sharp(path.join(TMP, 'wallpaper.jpg')).resize(W * 2, H * 2).blur(30).modulate({ brightness: 0.82 }).png().toFile(f);
    }
    return f;
}

/** Still on the blurred wallpaper (rounded, shadowed, 2x size for a smooth zoom). */
async function stillCard(name) {
    const f = path.join(WORK, 'card-' + name);
    if (fs.existsSync(f)) return f;
    const S = 2;
    const meta = await sharp(path.join(IMG, name)).metadata();
    const k = Math.min((1400 * S) / meta.width, (820 * S) / meta.height);
    const w = Math.round(meta.width * k), h = Math.round(meta.height * k);
    const r = 16 * S;
    const mask = Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}"/></svg>`);
    const img = await sharp(path.join(IMG, name)).resize(w, h, { kernel: 'lanczos3' }).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    const pad = 80 * S;
    const shadow = await sharp(Buffer.from(`<svg width="${w + pad * 2}" height="${h + pad * 2}"><rect x="${pad}" y="${pad + 18 * S}" width="${w}" height="${h}" rx="${r}" fill="rgba(0,0,0,0.55)"/></svg>`)).blur(28 * S).png().toBuffer();
    const left = Math.round((W * S - w) / 2), top = Math.round((H * S - h) / 2);
    await sharp(await wallpaperBlur()).composite([{ input: shadow, left: left - pad, top: top - pad }, { input: img, left, top }]).png().toFile(f);
    return f;
}

async function renderStill(seg, dur, out) {
    const card = await stillCard(seg.still);
    const n = Math.round(dur * FPS);
    const vf = `zoompan=z='1+0.05*on/${n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${n}:s=${W}x${H}:fps=${FPS},format=yuv420p`;
    ff(['-loop', '1', '-framerate', String(FPS), '-i', card, '-vf', vf, '-frames:v', String(n), ...X264, '-an', out]);
}

/** The real Windows notification (docs/video/capture/toast-real.png, see script.md) with rounded corners. */
async function toastPng() {
    const f = path.join(WORK, 'toast.png');
    const src = path.join(HERE, 'capture', 'toast-real.png');
    const { width: w, height: h } = await sharp(src).metadata();
    const k = 560 / w;
    const W2 = 560, H2 = Math.round(h * k);
    const mask = Buffer.from(`<svg width="${W2}" height="${H2}"><rect width="${W2}" height="${H2}" rx="12" ry="12"/></svg>`);
    await sharp(src).resize(W2, H2, { kernel: 'lanczos3' }).composite([{ input: mask, blend: 'dest-in' }]).png().toFile(f);
    return f;
}

/** Ambience overlay: falling rain streaks (2H tall so it can scroll) and a caption with the sounds. */
async function ambiencePngs() {
    const rain = path.join(WORK, 'amb-rain.png');
    const caption = path.join(WORK, 'amb-caption.png');
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const lines = [];
    for (let i = 0; i < 260; i++) {
        const x = rnd() * W, y = rnd() * H * 2, l = 50 + rnd() * 70, a = 0.35 + rnd() * 0.35;
        lines.push(`<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x - l * 0.18).toFixed(1)}" y2="${(y + l).toFixed(1)}" stroke="rgba(235,242,255,${a.toFixed(2)})" stroke-width="3" stroke-linecap="round"/>`);
    }
    await sharp(Buffer.from(`<svg width="${W}" height="${H * 2}" xmlns="http://www.w3.org/2000/svg">${lines.join('')}</svg>`)).png().toFile(rain);
    const cw = 980, chh = 92;
    const bars = [14, 30, 46, 26, 38, 20].map((b, i) => `<rect x="${44 + i * 12}" y="${(chh - b) / 2}" width="6" height="${b}" rx="3" fill="#f3e6d8"/>`).join('');
    await sharp(Buffer.from(`<svg width="${cw}" height="${chh}" xmlns="http://www.w3.org/2000/svg">
<rect width="${cw}" height="${chh}" rx="${chh / 2}" fill="rgba(20,22,30,0.62)"/>${bars}
<text x="${cw / 2 + 50}" y="60" text-anchor="middle" font-family="Segoe UI" font-size="38" fill="#ffffff">Rain · Wind · Ocean · Temple · Chimes</text></svg>`)).png().toFile(caption);
    return { rain, caption };
}

function textFile(name, s) {
    const f = path.join(WORK, name);
    fs.writeFileSync(f, s, 'utf8');
    return f.replace(/\\/g, '/').replace(/:/g, '\\:');
}

// ---------- build ----------
async function main() {
    fs.mkdirSync(WORK, { recursive: true });
    const voice = SCENES.map((s) => probeDur(path.join(TMP, 'vo', s.id + '.wav')));
    const len = SCENES.map((s, i) => LEAD + voice[i] + TAIL + (i < SCENES.length - 1 ? XF : 0) + (s.outroCard ? OUTRO_HOLD : 0));
    const start = [];
    let acc = 0;
    for (let i = 0; i < SCENES.length; i++) { start.push(acc); acc += len[i] - (i < SCENES.length - 1 ? XF : 0); }
    const total = acc;
    const toast = await toastPng();
    const amb = await ambiencePngs();

    // Scenes
    const clips = [];
    for (const [i, s] of SCENES.entries()) {
        const fixed = s.segs.reduce((a, g) => a + (g.dur || 0), 0);
        const parts = [];
        let at = 0;
        const overlays = [];
        for (const [k, g] of s.segs.entries()) {
            const d = g.dur || Math.max(0.5, len[i] - fixed);
            const f = path.join(WORK, `${s.id}-${k}.mp4`);
            if (g.still) await renderStill(g, d, f); else renderCapture(g, d, f);
            if (g.toast) overlays.push({ kind: 'toast', from: at + 1.2, to: at + d - 0.3 });
            if (g.ambience) overlays.push({ kind: 'ambience', from: at, to: at + d });
            parts.push(f);
            at += d;
        }
        const list = path.join(WORK, `${s.id}.txt`);
        fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n') + '\n');
        const cap = textFile(`${s.id}-title.txt`, s.title);
        const show = 4.6;
        const alpha = `if(lt(t,0.9),0,if(lt(t,1.4),(t-0.9)/0.5,if(lt(t,${show}),1,if(lt(t,${show + 0.5}),(${show + 0.5}-t)/0.5,0))))`;
        let fc = `[0:v]drawtext=fontfile='${FONT}':textfile='${cap}':fontsize=46:fontcolor=white:x=96:y=h-196:box=1:boxcolor=0x14161e@0.55:boxborderw=22|30:alpha='${alpha}':enable='lt(t,${show + 0.6})'[v0]`;
        let last = 'v0';
        const inputs = ['-f', 'concat', '-safe', '0', '-i', list];
        for (const o of overlays) {
            const k = inputs.filter((a) => a === '-i').length;   // index of the next input
            const fade = (lbl) => `format=rgba,fade=t=in:st=${fmt(o.from)}:d=0.4:alpha=1,fade=t=out:st=${fmt(o.to - 0.4)}:d=0.4:alpha=1[${lbl}]`;
            const on = `enable='between(t,${fmt(o.from)},${fmt(o.to)})'`;
            const next = `o${k}`;
            if (o.kind === 'toast') {
                inputs.push('-loop', '1', '-i', toast);
                fc += `;[${k}:v]${fade('t' + k)};[${last}][t${k}]overlay=x=W-w-24:y=H-h-80:${on}:shortest=1[${next}]`;
            } else {
                inputs.push('-loop', '1', '-i', amb.rain, '-loop', '1', '-i', amb.caption);
                const r = k, c = k + 1;
                fc += `;[${r}:v]${fade('r' + r)};[${c}:v]${fade('c' + c)}` +
                    `;[${last}][r${r}]overlay=x=0:y='-H+mod(t*520,H)':${on}:shortest=1[m${r}]` +
                    `;[m${r}][c${c}]overlay=x=(W-w)/2:y=H-h-70:${on}:shortest=1[${next}]`;
            }
            last = next;
        }
        if (s.outroCard) {
            const t1 = LEAD + voice[i] - 4.2;
            const a = `if(lt(t,${fmt(t1)}),0,min(1,(t-${fmt(t1)})/1.2))`;
            const name = textFile('outro-name.txt', 'DeskCharm');
            const tag = textFile('outro-tag.txt', 'A little calm, hanging on your desktop');
            const priv = textFile('outro-priv.txt', 'Everything stays on your PC');
            // The charm hangs right of centre in the outro shot: the text block sits left of it.
            fc += `;color=c=0x0b0d14:s=${W}x${H}:r=${FPS},format=rgba,colorchannelmixer=aa=0.55,fade=t=in:st=${fmt(t1)}:d=1.2:alpha=1[dim];[${last}][dim]overlay=shortest=1[vd]` +
                `;[vd]drawtext=fontfile='${FONT_B}':textfile='${name}':fontsize=120:fontcolor=white:x=(w-tw)/2-220:y=h/2-150:alpha='${a}'` +
                `,drawtext=fontfile='${FONT}':textfile='${tag}':fontsize=46:fontcolor=0xf3e6d8:x=(w-tw)/2-220:y=h/2+10:alpha='${a}'` +
                `,drawtext=fontfile='${FONT}':textfile='${priv}':fontsize=30:fontcolor=0xc8cbd8:x=(w-tw)/2-220:y=h/2+96:alpha='${a}'[v2]`;
            last = 'v2';
        }
        const clip = path.join(WORK, `${s.id}.mp4`);
        ff([...inputs, '-filter_complex', fc, '-map', `[${last}]`, '-t', fmt(len[i]), ...X264, '-an', clip]);
        clips.push(clip);
        console.log(`${s.id} ${fmt(len[i])}s`);
    }

    // Video: crossfade chain
    const vin = clips.flatMap((c) => ['-i', c]);
    let vfc = '';
    let prev = '0:v';
    let off = 0;
    for (let i = 1; i < clips.length; i++) {
        off += len[i - 1] - XF;
        const out = i === clips.length - 1 ? 'vout' : `x${i}`;
        vfc += `[${prev}][${i}:v]xfade=transition=fade:duration=${XF}:offset=${fmt(off)}[${out}];`;
        prev = out;
    }
    vfc += `[vout]fade=t=in:st=0:d=0.8,fade=t=out:st=${fmt(total - 1.2)}:d=1.2[vfinal]`;
    const video = path.join(WORK, 'video.mp4');
    ff([...vin, '-filter_complex', vfc, '-map', '[vfinal]', ...X264, '-an', video]);

    // Audio: narration at scene starts; music ducked under it
    const ain = SCENES.flatMap((s) => ['-i', path.join(TMP, 'vo', s.id + '.wav')]);
    let afc = SCENES.map((s, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round((start[i] + LEAD) * 1000)}:all=1[a${i}]`).join(';');
    afc += ';' + SCENES.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${SCENES.length}:normalize=0,apad=whole_dur=${fmt(total)},atrim=0:${fmt(total)}[voice]`;
    const voiceWav = path.join(WORK, 'voice.wav');
    ff([...ain, '-filter_complex', afc, '-map', '[voice]', '-c:a', 'pcm_s16le', voiceWav]);

    const v = detect(voiceWav);
    const m = detect(path.join(TMP, 'music.wav'));
    // Voice to about -16 dB mean (speech regions are louder than this whole-track mean), music 18 dB under it.
    const voiceGain = Math.min(-16 - v.mean, -1.5 - v.max);
    const musicGain = (v.mean + voiceGain) - MUSIC_BELOW_VOICE_DB - m.mean;
    const mix = path.join(WORK, 'mix.wav');
    ff(['-i', voiceWav, '-i', path.join(TMP, 'music.wav'), '-filter_complex',
        `[0:a]volume=${voiceGain.toFixed(2)}dB,asplit=2[vo][key];` +
        `[1:a]atrim=0:${fmt(total)},asetpts=N/SR/TB,volume=${musicGain.toFixed(2)}dB,afade=t=in:st=0:d=2.5,afade=t=out:st=${fmt(total - 4)}:d=4[mu];` +
        `[mu][key]sidechaincompress=threshold=0.03:ratio=4:attack=60:release=700:makeup=1[duck];` +
        `[vo][duck]amix=inputs=2:normalize=0,volume=2.5dB,alimiter=limit=0.89:level=false[out]`,
        '-map', '[out]', '-c:a', 'pcm_s16le', mix]);

    ff(['-i', video, '-i', mix, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT]);

    writeSrt(start, voice);
    writeScript(start, voice, total);
    console.log(`done ${OUT} ${fmt(probeDur(OUT))}s`);
}

const ts = (t) => {
    const ms = Math.round(t * 1000);
    const h = Math.floor(ms / 3600000), mi = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** Sentences of each scene timed by their share of characters in the scene's narration. */
function cues(start, voice) {
    const out = [];
    SCENES.forEach((s, i) => {
        const parts = s.text.match(/[^.!?]+[.!?]+(\s|$)/g).map((p) => p.trim());
        const chars = parts.reduce((a, p) => a + p.length, 0);
        let t = start[i] + LEAD;
        for (const p of parts) {
            const d = voice[i] * (p.length / chars);
            out.push({ from: t, to: t + d - 0.05, text: p });
            t += d;
        }
    });
    return out;
}

function wrap(text, max = 46) {
    const words = text.split(' ');
    const lines = [''];
    for (const w of words) {
        if ((lines.at(-1) + ' ' + w).trim().length > max && lines.at(-1)) lines.push(w);
        else lines[lines.length - 1] = (lines.at(-1) + ' ' + w).trim();
    }
    return lines.join('\n');
}

function writeSrt(start, voice) {
    const srt = cues(start, voice).map((c, k) => `${k + 1}\n${ts(c.from)} --> ${ts(c.to)}\n${wrap(c.text)}\n`).join('\n');
    fs.writeFileSync(path.join(HERE, 'DeskCharm-Explainer.srt'), srt, 'utf8');
}

const CAPTURE_DOC = `## Re-making the footage

Raw material lives outside the repo in \`%TEMP%/dcvid\` (override with \`DC_VIDEO_TMP\`); the scripts that make it are in \`docs/video/capture/\`.

1. **Backdrop.** Put \`wallpaper.jpg\` (1920×1080 or larger), \`icon.png\` (the app icon) and \`config.json\` (a copy of a DeskCharm config, \`%APPDATA%/com.deskcharm.desktop/config.json\`; the Settings captures read it) in the folder.
2. **Server.** \`node docs/video/capture/serve.mjs\` serves \`src/\` on http://localhost:5347 and \`/__vid/*\` from \`capture/\` (\`init.js\`, \`settings-host.html\`) or the raw folder.
3. **Browser.** Open headless Edge with omp's browser (never the everyday browser): \`browser.open({ name: 'vid', url: 'about:blank', app: { path: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args: ['--headless=new', '--user-data-dir=%TEMP%/edge-vid', '--autoplay-policy=no-user-gesture-required'] }, viewport: { width: 1537, height: 864, deviceScaleFactor: 1.875 } })\`. \`init.js\` (injected by \`rec.mjs\`) paints the wallpaper, a mock taskbar and a visible cursor, and fakes the Tauri API for Settings.
4. **Record.** For each capture name used in the table above: \`await tab.run(async ({ page }, name) => (await import('<repo>/docs/video/capture/shots.mjs')).SHOTS[name](page), { args: [name], timeout: 180 })\`. Visitor captures are \`SHOTS.visitor(page, '<id>')\` saved as \`v-<id>\`. Frames land in \`cap/<name>/\` (CDP screencast JPEGs at 2882×1620 + \`times.json\`).
5. **Notification.** \`capture/toast-real.png\` is a real Windows toast from the installed app: back up the config, quit DeskCharm, start \`deskcharm.exe\` with \`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9336\`, evaluate \`__TAURI_INTERNALS__.invoke('reminder_test', { text: 'Call mum', visitor: '' })\` in its page over CDP, screenshot the desktop and crop to the toast only; then restore the config and restart the app normally.
6. **Voice and music.** \`vo/sNN.wav\`: Kokoro \`af_heart\` reading each scene's text from \`SCENES\` in \`build-video.mjs\`. \`music.wav\`: the *temple* + *chimes* synths of \`src/js/ambience.js\` rendered in an OfflineAudioContext (at least as long as the video).
7. **Build.** \`node docs/video/build-video.mjs\` (ffmpeg/ffprobe via \`FFMPEG\` / \`FFPROBE\` or the defaults in its header) writes the MP4, the SRT and this file.
`;

function writeScript(start, voice, total) {
    const words = SCENES.reduce((a, s) => a + s.text.split(/\s+/).length, 0);
    let md = `# DeskCharm explainer — narration script\n\n` +
        `Video: \`DeskCharm-Explainer.mp4\` (1920×1080, ${FPS} fps, H.264 + AAC), ${clock(total)} long, ${words} words of narration ` +
        `(Kokoro \`af_heart\`). Captions: \`DeskCharm-Explainer.srt\`. Rebuild with \`node docs/video/build-video.mjs\` ` +
        `(the header of that file lists the raw material it expects).\n\n` +
        `Timings are positions in the finished video. Each scene starts ${LEAD} s before its narration and crossfades ` +
        `(${XF} s) into the next.\n\n| # | Start | Voice | On-screen title | Footage |\n|---|---|---|---|---|\n`;
    SCENES.forEach((s, i) => {
        const foot = s.segs.map((g) => (g.still ? `still \`${g.still}\`` : `\`${g.cap}\``) +
            (g.toast ? ' + Windows notification' : '') + (g.ambience ? ' + rain / ambience caption' : '')).join(' → ');
        md += `| ${i + 1} | ${clock(start[i])} | ${voice[i].toFixed(1)} s | ${s.title} | ${foot} |\n`;
    });
    md += `\n## Narration\n\n`;
    SCENES.forEach((s, i) => {
        md += `### ${i + 1}. ${s.title} — ${clock(start[i] + LEAD)}–${clock(start[i] + LEAD + voice[i])}\n\n${s.text}\n\n`;
    });
    md += `## Sound\n\nMusic bed: DeskCharm's own ambience synths (\`src/js/ambience.js\`, *temple* + *chimes*) rendered offline, ` +
        `about ${MUSIC_BELOW_VOICE_DB} dB under the voice and ducked further while it speaks (sidechain compressor), ` +
        `faded in over 2.5 s and out over 4 s.\n\n` + CAPTURE_DOC;
    fs.writeFileSync(path.join(HERE, 'script.md'), md, 'utf8');
}

await main();
