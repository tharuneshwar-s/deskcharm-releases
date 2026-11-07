// Builds DeskCharm pitch decks: .pptx (pptxgenjs, with speaker notes) + .html (same layout) -> .pdf/.png via headless Edge.
// Usage: node docs/pitch/build-decks.mjs [--no-render]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import PptxGenJS from 'pptxgenjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = HERE;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const C = { bg: '12131f', card: '1c1e33', line: '2c2f4d', accent: '4f6bff', gold: 'e0b450', text: 'f2f3fa', mute: 'a6aac8' };
const FONT = 'Segoe UI';
const W = 13.333, H = 7.5, PX = 96; // inches; HTML px per inch
const G = (n) => `docs/guide/img/${n}.png`;
const S = (n) => `src/${n}.png`;

// ---------- shared slide content ----------
const team = {
  layout: 'cols', kicker: 'Team', title: 'Two founders, one shipped product',
  cols: [
    { h: 'Tharuneshwar S', t: 'Co-founder. Product, desktop engineering (Tauri + Rust), charm physics and design.' },
    { h: 'Saransakthi N', t: 'Co-founder. Product, community, culture content and testing.' },
    { h: 'How we work', t: '6 releases in one month. 110 JS + 58 Rust tests. Full user guide and a 3-minute explainer video.' },
  ],
  notes: 'Introduce both founders. Emphasise speed of shipping: six releases in a month, with real tests and documentation.',
};
const contact = (title, sub) => ({
  layout: 'cover', title, sub,
  bullets: ['deskcharm.in', 'Email: support@deskcharm.in', 'Tharuneshwar S · Saransakthi N'],
  images: [S('nazar-blue'), S('temple-bell'), S('friends-vijay')],
  notes: 'Close warmly. Share the contact details and invite questions.',
});

const users = [
  { layout: 'cover', title: 'DeskCharm', sub: 'A little charm for your desktop that keeps you calm, watered and smiling.',
    bullets: ['Free beta for Windows · v1.6.0'], images: [S('nazar-blue'), S('gods-ganesha'), S('friends-vijay')],
    notes: 'Open with the charm itself. DeskCharm is a desktop companion for Windows: a hanging charm that lives on your screen.' },
  { layout: 'split', kicker: 'What it is', title: 'A charm that hangs on your screen', img: G('overlay-charm'),
    bullets: ['Nazar, temple bells, Ganesha and more hang above your windows', 'It sways with real physics when you move it', 'Click through to your work, it never gets in the way'],
    notes: 'Explain the basic idea: a real-feeling charm on a string, floating over your desktop.' },
  { layout: 'gallery', kicker: 'Why it is fun', title: 'Drag it, fling it, squeeze it', imgs: [G('charm-drag'), G('charm-fling'), G('charm-squeeze')], caps: ['Drag', 'Fling', 'Squeeze'],
    notes: 'Show the toy side. People play with it between tasks. That small joy is the hook.' },
  { layout: 'split', kicker: 'Visitors', title: 'Friends drop by, like Vijay with water', img: G('overlay-visitor-vijay'),
    bullets: ['Visitors walk onto your screen with a gentle ask', 'Vijay reminds you to drink water', 'All visitors are free'],
    notes: 'Visitors are the most loved part in testing. Vijay the water buddy is a favourite.' },
  { layout: 'split', kicker: 'Culture moments', title: 'Diwali, Holi, Pongal, Christmas', img: G('settings-seasons'),
    bullets: ['Festival decor arrives on the day', 'Tamil and Indian culture at the heart', 'Charms that feel like home'],
    notes: 'Culture is what makes DeskCharm different. Festivals change the charm and decorations automatically.' },
  { layout: 'split', kicker: 'Calm tools', title: 'Breaks, water, breathing, mood', img: G('overlay-breathing'),
    bullets: ['Gentle break and posture nudges', 'Guided breathing on the charm', 'Mood check-ins, focus time, reminders', 'Quiet during meetings'],
    notes: 'The charm gets attention; the calm tools keep people using it every day.' },
  { layout: 'split', kicker: 'Insights', title: 'See your week, kindly', img: G('settings-insights'),
    bullets: ['Breaks taken, water, mood', 'No scores, no guilt', 'Stored only on your PC'],
    notes: 'Insights show simple patterns. Nothing leaves the computer.' },
  { layout: 'split', kicker: 'Privacy', title: 'Everything stays on your PC', img: G('settings-privacy'),
    bullets: ['No account, no tracking', 'Only exceptions: update check, opt-in weather and calendar', 'You can see and clear your data'],
    notes: 'Privacy by design. Be precise about the exceptions: update check, and opt-in weather and calendar.' },
  { layout: 'cols', kicker: 'Free vs Pro', title: 'Free to love. Pro to collect.',
    cols: [
      { h: 'Free', t: 'Classic charms (Nazar, Gods), all visitors, all calm tools.' },
      { h: 'Pro', t: 'Lifetime licence, 7-day trial. ₹69 launch / ₹99 on deskcharm.in. All charm packs, two charms, full Insights.' },
      { h: 'Fair', t: 'Wellness is never behind a paywall. Pro is about collecting and personalising.' },
    ], notes: 'Pro is one-time, no subscription. Calm tools stay free forever.' },
  { layout: 'cols', kicker: 'Try the beta', title: 'Join the beta today',
    cols: [
      { h: '1. Download', t: 'Get the Windows installer from our GitHub page.' },
      { h: '2. Install', t: 'The build is not signed yet, so Windows may warn you. Choose “More info → Run anyway”.' },
      { h: '3. Tell us', t: 'Share what you love and what annoys you. Every release comes from feedback.' },
    ], notes: 'Be honest about the unsigned build warning; code signing is on the roadmap.' },
  { layout: 'cols', kicker: 'Roadmap', title: 'What comes next',
    cols: [
      { h: 'Now', t: 'Public beta on deskcharm.in, code signing.' },
      { h: 'Next', t: 'Pro charm packs and themes, more visitors and festivals.' },
      { h: 'Later', t: 'Microsoft Store listing, macOS build and a mobile companion idea.' },
    ], notes: 'Roadmap order: trust first (signing), then Pro; the Store comes later, then new platforms.' },
  team,
  contact('Come hang a charm with us', 'Beta testers, creators and friends welcome.'),
];

