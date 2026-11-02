import { BusinessTimeZone } from '@kvnsys/core';

const Formats = {
  dateTime: new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: BusinessTimeZone }),
  time: new Intl.DateTimeFormat('en-PH', { timeStyle: 'short', timeZone: BusinessTimeZone }),
};

/** A moment by the business's clock (Philippine time), whatever time zone this PC is set to: "Oct 24, 2026, 2:30 PM". */
export function BusinessTime({ at, show = 'dateTime' }: { at: string; show?: keyof typeof Formats }) {
  return <time dateTime={at}>{Formats[show].format(new Date(at))}</time>;
}
