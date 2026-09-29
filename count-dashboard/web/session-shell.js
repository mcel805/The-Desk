const appLogout = document.querySelector("#appLogout");

if (appLogout) {
  appLogout.addEventListener("click", async () => {
    appLogout.disabled = true;
    appLogout.textContent = "Logging out…";
    try {
      await fetch("/api/wallet/logout", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" });
    } finally {
      window.location.assign("/trading-landing.html");
    }
  });
}
