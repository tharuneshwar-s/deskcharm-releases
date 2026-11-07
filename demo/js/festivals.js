// Festival date table (local calendar dates, inclusive windows) used by the overlay decorations
// and the Settings panel. Lunar festivals move every year, so they are listed explicitly for
// 2026–2028; Christmas and New Year repeat on fixed dates.
//
// Sources (checked Oct 2026): Drik Panchang / timeanddate.com (Navratri, Holi, Diwali, Pongal),
// publicholidays.in (Diwali Lakshmi Puja 2027/2028), Wikipedia + Gulf astronomy projections
// (Eid). Eid dates depend on moon sighting and can shift by a day by country, so each Eid
// window spans the expected day and the day after (Eid is celebrated over 2–3 days anyway).

export const FESTIVALS = [
    {
        // Bhogi → Thai Pongal / Makar Sankranti → Mattu Pongal → Kaanum Pongal
        id: 'pongal', name: 'Pongal / Makar Sankranti',
        windows: [['2026-01-13', '2026-01-16'], ['2027-01-14', '2027-01-17'], ['2028-01-14', '2028-01-17']],
    },
    {
        // Holika Dahan → Rangwali Holi
        id: 'holi', name: 'Holi',
        windows: [['2026-03-02', '2026-03-04'], ['2027-03-21', '2027-03-22'], ['2028-03-10', '2028-03-11']],
    },
    {
        id: 'eid', name: 'Eid al-Fitr',
        windows: [['2026-03-20', '2026-03-22'], ['2027-03-09', '2027-03-11'], ['2028-02-26', '2028-02-28']],
    },
    {
        id: 'eid', name: 'Eid al-Adha',
        windows: [['2026-05-27', '2026-05-29'], ['2027-05-16', '2027-05-18'], ['2028-05-04', '2028-05-06']],
    },
    {
        // Sharad Navratri: Ghatasthapana → Maha Navami (nine nights)
        id: 'navratri', name: 'Navratri',
        windows: [['2026-10-11', '2026-10-19'], ['2027-09-30', '2027-10-08'], ['2028-09-19', '2028-09-27']],
    },
    {
        // Lakshmi Puja (2026-11-08, 2027-10-29, 2028-10-17) ± 2 days
        id: 'diwali', name: 'Diwali',
        windows: [['2026-11-06', '2026-11-10'], ['2027-10-27', '2027-10-31'], ['2028-10-15', '2028-10-19']],
    },
    { id: 'christmas', name: 'Christmas', yearly: ['12-24', '12-25'] },
    { id: 'newyear', name: 'New Year', yearly: ['12-31', '01-01'] },
];

/** Every decoration id, for previews. */
export const FESTIVAL_IDS = [...new Set(FESTIVALS.map((f) => f.id))];

const pad = (n) => String(n).padStart(2, '0');

/** Local calendar date as 'YYYY-MM-DD' (string comparison = date comparison). */
export function dateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Concrete [start, end] windows of a festival that could touch `year` (fixed dates expanded). */
function windowsAround(f, year) {
    if (f.windows) return f.windows;
    const [a, b] = f.yearly;
    // A window that wraps the year end (Dec 31 → Jan 1) starts in the previous or current year.
    if (b < a) return [year - 1, year].map((y) => [`${y}-${a}`, `${y + 1}-${b}`]);
    return [year, year + 1].map((y) => [`${y}-${a}`, `${y}-${b}`]);
}

function parseKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/** Festival active on `date` (local), or null: { id, name, start: Date, end: Date }. */
export function activeFestival(date = new Date()) {
    const key = dateKey(date);
    for (const f of FESTIVALS) {
        for (const [start, end] of windowsAround(f, date.getFullYear())) {
            if (key >= start && key <= end) return { id: f.id, name: f.name, start: parseKey(start), end: parseKey(end) };
        }
    }
    return null;
}

/** Next festival starting after `date`, or null when the table has run out. */
export function nextFestival(date = new Date()) {
    const key = dateKey(date);
    let best = null;
    for (const f of FESTIVALS) {
        for (const [start, end] of windowsAround(f, date.getFullYear())) {
            if (start > key && (!best || start < best.startKey)) best = { id: f.id, name: f.name, startKey: start, endKey: end };
        }
    }
    return best && { id: best.id, name: best.name, start: parseKey(best.startKey), end: parseKey(best.endKey) };
}
