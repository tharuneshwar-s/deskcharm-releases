// The one place the licence API base URL is set.
// Production: https://api.deskcharm.in. When the site is served from localhost, use the local `wrangler dev` Worker.
window.DESKCHARM_API = window.DESKCHARM_API || (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://127.0.0.1:8787' : 'https://api.deskcharm.in');