const investors = [
  { layout: 'cover', title: 'DeskCharm', sub: 'Culture-led desktop wellness: a charm people love, habits that stick.',
    bullets: ['Investor & incubator deck · October 2026'], images: [S('nazar-blue'), S('temple-bell'), S('friends-vijay')],
    notes: 'One-line pitch: a delightful, culture-led desktop companion that quietly builds healthy habits.' },
  { layout: 'cols', kicker: 'Problem', title: 'Desk work quietly wears people down',
    cols: [
      { h: 'Sitting', t: 'Long hours in one chair, few real breaks, sore necks and backs.' },
      { h: 'Forgetting', t: 'Water, stretching and breathing get lost in back-to-back work.' },
      { h: 'Screen fatigue', t: 'Most break apps are cold timers that people mute within a week.' },
    ], notes: 'We describe the audience qualitatively: students, developers, office and remote workers. We do not quote market numbers we cannot cite.' },
  { layout: 'split', kicker: 'Solution', title: 'A charm that cares, right on the desktop', img: G('overlay-charm'),
    bullets: ['A physics charm people want to touch', 'Visitors and festivals bring delight', 'Gentle nudges: breaks, water, breathing, posture, mood, focus'],
    notes: 'Delight earns attention; wellness earns daily use.' },
  { layout: 'gallery', kicker: 'Demo', title: 'Real product, shipping today', imgs: [G('overlay-visitor-vijay'), G('overlay-breathing'), G('settings-insights')], caps: ['Vijay the water buddy', 'Breathing on the charm', 'Insights'],
    notes: 'These are real screenshots from v1.6.0. A 3-minute explainer video is also ready.' },
  { layout: 'cols', kicker: 'Why now · why us', title: 'The right moment and the right team',
    cols: [
      { h: 'Why now', t: 'Hybrid and remote work made the desk the whole day. People want wellbeing that is not another chore.' },
      { h: 'Why us', t: 'We are the audience: Tamil, Indian, at a desk all day. We ship fast: 6 releases in one month.' },
      { h: 'Built well', t: 'Tauri + Rust: small, fast, native. 168 automated tests. Store packaging ready.' },
    ], notes: 'Founder-market fit and execution speed.' },
  { layout: 'cols', kicker: 'Differentiation', title: 'Not another break timer',
    cols: [
      { h: 'Culture-led', t: 'Nazar, temple bells, Diwali, Pongal, Tamil friends. Content generic apps cannot copy quickly.' },
      { h: 'Private', t: 'Everything on the PC. No account, no tracking. Trust for users and employers.' },
      { h: 'Delightful', t: 'A toy first, a tool second. Play brings people back every day.' },
    ], notes: 'Generic break apps compete on features; we compete on feeling.' },
  { layout: 'cols', kicker: 'Business model', title: 'Freemium + B2B',
    cols: [
      { h: 'Free', t: 'Classic charms, all visitors, all calm tools. Wide reach.' },
      { h: 'Pro', t: 'Lifetime licence, 7-day trial: ₹69 launch / ₹99, one time. Packs, two charms, full Insights.' },
      { h: 'B2B', t: 'Team wellness pilots now (free, 30 days); paid plans after proof.' },
    ], notes: 'Pro: sold on deskcharm.in via Razorpay, priced in ₹ (international cards coming soon; a Microsoft Store listing later). B2B pricing after pilots.' },
  { layout: 'cols', kicker: 'Go-to-market', title: 'Start where the culture lives',
    cols: [
      { h: 'Creators', t: 'Tamil and Indian creators: festival and fan-favourite charm moments made for short videos.' },
      { h: 'Launches', t: 'Product Hunt and deskcharm.in for discovery; a Microsoft Store listing later.' },
      { h: 'Campus & teams', t: 'College communities and company wellness pilots.' },
    ], notes: 'Festivals are natural launch moments.' },
  { layout: 'cols', kicker: 'Traction plan', title: 'Honest start: 0 users today',
    cols: [
      { h: 'Today', t: 'Product shipped (v1.6.0), repo private, 0 public downloads.' },
      { h: '60-day goal', t: '500 beta users, with weekly feedback loops.' },
      { h: 'Pilot goal', t: '3 companies on a free 30-day pilot with a simple survey.' },
    ], notes: 'We are pre-traction. These are goals, not results.' },
  { layout: 'cols', kicker: 'Roadmap', title: 'Trust, then reach',
    cols: [
      { h: 'Next 3 months', t: 'Code signing, public beta, Pro packs.' },
      { h: 'Then', t: 'Microsoft Store listing, macOS build, team features (opt-in anonymous summary, central settings).' },
      { h: 'Idea', t: 'A mobile companion that carries the charm with you.' },
    ], notes: 'Team features and mobile are planned, not built.' },
  team,
  { layout: 'cols', kicker: 'The ask', title: 'Incubation and grant support',
    cols: [
      { h: 'Mentoring', t: 'Go-to-market, B2B sales and pricing guidance.' },
      { h: 'Credits', t: 'Code-signing certificate and cloud credits.' },
      { h: 'Reach', t: 'Marketing help (and a Microsoft Store listing later), e.g. via Startup TN or college incubators.' },
    ], notes: 'We are not naming an amount; we are asking for incubation and grant support.' },
  contact('Thank you', 'Let us make the desk a kinder place.'),
];

