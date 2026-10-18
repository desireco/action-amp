/**
 * "Add to ActionAmp" — the toolbar capture. Same flow as the bookmarklet
 * (#21): on click (or the Alt+Shift+A command, which is the built-in
 * _execute_action and fires the same onClicked), read the active tab's
 * title/URL + any text selection, and open the /share review tab. The
 * review page owns the confirm; nothing is captured until then.
 *
 * activeTab grants both the tab read and the one-shot selection injection
 * on the clicked tab — no broad host permission.
 */
import { DEFAULT_ORIGIN, shareUrl } from "./capture.js";

async function targetOrigin() {
  const { origin } = await chrome.storage.sync.get({ origin: DEFAULT_ORIGIN });
  return origin;
}

chrome.action.onClicked.addListener(async (tab) => {
  const origin = await targetOrigin();
  let text = "";
  if (tab.id != null) {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => String(window.getSelection()).trim(),
      });
      text = result?.result ?? "";
    } catch {
      // Injection is blocked on chrome://, the Web Store, file:// without
      // the grant — capture title+URL without the selection.
    }
  }
  await chrome.tabs.create({
    url: shareUrl({ origin, title: tab.title, url: tab.url, text }),
  });
});
