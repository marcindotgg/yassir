import { browser, defineBackground } from '#imports';
import { getSets } from '../src/background/sets';
import type { SetsRequest, SetsResponse } from '../src/messaging';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (response: SetsResponse) => void) => {
    const request = message as SetsRequest | undefined;
    if (request?.type !== 'sets:list') return false;
    void getSets(request.force === true).then(sendResponse);
    return true; // keeps the channel open for the async response
  });

  browser.runtime.onInstalled.addListener(() => void getSets().catch(() => {}));
});
