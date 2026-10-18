// Options: the target origin (chrome.storage.sync), prod by default.
import { DEFAULT_ORIGIN } from "./capture.js";

const input = document.getElementById("origin");
const status = document.getElementById("status");

document.addEventListener("DOMContentLoaded", async () => {
  const { origin } = await chrome.storage.sync.get({ origin: DEFAULT_ORIGIN });
  input.value = origin;
});

document.getElementById("save").addEventListener("click", async () => {
  const value = input.value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/.+/.test(value)) {
    status.textContent = "Use a full address like https://app.actionamp.com";
    status.style.color = "#dc2626";
    return;
  }
  await chrome.storage.sync.set({ origin: value });
  status.textContent = "Saved.";
  status.style.color = "#0d9488";
  setTimeout(() => (status.textContent = ""), 2000);
});
