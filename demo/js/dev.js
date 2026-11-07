// True in development (tauri dev serves the app from 127.0.0.1; test harnesses use localhost).
// The installed app is served from tauri.localhost, so console helpers stay out of releases.
export const DEV = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
