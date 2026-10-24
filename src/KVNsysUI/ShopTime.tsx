import { ShopTimeZone } from '@kvnsys/core';

const Formats = {
  dateTime: new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: ShopTimeZone }),
  time: new Intl.DateTimeFormat('en-PH', { timeStyle: 'short', timeZone: ShopTimeZone }),
};

/** A moment by the shop's clock (Philippine time), whatever time zone this PC is set to: "Oct 24, 2026, 2:30 PM". */
export function ShopTime({ at, show = 'dateTime' }: { at: string; show?: keyof typeof Formats }) {
  return <time dateTime={at}>{Formats[show].format(new Date(at))}</time>;
}
