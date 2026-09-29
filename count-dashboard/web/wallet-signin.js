const BASE_CHAIN_ID = "0x2105";
const walletButton = document.querySelector("#walletButton");
const walletStatus = document.querySelector("#walletStatus");
const walletAddress = document.querySelector("#walletAddress");
const walletSignOut = document.querySelector("#walletSignOut");

function setStatus(message, visible = true) {
  walletStatus.textContent = message;
  walletStatus.hidden = !visible;
}

function displaySession(session) {
  const authenticated = Boolean(session?.authenticated);
  walletAddress.hidden = !authenticated;
  walletSignOut.hidden = !authenticated;
  walletAddress.textContent = authenticated ? session.address : "";
  walletButton.hidden = authenticated;
  setStatus("Wallet identity verified locally on Base Mainnet.", authenticated);
}

async function requestJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Wallet sign-in could not be completed.");
  return result;
}

async function loadSession() {
  try {
    const response = await fetch("/api/wallet/session", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error("Wallet session service is unavailable.");
    const session = await response.json();
    displaySession(session);
    window.dispatchEvent(new CustomEvent("cleo:wallet-session-ready", { detail: session }));
  } catch (error) {
    setStatus(error.message);
  }
}

async function switchToBase(provider) {
  const chainId = await provider.request({ method: "eth_chainId" });
  if (String(chainId).toLowerCase() === BASE_CHAIN_ID) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_CHAIN_ID }] });
  } catch (error) {
    if (error?.code === 4001) throw new Error("Network change was declined. Switch to Base Mainnet to sign in.");
    throw new Error("Switch your wallet to Base Mainnet, then try again.");
  }
  const confirmed = await provider.request({ method: "eth_chainId" });
  if (String(confirmed).toLowerCase() !== BASE_CHAIN_ID) throw new Error("Wallet is not on Base Mainnet.");
}

walletButton.addEventListener("click", async () => {
  const provider = window.ethereum;
  if (!provider?.request) {
    setStatus("No browser wallet was found. Open this page in a browser with an injected EVM wallet.");
    return;
  }
  walletButton.disabled = true;
  setStatus("Connect your wallet, switch to Base Mainnet, then review the sign-in message.");
  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    if (!Array.isArray(accounts) || !accounts[0]) throw new Error("No wallet account was selected.");
    const address = accounts[0];
    await switchToBase(provider);
    const challenge = await requestJson("/api/wallet/challenge", { address });
    setStatus("Review and sign the one-time message in your wallet. No transaction will be sent.");
    const signature = await provider.request({
      method: "personal_sign",
      params: [challenge.message, address],
    });
    const session = await requestJson("/api/wallet/verify", {
      address,
      nonce: challenge.nonce,
      message: challenge.message,
      signature,
    });
    displaySession(session);
    window.dispatchEvent(new CustomEvent("cleo:wallet-login-success", { detail: session }));
  } catch (error) {
    setStatus(error?.code === 4001
      ? "Wallet request was declined. The Count Desk remains available without signing in."
      : (error.message || "Wallet sign-in failed."));
  } finally {
    walletButton.disabled = false;
  }
});

walletSignOut.addEventListener("click", async () => {
  try {
    await requestJson("/api/wallet/logout", {});
    displaySession({ authenticated: false });
    window.location.assign("/trading-landing.html");
  } catch (error) {
    setStatus(error.message);
  }
});

window.ethereum?.on?.("accountsChanged", () => {
  void requestJson("/api/wallet/logout", {}).catch(() => {});
  displaySession({ authenticated: false });
});
window.ethereum?.on?.("chainChanged", (chainId) => {
  if (String(chainId).toLowerCase() !== BASE_CHAIN_ID) {
    void requestJson("/api/wallet/logout", {}).catch(() => {});
    displaySession({ authenticated: false });
    setStatus("Wallet changed networks. Sign in again on Base Mainnet if needed.");
  }
});

void loadSession();