const companies = [
  { layout: 'cover', title: 'DeskCharm for Teams', sub: 'Gentle wellness nudges your people actually enjoy, fully private.',
    bullets: ['Free 30-day pilot · Windows'], images: [S('nazar-blue'), S('gods-bell'), S('friends-vijay')],
    notes: 'Position as a light, friendly wellbeing perk.' },
  { layout: 'cols', kicker: 'The problem', title: 'Teams sit too long and forget the basics',
    cols: [
      { h: 'Body', t: 'Long sitting, poor posture, little water.' },
      { h: 'Mind', t: 'Back-to-back meetings, little time to breathe or reset.' },
      { h: 'Programs', t: 'Wellness programs are often unused because they live outside the workday.' },
    ], notes: 'Qualitative problem; no made-up statistics.' },
  { layout: 'split', kicker: 'How it works', title: 'A charm on every desk', img: G('overlay-charm'),
    bullets: ['Lives right where people work', 'Friendly, not a nagging alarm', 'Fun enough that people keep it on'],
    notes: 'Engagement is the hard part of wellness; delight solves it.' },
  { layout: 'split', kicker: 'Nudges', title: 'Breaks, posture, water, mood, focus', img: G('settings-calm'),
    bullets: ['Break and posture reminders', 'Water with Vijay the visitor', 'Breathing, mood check-ins, focus sessions'],
    notes: 'Walk through the calm tools in Settings.' },
  { layout: 'split', kicker: 'Meeting-aware', title: 'Quiet when it matters', img: G('overlay-reminder'),
    bullets: ['Holds nudges during meetings and full-screen work', 'Optional calendar link (opt-in)', 'Never interrupts a presentation'],
    notes: 'Calendar is opt-in.' },
  { layout: 'split', kicker: 'Privacy for employees', title: 'Nothing is tracked by the employer', img: G('settings-privacy'),
    bullets: ['All data stays on each PC', 'No accounts, no dashboards of individuals', 'Team summary will be opt-in and anonymous (planned)'],
    notes: 'This is the key trust point for employees and HR.' },
  { layout: 'cols', kicker: 'Rollout', title: 'Simple to roll out',
    cols: [
      { h: 'Install', t: 'Standard Windows installer. Store packaging ready.' },
      { h: 'Share a config', t: 'Use settings backup to export one team configuration and import it on every PC.' },
      { h: 'Later', t: 'Central settings management is planned.' },
    ], notes: 'Today: installer plus settings backup file. Central management is planned.' },
  { layout: 'cols', kicker: 'Pilot offer', title: 'Free 30-day pilot',
    cols: [
      { h: 'Who', t: '3–5 companies, any team size that works at desks.' },
      { h: 'What you get', t: 'DeskCharm for the team, a shared config, and direct founder support.' },
      { h: 'Cost', t: 'Free during the pilot. Pricing comes later, shaped with pilot partners.' },
    ], notes: 'We want proof and feedback, not revenue, at this stage.' },
  { layout: 'cols', kicker: 'What we measure', title: 'Self-reported, never tracked',
    cols: [
      { h: 'Start survey', t: 'Short anonymous survey on breaks, water, stress and comfort.' },
      { h: 'End survey', t: 'Same questions after 30 days, plus what people liked.' },
      { h: 'Shared result', t: 'An aggregate summary for the team. No individual data.' },
    ], notes: 'All measurement is self-reported; the app sends nothing.' },
  { layout: 'cols', kicker: 'Next steps', title: 'Start in a week',
    cols: [
      { h: '1. Call', t: '30-minute chat to fit the pilot to your team.' },
      { h: '2. Setup', t: 'We prepare the team config and install guide.' },
      { h: '3. Pilot', t: '30 days, start and end survey, shared results.' },
    ], notes: 'Make the next step small and concrete.' },
  contact('Let us talk', 'Bring a calmer desk to your team.'),
];

