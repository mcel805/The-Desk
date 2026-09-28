const mark = document.querySelector(".mark");
const tagline = document.querySelector("#brandTagline");
const rotationOrder = [
  { position: "0% 0%", description: "front-facing CLEO" },
  { position: "100% 0%", description: "head-tilted CLEO" },
  { position: "0% 100%", description: "curled-tail CLEO" },
  { position: "100% 100%", description: "CLEO turned away, showing her tabby back" },
];
const storageKeys = {
  active: "cleo-cat-active-index-v1",
  next: "cleo-cat-next-index-v1",
};
const rainbow = [
  "#bd3328", // red
  "#bf6417", // orange
  "#8c6d00", // yellow, dark enough on paper
  "#31724c", // green
  "#2865a0", // blue
  "#5547a2", // indigo
  "#813c98", // violet
];

function readIndex(key) {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === null) return null;
    const value = Number(stored);
    return Number.isInteger(value) && value >= 0 && value < rotationOrder.length ? value : null;
  } catch {
    return null;
  }
}

function saveIndex(key, index) {
  try {
    window.localStorage.setItem(key, String(index));
  } catch {
    // The icon still rotates for this page view when browser storage is unavailable.
  }
}

function showCat(index) {
  const variant = rotationOrder[index];
  mark.style.backgroundPosition = variant.position;
  mark.setAttribute("aria-label", `CLEO, grey-and-black tabby, ${variant.description}`);
  saveIndex(storageKeys.active, index);
}

function advanceCat() {
  const next = readIndex(storageKeys.next) ?? 0;
  showCat(next);
  saveIndex(storageKeys.next, (next + 1) % rotationOrder.length);
}

let rainbowTimer;

function applyDailyColor() {
  const now = new Date();
  const localDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayNumber = Math.floor(localDay.getTime() / 86_400_000);
  tagline.style.setProperty("--tagline-color", rainbow[((dayNumber % rainbow.length) + rainbow.length) % rainbow.length]);
  window.clearTimeout(rainbowTimer);
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  rainbowTimer = window.setTimeout(applyDailyColor, nextMidnight.getTime() - now.getTime() + 50);
}

showCat(readIndex(storageKeys.active) ?? 0);
applyDailyColor();
window.addEventListener("cleo:wallet-login-success", advanceCat);
window.addEventListener("cleo:wallet-session-ready", (event) => {
  if (!event.detail?.authenticated) return;
  const active = readIndex(storageKeys.active) ?? 0;
  showCat(active);
  if (readIndex(storageKeys.next) === null) saveIndex(storageKeys.next, (active + 1) % rotationOrder.length);
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) applyDailyColor();
});
