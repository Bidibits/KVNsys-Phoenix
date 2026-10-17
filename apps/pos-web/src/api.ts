import { PhoenixApi } from '@phoenix/api-client';

/** The one API client the screens share. Talks to the same origin that served the page. */
export const api = new PhoenixApi();
