// Charm catalog, shared by the settings window and loadable by the overlay.
// Classic script (no module): `<script src="charms.js"></script>` defines window.DeskCharmCatalog.
//
// Each charm: id (stable, saved in config), name, image (PNG next to this file), weight
// (light|medium|heavy|massive → rope mass), rope / ropeHi (rope colours), rs (rope style:
// rope|chain|thread|wire|braid|dotted|thick|dashed), beadType (evil-eye|gem|metal|glow|crystal|
// wood|pearl|ornate), beadColors (3 colours fed to the bead template), beadSmall (side beads).
// eye (charms with a painted eye only; features/living.js): cx, cy, r = centre and radius of the
// white; ix, iy, iris = centre and radius of the iris; pupil = pupil radius; all fractions of the
// (square) image width, circle-fitted to edges measured in the PNG; color = iris colour from the PNG.
// eye { type: 'cat', … } instead: a character with a blank painted face drawn by living.js (see catFaceOf there).
// Art for the new packs is supplied separately (see CHARM-ART.md); the settings window only
// shows a category once at least one of its images loads, and hides charms whose image is missing.
(function() {
    var categories = [
        {
            id: 'nazar', name: 'Nazar', label: 'Nazar', icon: '🧿',
            charms: [
                { id: 'nazar-blue', name: 'Classic Blue', image: 'nazar-blue.png', weight: 'medium', rope: '#6B4423', ropeHi: '#b58b5c', rs: 'rope', outer: '#2140bf', mid: '#73ccfa', inner: '#0d0d1a', beadType: 'evil-eye', beadColors: ['#2140bf', '#73ccfa', '#0d0d1a'], beadSmall: '#e9ebf2', eye: { cx: 0.4934, cy: 0.5715, r: 0.1903, ix: 0.4952, iy: 0.5735, iris: 0.1223, pupil: 0.0642, color: '#5ccdf2' } },
                { id: 'nazar-gold', name: 'Gold', image: 'nazar-gold.png', weight: 'heavy', rope: '#8B6914', ropeHi: '#d4a840', rs: 'chain', outer: '#c9952a', mid: '#f5d77a', inner: '#3d2e08', beadType: 'evil-eye', beadColors: ['#c9952a', '#f5d77a', '#3d2e08'], beadSmall: '#f5e6c0', eye: { cx: 0.4966, cy: 0.5518, r: 0.1996, ix: 0.4966, iy: 0.5568, iris: 0.1243, pupil: 0.0634, color: '#4bd4fa' } },
                { id: 'nazar-green', name: 'Emerald', image: 'nazar-green.png', weight: 'medium', rope: '#2d5e3a', ropeHi: '#5da87a', rs: 'thread', outer: '#1a8c4e', mid: '#80e8b0', inner: '#0a3d1e', beadType: 'evil-eye', beadColors: ['#1a8c4e', '#80e8b0', '#0a3d1e'], beadSmall: '#c0f5d8', eye: { cx: 0.4975, cy: 0.5343, r: 0.1956, ix: 0.4985, iy: 0.5376, iris: 0.1222, pupil: 0.0669, color: '#7bd7ac' } },
                { id: 'nazar-ruby', name: 'Ruby', image: 'nazar-ruby.png', weight: 'medium', rope: '#6B2323', ropeHi: '#b55c5c', rs: 'braid', outer: '#bf2121', mid: '#fa7373', inner: '#3d0808', beadType: 'evil-eye', beadColors: ['#bf2121', '#fa7373', '#3d0808'], beadSmall: '#f5c0c0' },
                { id: 'nazar-purple', name: 'Amethyst', image: 'nazar-amethyst.png', weight: 'medium', rope: '#4B2368', ropeHi: '#8a5cb5', rs: 'dotted', outer: '#7a2abf', mid: '#c87aff', inner: '#2a0a4a', beadType: 'evil-eye', beadColors: ['#7a2abf', '#c87aff', '#2a0a4a'], beadSmall: '#e0c0f5' },
                { id: 'nazar-white', name: 'Pearl', image: 'nazar-pearl.png', weight: 'light', rope: '#6B6B6B', ropeHi: '#a0a0a0', rs: 'thread', outer: '#b0a8c0', mid: '#f0e8ff', inner: '#6a6070', beadType: 'pearl', beadColors: ['#b0a8c0', '#f0e8ff', '#e0d8f0'], beadSmall: '#f0f0f5' },
                { id: 'nazar-black', name: 'Obsidian', image: 'nazar-obsidian.png', weight: 'heavy', rope: '#2a2a2a', ropeHi: '#555', rs: 'thick', outer: '#1a1a2a', mid: '#6a6a8a', inner: '#0a0a15', beadType: 'crystal', beadColors: ['#1a1a2a', '#4a4a6a', '#0a0a15'], beadSmall: '#3a3a4a' },
                { id: 'nazar-rainbow', name: 'Prismatic', image: 'nazar-prismatic.png', weight: 'medium', rope: '#6B4460', ropeHi: '#b58ca0', rs: 'dashed', outer: '#8a3abf', mid: '#ffaa55', inner: '#2a1a4a', beadType: 'glow', beadColors: ['#8a3abf', '#ffaa55', '#ff55aa'], beadSmall: '#e0c0f0' },
                { id: 'nazar-hamsa', name: 'Hamsa Hand', image: 'nazar-hamsa.png', weight: 'medium', rope: '#5a4a2a', ropeHi: '#8a7a5a', rs: 'braid', outer: '#2140bf', mid: '#73ccfa', inner: '#0d0d1a', beadType: 'evil-eye', beadColors: ['#1a3a8a', '#4090cc', '#0d0d2a'], beadSmall: '#c8c0a0', eye: { cx: 0.4978, cy: 0.4921, r: 0.0574, ix: 0.4985, iy: 0.4932, iris: 0.0360, pupil: 0.0188, color: '#24b1de' } },
                { id: 'nazar-lemon', name: 'Nimbu Mirchi', image: 'nazar-lemon.png', weight: 'medium', rope: '#8a6a1a', ropeHi: '#c8a840', rs: 'braid', outer: '#c9952a', mid: '#f5d77a', inner: '#3d2e08', beadType: 'ornate', beadColors: ['#cc4020', '#ffa040', '#8a3010'], beadSmall: '#d4a840' }
            ]
        },
        {
            id: 'gods', name: 'Indian Gods', label: 'Gods', icon: '🙏',
            charms: [
                { id: 'gods-ganesha', name: 'Ganesha', image: 'gods-ganesha.png', weight: 'heavy', rope: '#5a3a1a', ropeHi: '#8a6a3a', rs: 'braid', beadType: 'ornate', beadColors: ['#cc4040', '#ffa040', '#8a2020'], beadSmall: '#cc4040' },
                { id: 'gods-om', name: 'Om Symbol', image: 'gods-om.png', weight: 'medium', rope: '#4a3020', ropeHi: '#7a5a40', rs: 'rope', beadType: 'ornate', beadColors: ['#c89030', '#d4a840', '#6a4a1a'], beadSmall: '#cc4040' },
                { id: 'gods-vel', name: "Murugan's Vel", image: 'gods-vel.png', weight: 'heavy', rope: '#4a3020', ropeHi: '#7a5a40', rs: 'rope', beadType: 'gem', beadColors: ['#cc4020', '#d4a840', '#6a2010'], beadSmall: '#c8a840' },
                { id: 'gods-veeran', name: 'Madurai Veeran', image: 'gods-veeran.png', weight: 'massive', rope: '#4a3020', ropeHi: '#7a5a40', rs: 'braid', beadType: 'gem', beadColors: ['#cc3020', '#d4a840', '#5a1a10'], beadSmall: '#cc4040' },
                { id: 'gods-mahakala', name: 'Mahakala', image: 'gods-mahakala.png', weight: 'heavy', rope: '#4a3020', ropeHi: '#7a5a40', rs: 'thick', beadType: 'metal', beadColors: ['#cc3030', '#d4a840', '#4a1a1a'], beadSmall: '#cc4040' },
                { id: 'gods-bell', name: 'Temple Bell', image: 'gods-bell.png', weight: 'heavy', rope: '#5a3020', ropeHi: '#8a5a40', rs: 'braid', beadType: 'pearl', beadColors: ['#cc4040', '#f0e0d0', '#c89060'], beadSmall: '#cc4040' },
                { id: 'gods-peacock', name: 'Peacock', image: 'gods-peacock.png', weight: 'medium', rope: '#5a4a2a', ropeHi: '#8a7a4a', rs: 'chain', beadType: 'gem', beadColors: ['#1a3a8a', '#d4a840', '#0a2060'], beadSmall: '#2a4a8a' },
                { id: 'gods-knot', name: 'Lucky Knot', image: 'gods-knot.png', weight: 'medium', rope: '#8a1a1a', ropeHi: '#cc3a3a', rs: 'braid', beadType: 'ornate', beadColors: ['#cc2020', '#ffa030', '#8a1010'], beadSmall: '#c8a840' }
            ]
        },
        {
            // Rope and beads follow the sign's element: fire = red braid + garnet gems,
            // earth = brown cord + wood, air = silver thread + pearls, water = fine wire + glass.
            id: 'zodiac', name: 'Zodiac', label: 'Zodiac', icon: '♈',
            charms: [
                { id: 'zodiac-aries', name: 'Aries', image: 'zodiac-aries.png', weight: 'medium', rope: '#7a2418', ropeHi: '#c85a40', rs: 'braid', beadType: 'gem', beadColors: ['#c8321e', '#ffb070', '#5a1008'], beadSmall: '#e8a050' },
                { id: 'zodiac-taurus', name: 'Taurus', image: 'zodiac-taurus.png', weight: 'heavy', rope: '#5a3e22', ropeHi: '#94704a', rs: 'thick', beadType: 'wood', beadColors: ['#7a5230', '#d8b080', '#3a2410'], beadSmall: '#6a8a4a' },
                { id: 'zodiac-gemini', name: 'Gemini', image: 'zodiac-gemini.png', weight: 'light', rope: '#7a7a88', ropeHi: '#c8c8d8', rs: 'thread', beadType: 'pearl', beadColors: ['#c8c0d8', '#fffaf0', '#f0e8a0'], beadSmall: '#f2eedc' },
                { id: 'zodiac-cancer', name: 'Cancer', image: 'zodiac-cancer.png', weight: 'medium', rope: '#8a8f9a', ropeHi: '#d8dde8', rs: 'wire', beadType: 'glow', beadColors: ['#6ab0e0', '#d8f0ff', '#ffffff'], beadSmall: '#e8eef8' },
                { id: 'zodiac-leo', name: 'Leo', image: 'zodiac-leo.png', weight: 'heavy', rope: '#8B6914', ropeHi: '#e0b450', rs: 'chain', beadType: 'gem', beadColors: ['#e09a1a', '#fff0a0', '#7a4a08'], beadSmall: '#f0c040' },
                { id: 'zodiac-virgo', name: 'Virgo', image: 'zodiac-virgo.png', weight: 'medium', rope: '#4e5a32', ropeHi: '#8a9a5a', rs: 'rope', beadType: 'wood', beadColors: ['#8a6a3a', '#e0c890', '#4a3418'], beadSmall: '#b8c890' },
                { id: 'zodiac-libra', name: 'Libra', image: 'zodiac-libra.png', weight: 'medium', rope: '#9a8a9a', ropeHi: '#e0d0e8', rs: 'thread', beadType: 'pearl', beadColors: ['#e0b8c8', '#fff4f8', '#f0d0e0'], beadSmall: '#f8e8f0' },
                { id: 'zodiac-scorpio', name: 'Scorpio', image: 'zodiac-scorpio.png', weight: 'heavy', rope: '#3a1a2a', ropeHi: '#7a3a5a', rs: 'wire', beadType: 'crystal', beadColors: ['#5a1030', '#c04070', '#200810'], beadSmall: '#8a2a4a' },
                { id: 'zodiac-sagittarius', name: 'Sagittarius', image: 'zodiac-sagittarius.png', weight: 'medium', rope: '#5a2a5a', ropeHi: '#a05aa0', rs: 'braid', beadType: 'gem', beadColors: ['#7a2a9a', '#f0a050', '#30103a'], beadSmall: '#d890e0' },
                { id: 'zodiac-capricorn', name: 'Capricorn', image: 'zodiac-capricorn.png', weight: 'heavy', rope: '#3a3a3a', ropeHi: '#7a7a72', rs: 'thick', beadType: 'metal', beadColors: ['#5a5a58', '#c8c8c0', '#202020'], beadSmall: '#8a8a80' },
                { id: 'zodiac-aquarius', name: 'Aquarius', image: 'zodiac-aquarius.png', weight: 'light', rope: '#3a6a8a', ropeHi: '#8ac8e8', rs: 'thread', beadType: 'glow', beadColors: ['#2a8ad0', '#a0e8ff', '#ffffff'], beadSmall: '#c0eaff' },
                { id: 'zodiac-pisces', name: 'Pisces', image: 'zodiac-pisces.png', weight: 'light', rope: '#2a5a6a', ropeHi: '#6ab0c0', rs: 'wire', beadType: 'glow', beadColors: ['#3a9aa8', '#b0f0f0', '#e8ffff'], beadSmall: '#a0e0e8' }
            ]
        },
        {
            // Wire-wrapped stones, with matching crystal beads.
            id: 'crystals', name: 'Crystals & gems', label: 'Crystals', icon: '💎',
            charms: [
                { id: 'crystal-amethyst', name: 'Amethyst Point', image: 'crystal-amethyst.png', weight: 'medium', rope: '#5a5060', ropeHi: '#b0a8c0', rs: 'wire', beadType: 'crystal', beadColors: ['#8a4ac8', '#e0b8ff', '#3a1060'], beadSmall: '#c8a0f0' },
                { id: 'crystal-rose-quartz', name: 'Rose Quartz', image: 'crystal-rose-quartz.png', weight: 'medium', rope: '#9a6a5a', ropeHi: '#e8b8a0', rs: 'wire', beadType: 'crystal', beadColors: ['#f0a8b8', '#fff0f4', '#a05868'], beadSmall: '#f8d0d8' },
                { id: 'crystal-clear-quartz', name: 'Clear Quartz', image: 'crystal-clear-quartz.png', weight: 'light', rope: '#8a8a92', ropeHi: '#e8e8f0', rs: 'wire', beadType: 'crystal', beadColors: ['#d8e4f0', '#ffffff', '#8898a8'], beadSmall: '#f0f4fa' },
                { id: 'crystal-citrine', name: 'Citrine Cluster', image: 'crystal-citrine.png', weight: 'medium', rope: '#8B6914', ropeHi: '#e0b450', rs: 'wire', beadType: 'crystal', beadColors: ['#e8a828', '#fff0a8', '#7a4a08'], beadSmall: '#f8d878' },
                { id: 'crystal-tigers-eye', name: "Tiger's Eye", image: 'crystal-tigers-eye.png', weight: 'heavy', rope: '#6a4a22', ropeHi: '#b08a4a', rs: 'wire', beadType: 'gem', beadColors: ['#a0641e', '#f0c060', '#3a2008'], beadSmall: '#c8903a' },
                { id: 'crystal-obsidian', name: 'Obsidian', image: 'crystal-obsidian.png', weight: 'heavy', rope: '#3a3a40', ropeHi: '#8a8a94', rs: 'wire', beadType: 'crystal', beadColors: ['#1a1a20', '#5a5a6a', '#000000'], beadSmall: '#3a3a42' },
                { id: 'crystal-lapis', name: 'Lapis Lazuli', image: 'crystal-lapis.png', weight: 'heavy', rope: '#8B6914', ropeHi: '#e0b450', rs: 'wire', beadType: 'gem', beadColors: ['#1e3a9a', '#e0c060', '#0a1440'], beadSmall: '#3a5ac0' },
                { id: 'crystal-moonstone', name: 'Moonstone', image: 'crystal-moonstone.png', weight: 'light', rope: '#8a8a92', ropeHi: '#e0e0ea', rs: 'wire', beadType: 'glow', beadColors: ['#a8b8e0', '#f0f4ff', '#ffffff'], beadSmall: '#e0e8f8' }
            ]
        },
        {
            // Brass temple pieces on brass chains with metal beads; the bell and lamp hang heavy.
            id: 'temple', name: 'Temple', label: 'Temple', icon: '🔔',
            charms: [
                { id: 'temple-bell', name: 'Temple Bell', image: 'temple-bell.png', weight: 'heavy', rope: '#8B6914', ropeHi: '#e0b450', rs: 'chain', beadType: 'metal', beadColors: ['#c8962a', '#f8e090', '#5a3a08'], beadSmall: '#d8a840' },
                { id: 'temple-diya', name: 'Brass Diya', image: 'temple-diya.png', weight: 'medium', rope: '#8B6914', ropeHi: '#e0b450', rs: 'chain', beadType: 'metal', beadColors: ['#c8962a', '#ffd080', '#5a3a08'], beadSmall: '#f0a040' },
                { id: 'temple-kalash', name: 'Brass Kalash', image: 'temple-kalash.png', weight: 'heavy', rope: '#8B6914', ropeHi: '#e0b450', rs: 'chain', beadType: 'metal', beadColors: ['#c8962a', '#f8e090', '#5a3a08'], beadSmall: '#5a8a3a' },
                { id: 'temple-om', name: 'Brass Om', image: 'temple-om.png', weight: 'medium', rope: '#8B6914', ropeHi: '#e0b450', rs: 'chain', beadType: 'metal', beadColors: ['#c8962a', '#f8e090', '#5a3a08'], beadSmall: '#d8a840' },
                { id: 'temple-trishul', name: 'Trishul', image: 'temple-trishul.png', weight: 'medium', rope: '#8B6914', ropeHi: '#e0b450', rs: 'chain', beadType: 'metal', beadColors: ['#c8962a', '#f8e090', '#5a3a08'], beadSmall: '#d8a840' },
                { id: 'temple-rudraksha', name: 'Rudraksha', image: 'temple-rudraksha.png', weight: 'medium', rope: '#8a1a1a', ropeHi: '#cc3a3a', rs: 'braid', beadType: 'wood', beadColors: ['#7a3a1a', '#c8804a', '#3a1808'], beadSmall: '#d8a840' },
                { id: 'temple-elephant', name: 'Temple Elephant', image: 'temple-elephant.png', weight: 'heavy', rope: '#8B6914', ropeHi: '#e0b450', rs: 'chain', beadType: 'ornate', beadColors: ['#c8962a', '#f8e090', '#5a3a08'], beadSmall: '#d8a840' },
                { id: 'temple-lotus', name: 'Brass Lotus', image: 'temple-lotus.png', weight: 'medium', rope: '#8B6914', ropeHi: '#e0b450', rs: 'chain', beadType: 'metal', beadColors: ['#c8962a', '#f8e090', '#5a3a08'], beadSmall: '#d8a840' }
            ]
        },
        {
            // One per month; each stone sits in a silver bezel on a fine silver chain with beads in its own colour.
            id: 'birthstones', name: 'Birthstones', label: 'Birthstones', icon: '💍',
            charms: [
                { id: 'birthstone-garnet', name: 'Garnet · Jan', image: 'birthstone-garnet.png', weight: 'medium', rope: '#8a8a92', ropeHi: '#e0e0ea', rs: 'chain', beadType: 'gem', beadColors: ['#8a1424', '#f07080', '#3a0610'], beadSmall: '#eceaf4' },
                { id: 'birthstone-amethyst', name: 'Amethyst · Feb', image: 'birthstone-amethyst.png', weight: 'medium', rope: '#8a8a92', ropeHi: '#e0e0ea', rs: 'chain', beadType: 'gem', beadColors: ['#7a3ab8', '#e0b0ff', '#300a50'], beadSmall: '#eceaf4' },
                { id: 'birthstone-aquamarine', name: 'Aquamarine · Mar', image: 'birthstone-aquamarine.png', weight: 'light', rope: '#8a8a92', ropeHi: '#e0e0ea', rs: 'chain', beadType: 'gem', beadColors: ['#5ac0d8', '#e0fbff', '#1a6a80'], beadSmall: '#eceaf4' },
                { id: 'birthstone-diamond', name: 'Diamond · Apr', image: 'birthstone-diamond.png', weight: 'light', rope: '#9a9aa2', ropeHi: '#f0f0f8', rs: 'chain', beadType: 'crystal', beadColors: ['#e8f0ff', '#ffffff', '#a0b0c8'], beadSmall: '#f4f6fc' },
                { id: 'birthstone-emerald', name: 'Emerald · May', image: 'birthstone-emerald.png', weight: 'medium', rope: '#8a8a92', ropeHi: '#e0e0ea', rs: 'chain', beadType: 'gem', beadColors: ['#14805a', '#90f0c0', '#06301e'], beadSmall: '#eceaf4' },
                { id: 'birthstone-pearl', name: 'Pearl · Jun', image: 'birthstone-pearl.png', weight: 'light', rope: '#9a9aa2', ropeHi: '#f0f0f8', rs: 'thread', beadType: 'pearl', beadColors: ['#d8d0e0', '#fffaf4', '#f0e4f0'], beadSmall: '#f8f4f0' },
                { id: 'birthstone-ruby', name: 'Ruby · Jul', image: 'birthstone-ruby.png', weight: 'medium', rope: '#8a8a92', ropeHi: '#e0e0ea', rs: 'chain', beadType: 'gem', beadColors: ['#c0102a', '#ff8090', '#500010'], beadSmall: '#eceaf4' },
                { id: 'birthstone-peridot', name: 'Peridot · Aug', image: 'birthstone-peridot.png', weight: 'medium', rope: '#8a8a92', ropeHi: '#e0e0ea', rs: 'chain', beadType: 'gem', beadColors: ['#8ac030', '#e8ffa0', '#3a5a08'], beadSmall: '#eceaf4' },
                { id: 'birthstone-sapphire', name: 'Sapphire · Sep', image: 'birthstone-sapphire.png', weight: 'medium', rope: '#8a8a92', ropeHi: '#e0e0ea', rs: 'chain', beadType: 'gem', beadColors: ['#1a3aa8', '#90b0ff', '#081850'], beadSmall: '#eceaf4' },
                { id: 'birthstone-opal', name: 'Opal · Oct', image: 'birthstone-opal.png', weight: 'light', rope: '#9a9aa2', ropeHi: '#f0f0f8', rs: 'chain', beadType: 'glow', beadColors: ['#a0d8e8', '#ffd0f0', '#fff8d0'], beadSmall: '#f4f0fa' },
                { id: 'birthstone-topaz', name: 'Topaz · Nov', image: 'birthstone-topaz.png', weight: 'medium', rope: '#8a8a92', ropeHi: '#e0e0ea', rs: 'chain', beadType: 'gem', beadColors: ['#e09020', '#fff0a0', '#6a3a08'], beadSmall: '#eceaf4' },
                { id: 'birthstone-turquoise', name: 'Turquoise · Dec', image: 'birthstone-turquoise.png', weight: 'medium', rope: '#8a8a92', ropeHi: '#e0e0ea', rs: 'chain', beadType: 'pearl', beadColors: ['#30b0b0', '#a0f0e8', '#60d0c8'], beadSmall: '#eceaf4' }
            ]
        },
        {
            // Good-luck symbols from around the world.
            id: 'lucky', name: 'Lucky Charms', label: 'Lucky', icon: '🍀',
            charms: [
                { id: 'lucky-clover', name: 'Four-Leaf Clover', image: 'lucky-clover.png', weight: 'light', rope: '#2d5e3a', ropeHi: '#6ab880', rs: 'thread', beadType: 'glow', beadColors: ['#2a9a4a', '#a8f0b0', '#e8ffe8'], beadSmall: '#c0f0c8' },
                { id: 'lucky-hamsa', name: 'Hamsa', image: 'lucky-hamsa.png', weight: 'medium', rope: '#8a8a92', ropeHi: '#e0e0ea', rs: 'chain', beadType: 'evil-eye', beadColors: ['#2140bf', '#73ccfa', '#0d0d1a'], beadSmall: '#e9ebf2' },
                { id: 'lucky-maneki-neko', name: 'Maneki-neko', image: 'lucky-maneki-neko.png', weight: 'heavy', rope: '#a01a1a', ropeHi: '#e04a3a', rs: 'braid', beadType: 'metal', beadColors: ['#d8a830', '#fff0a0', '#6a4a08'], beadSmall: '#e04040' },
                { id: 'lucky-horseshoe', name: 'Horseshoe', image: 'lucky-horseshoe.png', weight: 'heavy', rope: '#5a3e22', ropeHi: '#94704a', rs: 'rope', beadType: 'metal', beadColors: ['#6a6a70', '#c8c8d0', '#2a2a30'], beadSmall: '#9a9aa0' },
                { id: 'lucky-dreamcatcher', name: 'Dreamcatcher', image: 'lucky-dreamcatcher.png', weight: 'light', rope: '#7a5a3a', ropeHi: '#c0a070', rs: 'dotted', beadType: 'wood', beadColors: ['#2a8a9a', '#e0f0f0', '#0a3a40'], beadSmall: '#e8e0d0' },
                { id: 'lucky-ladybug', name: 'Ladybug', image: 'lucky-ladybug.png', weight: 'light', rope: '#2a2a2a', ropeHi: '#606060', rs: 'thread', beadType: 'gem', beadColors: ['#d02020', '#ff9080', '#3a0606'], beadSmall: '#1a1a1a' },
                { id: 'lucky-acorn', name: 'Acorn', image: 'lucky-acorn.png', weight: 'medium', rope: '#5a3e22', ropeHi: '#94704a', rs: 'rope', beadType: 'wood', beadColors: ['#8a5a2a', '#e0b070', '#3a2410'], beadSmall: '#7a8a3a' },
                { id: 'lucky-elephant', name: 'Lucky Elephant', image: 'lucky-elephant.png', weight: 'massive', rope: '#6a1a3a', ropeHi: '#b04a70', rs: 'braid', beadType: 'ornate', beadColors: ['#c8962a', '#e04080', '#5a3a08'], beadSmall: '#d8a840' },
                { id: 'lucky-coin', name: 'Fortune Coin', image: 'lucky-coin.png', weight: 'medium', rope: '#b01a1a', ropeHi: '#f04a3a', rs: 'braid', beadType: 'metal', beadColors: ['#c8962a', '#f8e090', '#5a3a08'], beadSmall: '#e04040' },
                { id: 'lucky-key', name: 'Lucky Key', image: 'lucky-key.png', weight: 'medium', rope: '#6a5a3a', ropeHi: '#b0a070', rs: 'chain', beadType: 'metal', beadColors: ['#a08850', '#f0e0a0', '#3a2e10'], beadSmall: '#c8b070' }
            ]
        },
        {
            // Character figures. A face `eye` (type 'cat') is drawn by features/living.js over a blank painted face.
            id: 'friends', name: 'Friends', label: 'Friends', icon: '🐱',
            charms: [
                { id: 'friends-toro', name: 'Toro', image: 'toro-charm.png', weight: 'medium', rope: '#2a2a2e', ropeHi: '#9a9aa4', rs: 'chain', beadType: 'metal', beadColors: ['#2a2a34', '#c8c8d0', '#101016'], beadSmall: '#efe0c4', eye: { type: 'cat', aspect: 0.75, lx: 0.386, rx: 0.618, ey: 0.352, my: 0.405, w: 0.042, star: { u: 0.758, v: 0.29 }, ink: '#2a1e1a' } },
                { id: 'friends-kuro', name: 'Kuro', image: 'friends-kuro.png', weight: 'medium', rope: '#2a2a2e', ropeHi: '#9a9aa4', rs: 'chain', beadType: 'metal', beadColors: ['#c81e1e', '#f4f4f8', '#101016'], beadSmall: '#f4f4f8', eye: { type: 'cat', aspect: 0.75, lx: 0.386, rx: 0.618, ey: 0.352, my: 0.405, w: 0.042, star: { u: 0.707, v: 0.188 }, ink: '#f6f0e4' } },
                { id: 'friends-ganesha-toy', name: 'Baby Ganesha', image: 'friends-ganesha-toy.png', weight: 'medium', rope: '#c8501e', ropeHi: '#f8a050', rs: 'braid', beadType: 'ornate', beadColors: ['#e0a020', '#f87830', '#a0281e'], beadSmall: '#f8d860' },
                { id: 'friends-peachick', name: 'Peachick', image: 'friends-peachick.png', weight: 'light', rope: '#1e4aa0', ropeHi: '#60a0e0', rs: 'thread', beadType: 'glow', beadColors: ['#1e5ad0', '#30c0b0', '#e0b030'], beadSmall: '#a0e0e0' },
                { id: 'friends-temple-monkey', name: 'Temple Monkey', image: 'friends-temple-monkey.png', weight: 'medium', rope: '#6a4a2e', ropeHi: '#b08a60', rs: 'rope', beadType: 'wood', beadColors: ['#8a6040', '#f8a020', '#3a2814'], beadSmall: '#f8c040' },
                { id: 'friends-cow', name: 'Temple Cow', image: 'friends-cow.png', weight: 'medium', rope: '#b01a1a', ropeHi: '#f04a3a', rs: 'braid', beadType: 'metal', beadColors: ['#d0a030', '#f8f4ec', '#1e4ab0'], beadSmall: '#f8f4ec' },
                { id: 'friends-shiba', name: 'Shiba', image: 'friends-shiba.png', weight: 'medium', rope: '#c8701e', ropeHi: '#f0b070', rs: 'braid', beadType: 'glow', beadColors: ['#f0a040', '#fff0d0', '#c86010'], beadSmall: '#fff4e0' },
                { id: 'friends-panda', name: 'Panda', image: 'friends-panda.png', weight: 'medium', rope: '#2a2a2e', ropeHi: '#8a8a94', rs: 'braid', beadType: 'pearl', beadColors: ['#1a1a1e', '#f8f8f4', '#5ab040'], beadSmall: '#f8f8f4' },
                { id: 'friends-bunny', name: 'Bunny', image: 'friends-bunny.png', weight: 'light', rope: '#e8a0b4', ropeHi: '#ffd8e4', rs: 'thread', beadType: 'pearl', beadColors: ['#ffc0d0', '#fffaf8', '#f090a8'], beadSmall: '#fff0f4' },
                { id: 'friends-penguin', name: 'Penguin', image: 'friends-penguin.png', weight: 'medium', rope: '#1e2a50', ropeHi: '#5a6aa0', rs: 'braid', beadType: 'glow', beadColors: ['#d82020', '#ffd040', '#1e2a60'], beadSmall: '#f4f4f8' },
                { id: 'friends-axolotl', name: 'Axolotl', image: 'friends-axolotl.png', weight: 'light', rope: '#e06a98', ropeHi: '#ffb0d0', rs: 'thread', beadType: 'glow', beadColors: ['#ff80b0', '#ffe0f0', '#e04080'], beadSmall: '#ffd0e4' },
                { id: 'friends-vijay', name: 'Vijay', image: 'friends-vijay.png', weight: 'medium', rope: '#b01a1a', ropeHi: '#f04a3a', rs: 'braid', beadType: 'metal', beadColors: ['#d02020', '#f8f4ec', '#5a0a0a'], beadSmall: '#f8f4ec' },
                { id: 'friends-rajini', name: 'Rajini', image: 'friends-rajini.png', weight: 'medium', rope: '#1a1a1e', ropeHi: '#6a6a74', rs: 'chain', beadType: 'metal', beadColors: ['#1a1a1e', '#d8b050', '#0a0a0c'], beadSmall: '#d8b050' },
                { id: 'friends-ajith', name: 'Ajith', image: 'friends-ajith.png', weight: 'medium', rope: '#5a3a22', ropeHi: '#a07050', rs: 'rope', beadType: 'metal', beadColors: ['#8a8a90', '#e0e0e8', '#3a3a40'], beadSmall: '#c8c8d0' },
                { id: 'friends-suriya', name: 'Suriya', image: 'friends-suriya.png', weight: 'medium', rope: '#1e4a8a', ropeHi: '#6a9ad0', rs: 'braid', beadType: 'metal', beadColors: ['#2a5aa0', '#c8daf0', '#0e2448'], beadSmall: '#e8eef8' },
                { id: 'friends-kamal', name: 'Kamal', image: 'friends-kamal.png', weight: 'medium', rope: '#8a6a4a', ropeHi: '#d8c0a0', rs: 'thread', beadType: 'wood', beadColors: ['#f0e8d8', '#8a5a3a', '#3a2a1a'], beadSmall: '#f4ecdc' },
                { id: 'friends-dhanush', name: 'Dhanush', image: 'friends-dhanush.png', weight: 'light', rope: '#3a5a8a', ropeHi: '#8aa8d0', rs: 'dotted', beadType: 'wood', beadColors: ['#4a6aa0', '#e0d0b0', '#1a2a48'], beadSmall: '#e8e0d0' }
            ]
        }
    ];

    /**
     * Charm 2 when "Two charms" is turned on with none chosen: the main charm's next sibling in
     * its category (Toro → Kuro), else Gold (Classic Blue when the main charm is Gold).
     */
    function defaultSecond(mainId) {
        for (var i = 0; i < categories.length; i++) {
            var list = categories[i].charms;
            for (var j = 0; j < list.length; j++) {
                if (list[j].id === mainId && list.length > 1) return list[(j + 1) % list.length];
            }
        }
        return categories[0].charms[mainId === 'nazar-gold' ? 0 : 1];
    }

    window.DeskCharmCatalog = {
        categories: categories,
        defaultSecond: defaultSecond,
        /** Rope and bead styling for user-added PNG charms (no matching art pack). */
        customStyle: { rope: '#6B4423', ropeHi: '#b58b5c', rs: 'rope', beadType: 'pearl', beadColors: ['#c8bca8', '#fbf6ec', '#e8dcc8'], beadSmall: '#ece6da' }
    };
})();
