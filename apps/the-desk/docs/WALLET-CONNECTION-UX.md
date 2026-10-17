# Wallet chooser and USB recovery

Implemented 14 October 2026. The Desk uses a compact chooser followed by a
connected account panel, matching the interaction pattern of Uniswap and
Hyperliquid while retaining The Desk theme and existing execution restrictions.

## Connect and use

Click **Connect wallet**. Detected EIP-6963 browser wallets appear as individual
rows. **Ledger** automatically discovers direct USB devices; confirm the selected
account and Base login with **Continue with Ledger**. Account layout and Account
1–20 are under **Choose a different account**. No browser extension is needed
for local Ledger USB.

After verified login, the panel shows a shortened address, connected signer,
Base network, ETH and native USDC. Copy and BaseScan controls use the verified
address. **Receive** creates an EIP-681 Base address QR locally; no remote QR
service receives the address. Refresh reads the provider's balances at one block.
Swap opens Uniswap on Base, and Bridge opens Base's bridge documentation. These
external apps need their own wallet connection and approvals. Base Send remains
disabled. Hyperliquid's existing reviewed extension ticket, mainnet enable flag,
and durable uncertain-order hold are preserved. Ledger USB remains identity and
balances only; its exchange signing stays disabled. Robinhood remains read-only.

## What the USB result means

Discovery retries four times over a short reconnect window. Duplicate reports
of the same HID path are collapsed. Only the Ledger signing interface is used,
never the FIDO/security-key interface. One Ledger is supported at a time.

- **usb-not-visible**: neither HID enumeration nor the USB bus reports a Ledger.
  Check a data-capable cable and a direct port, and allow the macOS accessory
  prompt if shown. The app cannot repair a missing physical USB connection.
- **usb-interface-unavailable**: USB sees the Ledger but its signing interface
  is unavailable. Unlock, reopen Ethereum, close other wallet apps using USB,
  and retry. The UI expands these steps instead of silently returning nothing.
- Device error **6b0c** is preserved in the message rather than replaced with a
  generic failure. It is a rejection of the account read; do not assume that
  USB detection or a signature in another app completed Desk authentication.

PIN, seed, firmware, blind signing and operating-system protection settings are
not changed. Failed/declined requests do not authenticate. Closing a pending
login invalidates its attempt, preventing delayed device approval from signing
in after the user closes the chooser.

## Extension-free mobile pairing

The app includes the official `@walletconnect/ethereum-provider` adapter and
renders its actual `display_uri` QR locally. No placeholder pairing is shown.
A compatible mobile wallet approves pairing and then the existing one-time Base
login challenge. Provider account/network/disconnect events revoke Desk identity.
A successful mobile session can restore without another QR. Pairing can be
cancelled; late completion cannot install the cancelled provider.

The public Reown project identifier must be configured on this local server:

```sh
export DESK_WALLETCONNECT_PROJECT_ID=your_32_hex_project_id
python3 launch.py --detach
```

Restart an already running Desk server after changing its environment. Register
this application's origin with the project as required by Reown. Only a 32 hex
identifier is exposed by `/api/integrations`; other environment values are not
exposed. This identifier is app configuration, not a user's private key.
Without it, the chooser labels mobile pairing **setup needed**, creates no QR,
and makes no relay connection. No public example ID or third party app's ID is
borrowed. Real relay pairing is unverified until the project's ID is supplied.

The current login verifier is for EOA signatures. Base/Coinbase passkey smart
accounts are a separate integration and are not advertised as supported here.

## Rabby and Base options

RabbyKit is a public connector UI/toolkit, and Rabby's EIP-6963 integration is
public. Neither embeds Rabby's extension key storage or makes an absent extension
appear in Safari. The Desk already uses the public EIP-6963 integration and now
presents each detected provider as a direct choice. Rabby can own the hardware
connection in its own supported wallet interface; The Desk does not import its
keys. Mobile wallets can use WalletConnect when configured and supported by that
wallet. Do not imply that every Rabby release or desktop mode supports QR.

Base RPC reads the network; it is not a hardware USB driver. Base's account SDK
is currently `@base-org/account`, documented by Coinbase as its passkey account
experience. That account is distinct from the Ledger EOA and requires smart
account signature verification before this app could authenticate it.

## Verification

34 Node tests cover provider login, account/network changes, exact balance reads,
USB reconnection, distinct missing/inaccessible devices, duplicate HID entries,
error codes, QR configuration, cancellation races and mobile session restoration.
33 Python checks cover the real HTTP/authentication boundary, cryptographic login,
Base RPC restrictions, Robinhood read-only behavior and durable Hyperliquid state.
Browser fixtures exercise the compact chooser, no-extension/no-USB recovery,
synthetic Ledger login and balances, receive QR, signature rejection, disconnect,
provider choices and responsive layouts. All fixture keys and balances are
explicitly synthetic; no transfer or real order is part of validation.

This Mac's live USB/HID scan reported no attached Ledger during this update.
Physical signing and a real mobile/relay approval remain unverified; the UI must
not claim otherwise. The package audit reported zero known vulnerabilities.
Restored cookie sessions remain hidden until the same tab restores its selected
wallet provider; a new tab must reconnect before showing an authenticated wallet.

## Sources

- [Uniswap wallet connection flow](https://support.uniswap.org/hc/en-us/articles/8121191796749-How-to-connect-a-wallet-to-the-Uniswap-web-app)
- [RabbyKit](https://rabbykit.rabby.io/docs/introduction)
- [Rabby public EIP-6963 integration](https://rabby.io/docs/integrating-rabby-wallet)
- [WalletConnect Ethereum provider and custom QR](https://docs.reown.com/advanced/providers/ethereum)
- [Base SDK migration](https://docs.base.org/sdks/migrated-products)
- [Current Base/Coinbase Wallet SDK](https://docs.cdp.coinbase.com/coinbase-wallet/overview)

The WalletConnect provider ships its Community License text and required notice
in `web/vendor/WALLET-NOTICE.txt`. QR rendering is separately bundled and loaded
only when needed; the relay SDK is loaded only for configured mobile pairing.
