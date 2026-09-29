const tagline = document.querySelector("#brandTagline");
const rainbow = [
  "#bd3328", // red
  "#bf6417", // orange
  "#8c6d00", // yellow, dark enough on paper
  "#31724c", // green
  "#2865a0", // blue
  "#5547a2", // indigo
  "#813c98", // violet
];

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

applyDailyColor();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) applyDailyColor();
});
