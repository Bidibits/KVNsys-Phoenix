// The shared vocabulary between the API and the web apps: every request body and every
// reply, defined once. The API validates against these; the client parses replies with them.
export * from './identity.js';
export * from './devices.js';
export * from './errors.js';