// ---------- layout (shared by pptx + html) ----------
const dims = {};
async function size(rel) {
  if (!dims[rel]) { const m = await sharp(path.join(ROOT, rel)).metadata(); dims[rel] = [m.width, m.height]; }
  return dims[rel];
}
function fit(rel, bx, by, bw, bh) {
  const [w, h] = dims[rel]; const s = Math.min(bw / w, bh / h);
  const iw = w * s, ih = h * s; return { x: bx + (bw - iw) / 2, y: by + (bh - ih) / 2, w: iw, h: ih };
}
// Element types: text {x,y,w,h,text,size,color,bold,align}, img {x,y,w,h,src,frame}, box {x,y,w,h,fill}
async function layout(s, i, total) {
  const el = [];
  const T = (o) => el.push({ type: 'text', color: C.text, size: 18, ...o });
  el.push({ type: 'box', x: 0, y: H - 0.08, w: W * (i + 1) / total, h: 0.08, fill: C.accent });
  T({ x: W - 1.6, y: H - 0.5, w: 1.2, h: 0.3, text: `${i + 1} / ${total}`, size: 10, color: C.mute, align: 'right' });
  T({ x: 0.6, y: H - 0.5, w: 4, h: 0.3, text: 'DeskCharm', size: 10, color: C.mute });
  if (s.kicker) T({ x: 0.6, y: 0.45, w: 8, h: 0.4, text: s.kicker.toUpperCase(), size: 13, color: C.gold, bold: true });
  if (s.layout === 'cover') {
    T({ x: 0.6, y: 1.1, w: 6.6, h: 1.9, text: s.title, size: 50, bold: true });
    T({ x: 0.6, y: 3.2, w: 6.4, h: 1.2, text: s.sub, size: 22, color: C.mute });
    T({ x: 0.6, y: 4.7, w: 6.4, h: 1.6, text: s.bullets.join('\n'), size: 16, color: C.gold });
    for (const r of s.images) await size(r);
    s.images.forEach((r, k) => el.push({ type: 'img', src: r, ...fit(r, 7.4 + k * 1.85, 1.5 + (k % 2) * 0.7, 1.75, 3.8) }));
  } else {
    T({ x: 0.6, y: 0.85, w: s.layout === 'split' ? 6.2 : 12, h: s.layout === 'split' ? 1.5 : 0.9, text: s.title, size: 34, bold: true });
  }
  if (s.layout === 'split') {
    await size(s.img);
    T({ x: 0.6, y: 2.6, w: 6.0, h: 3.9, text: s.bullets.map((b) => '•  ' + b).join('\n'), size: 20, color: C.text, para: 14 });
    el.push({ type: 'img', src: s.img, frame: true, ...fit(s.img, 7.1, 0.6, 5.7, 6.2) });
  }
  if (s.layout === 'gallery') {
    const n = s.imgs.length, gw = (W - 1.2 - (n - 1) * 0.3) / n;
    for (const r of s.imgs) await size(r);
    s.imgs.forEach((r, k) => {
      const x = 0.6 + k * (gw + 0.3);
      el.push({ type: 'img', src: r, frame: true, ...fit(r, x, 2.0, gw, 4.2) });
      T({ x, y: 6.3, w: gw, h: 0.4, text: s.caps[k], size: 16, color: C.gold, align: 'center', bold: true });
    });
  }
  if (s.layout === 'cols') {
    const n = s.cols.length, cw = (W - 1.2 - (n - 1) * 0.35) / n;
    s.cols.forEach((c, k) => {
      const x = 0.6 + k * (cw + 0.35);
      el.push({ type: 'box', x, y: 2.5, w: cw, h: 3.5, fill: C.card, line: C.line });
      el.push({ type: 'box', x, y: 2.5, w: cw, h: 0.08, fill: k === 1 ? C.gold : C.accent });
      T({ x: x + 0.3, y: 2.85, w: cw - 0.6, h: 0.6, text: c.h, size: 24, bold: true, color: C.gold });
      T({ x: x + 0.3, y: 3.6, w: cw - 0.6, h: 2.2, text: c.t, size: 20, color: C.text });
    });
  }
  return el;
}

