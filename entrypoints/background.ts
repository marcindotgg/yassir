import { browser, defineBackground } from '#imports';
import { getSets } from '../src/background/sets';
import type { SetsRequest, SetsResponse } from '../src/messaging';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (r: SetsResponse) => void) => {
    if ((message as SetsRequest | undefined)?.type !== 'sets:list') return false;
    const force = (message as SetsRequest).force === true;
    // Returning true keeps the channel open for the async reply.
    void getSets(force).then(sendResponse);
    return true;
  });

  // Warm the cache once after install/update so the first dropdown is instant.
  browser.runtime.onInstalled.addListener(() => void getSets().catch(() => {}));
});