// ---------- outputs ----------
async function buildPptx(name, slides, layouts) {
  const p = new PptxGenJS();
  p.layout = 'LAYOUT_WIDE'; p.title = name; p.author = 'Tharuneshwar S, Saransakthi N';
  layouts.forEach((els, i) => {
    const sl = p.addSlide(); sl.background = { color: C.bg };
    for (const e of els) {
      if (e.type === 'box') sl.addShape(p.ShapeType.rect, { x: e.x, y: e.y, w: e.w, h: e.h, fill: { color: e.fill }, line: e.line ? { color: e.line, width: 1 } : { type: 'none' } });
      if (e.type === 'img') sl.addImage({ path: path.join(ROOT, e.src), x: e.x, y: e.y, w: e.w, h: e.h });
      if (e.type === 'text') sl.addText(e.text, { x: e.x, y: e.y, w: e.w, h: e.h, fontFace: FONT, fontSize: e.size, color: e.color, bold: !!e.bold, align: e.align || 'left', valign: 'top', margin: 0, paraSpaceAfter: e.para || 4, fit: 'shrink' });
    }
    if (slides[i].notes) sl.addNotes(slides[i].notes);
  });
  await p.writeFile({ fileName: path.join(OUT, name + '.pptx') });
}
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function html(layouts, rel) {
  const pages = layouts.map((els) => '<section>' + els.map((e) => {
    const pos = `left:${e.x * PX}px;top:${e.y * PX}px;width:${e.w * PX}px;height:${e.h * PX}px`;
    if (e.type === 'box') return `<div style="${pos};background:#${e.fill}${e.line ? `;outline:1px solid #${e.line}` : ''}"></div>`;
    if (e.type === 'img') return `<img src="${rel(e.src)}" style="${pos}"${e.frame ? ' class="f"' : ''}>`;
    return `<div class="t" style="${pos};font-size:${e.size * PX / 72}px;color:#${e.color};font-weight:${e.bold ? 700 : 400};text-align:${e.align || 'left'}">${esc(e.text).replace(/\n/g, `<br><span style="display:block;height:${(e.para || 4) * PX / 72}px"></span>`)}</div>`;
  }).join('') + '</section>').join('\n');
  return `<!doctype html><meta charset="utf-8"><style>
@page{size:${W * PX}px ${H * PX}px;margin:0}*{margin:0;box-sizing:border-box}
body{background:#${C.bg};font-family:'${FONT}',sans-serif}
section{position:relative;width:${W * PX}px;height:${H * PX}px;overflow:hidden;background:#${C.bg};page-break-after:always}
section>*{position:absolute}.t{line-height:1.2;overflow:visible}img.f{border-radius:10px;box-shadow:0 10px 40px #0008}
</style>${pages}`;
}

const decks = [['DeskCharm-Deck-Users', users], ['DeskCharm-Deck-Investors', investors], ['DeskCharm-Deck-Companies', companies]];
const render = !process.argv.includes('--no-render');
let runs = 0;
const edge = (args) => {
  const profile = path.join(os.tmpdir(), `deskcharm-pitch-edge-${process.pid}-${runs++}`);
  try { execFileSync(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--force-device-scale-factor=1', `--user-data-dir=${profile}`, ...args], { stdio: 'ignore', timeout: 60000 }); } catch { /* Edge sometimes lingers after writing output */ }
};
for (const [name, slides] of decks) {
  const layouts = [];
  for (let i = 0; i < slides.length; i++) layouts.push(await layout(slides[i], i, slides.length));
  await buildPptx(name, slides, layouts);
  const htmlPath = path.join(OUT, name + '.html');
  fs.writeFileSync(htmlPath, html(layouts, (r) => path.relative(OUT, path.join(ROOT, r)).replace(/\\/g, '/')));
  if (!render) continue;
  edge(['--no-pdf-header-footer', `--print-to-pdf=${path.join(OUT, name + '.pdf')}`, pathToFileURL(htmlPath).href]);
  const pngDir = path.join(OUT, 'png', name); fs.mkdirSync(pngDir, { recursive: true });
  const sheet = path.join(pngDir, '_all.png');
  edge([`--screenshot=${sheet}`, `--window-size=1280,${720 * layouts.length}`, '--hide-scrollbars', pathToFileURL(htmlPath).href]);
  for (let i = 0; i < layouts.length; i++) {
    await sharp(sheet).extract({ left: 0, top: i * 720, width: 1280, height: 720 }).toFile(path.join(pngDir, `slide-${String(i + 1).padStart(2, '0')}.png`));
  }
  fs.rmSync(sheet);
  console.log(name, slides.length, 'slides');
}
// One-pager PDF from the markdown
if (render) {
  const { marked } = await import('marked');
  const md = fs.readFileSync(path.join(OUT, 'DeskCharm-OnePager.md'), 'utf8');
  const op = path.join(OUT, 'DeskCharm-OnePager.html');
  fs.writeFileSync(op, `<!doctype html><meta charset="utf-8"><style>@page{size:A4;margin:0}body{margin:0;padding:48px 54px;background:#${C.bg};color:#${C.text};font:14.5px/1.5 '${FONT}',sans-serif;-webkit-print-color-adjust:exact}
h1{font-size:34px;margin:0}h1+p{color:#${C.gold};font-size:16px;margin:4px 0 12px}h2{color:#${C.gold};font-size:16px;margin:20px 0 4px;text-transform:uppercase;letter-spacing:.04em}
p,ul{margin:3px 0}li{margin:1px 0}strong{color:#fff}a{color:#8fa2ff}img{height:70px;float:right;margin-left:8px}html{background:#${C.bg};-webkit-print-color-adjust:exact}</style>
<img src="../../src/friends-vijay.png"><img src="../../src/temple-bell.png"><img src="../../src/nazar-blue.png">${marked(md)}`);
  edge(['--no-pdf-header-footer', `--print-to-pdf=${path.join(OUT, 'DeskCharm-OnePager.pdf')}`, pathToFileURL(op).href]);
  edge([`--screenshot=${path.join(OUT, 'png', 'onepager.png')}`, '--window-size=794,1123', '--hide-scrollbars', pathToFileURL(op).href]);
}
