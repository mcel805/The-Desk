# Extension-free Base hardware wallet connection

## Selected implementation

The Desk connects directly to a **Ledger USB device** through its local server.
The browser needs no wallet extension and no WebHID support. The local Node.js
worker uses Ledger's maintained Device Management Kit, Node HID transport and
Ethereum signer. Base is a standard EVM chain: the device's Ethereum address is
also its Base address. Base Mainnet chain ID is **8453**, with read-only RPC at
`https://mainnet.base.org` by default.

Base RPC is not a login service and cannot sign. Signing proves ownership of the
hardware-controlled address to this local app. The login message names the Desk
origin and Base chain; it does not submit an on-chain transaction or cost gas.
The Base Account / Coinbase Wallet SDK creates a different account experience;
this request is for an existing hardware-controlled address, so it uses device
signing and the existing verified EOA login flow instead of creating a smart
account or importing a recovery phrase.

## User flow

1. Open The Desk and click **Connect wallet**.
2. **Ledger · direct USB** is the default connection method. Connect by USB,
   unlock the device and open its Ethereum app. Connect one Ledger at a time. Close Ledger Live or other apps
   if they are holding the device connection.
3. Click **Find USB devices**, select the device, choose Ledger Live or legacy
   Ethereum account layout, and choose Account 1–20.
4. Click **Connect USB & sign in**. Confirm the account address on the device,
   then read and approve the one-time Base Desk login message. Reject on the
   device to cancel. Requests time out if approval is not completed.
5. The server verifies the signature and issues its existing HttpOnly wallet
   session. Refresh displays Base ETH and native USDC from one block.
6. Disconnect clears both the signed login and the local hardware connection.
   Reconnect and unlock the device after a server restart or hardware disconnect.

The signing key, recovery phrase and PIN remain on Ledger. The app stores only
public account selection in memory and uses an opaque HttpOnly hardware cookie.
Device selection uses an opaque hash of the physical USB identity, rather than
the SDK’s session-specific device ID. Each short-lived worker closes its USB
connection after completion or failure.
No external Ledger partner API key or browser extension is needed for this login.

## Setup and operation

Run `npm ci` in `apps/the-desk` to install the pinned Node dependencies and native
HID module. Run The Desk with the wallet-enabled Python (`requirements-wallet.txt`).
The normal launcher selects the existing virtual environment when available.
`NODE_BIN` selects a configured Node executable. `DESK_BASE_RPC_URL` may select a
trusted HTTPS Base RPC service; the server verifies its reported chain ID before
balance reads. RPC configuration is server-side, never a browser-supplied URL.

This supports the local desktop deployment: USB must be connected to the machine
running the Desk server. It is not a USB proxy for a remotely hosted Desk. Ledger
USB is the implemented device family; Trezor, Bluetooth and smart-account/passkey
sign-in are not implemented. Current Linux systems may require normal Ledger HID
permissions. No automatic driver, firmware or operating-system changes occur.

## Server and signing boundaries

- Device access and public account selection use POST requests with exact local
  Host/Origin and JSON content. No cross-origin access or wildcard CORS is added.
- The selected account is bound to a random, HttpOnly, SameSite=Strict cookie,
  held in server memory and expires after eight hours.
- Signing accepts only an unexpired, exact server-issued login challenge for
  that selected address, local origin and Base chain. Altered messages, unknown
  nonces, replayed challenges and another account's challenge never reach USB.
- The worker re-reads the account before signing and compares it to the reviewed
  address. Account mismatch, unplug, device rejection and timeout fail closed.
- USB operations are serialized; concurrent device requests are rejected.
- Base reads require the signed wallet session and matching hardware selection.
  The RPC allowlist permits only a block number, this address's ETH balance, and
  native USDC `balanceOf`. It cannot call arbitrary contracts or broadcast.
- The native worker exposes no transaction, typed-data, raw APDU or arbitrary
  message signing operation. Hardware exchange order signing is not available;
  the UI disables the Hyperliquid ticket for this provider. Existing extension
  signing remains optional and retains its venue reconciliation protections.

## Validation and acceptance

Behavioral Node tests execute native SDK adapter operations with mock device
observables, including address confirmation, wrong accounts, rejection, timeout,
session closure, account derivation, provider login and balance reads. Python
checks verify real cryptographic login signatures and challenge restrictions.
An isolated HTTP fixture runs the actual server and subprocess boundary with a
synthetic signer; it verifies cookies, same-origin checks, replay, logout and
restricted RPC. Synthetic keys exist only in test fixtures, never application
code. The browser fixture checks the no-extension drawer and complete synthetic
USB login, balance, rejection and disconnect flows.

The installed native SDK loads on this Mac and USB discovery has returned no
attached Ledger. Physical-device address confirmation and signing remain
unverified until a Ledger is connected and the user approves on its screen.
No real transaction, transfer or order is part of this validation.

Verified locally: 22 Node wallet tests and 31 Python wallet/HTTP/reconciliation
checks pass without skips; native SDK discovery also runs against synthetic HID
enumeration to cover initial asynchronous discovery and fresh-worker identity.
The installed drawer reports the real no-device state. The dependency audit
reports no known production vulnerabilities at validation time.

The pinned Ledger kits are Apache-2.0 licensed; the direct `node-hid` dependency
is MIT OR X11. Their package license files remain in the installed dependencies;
no native SDK source is copied into browser assets.

## Primary research sources

- [Base network connection](https://docs.base.org/get-started/connect-to-base)
- [Base Account SDK documentation migration](https://docs.base.org/sdks/migrated-products)
- [Ledger supported transports](https://developers.ledger.com/docs/device-interaction/dmk-ts/integration/how_to/transports)
- [Ledger device connection lifecycle](https://developers.ledger.com/docs/device-interaction/dmk-ts/beginner/discover_and_connect)
- [Ledger Ethereum signer](https://developers.ledger.com/docs/device-interaction/dmk-ts/references/signers/eth)
- [Migration to maintained Ledger SDK](https://developers.ledger.com/docs/device-interaction/dmk-ts/integration/migrations/signers/eth/hw_app_eth_to_dmk)

The partner Ledger Wallet Provider was not selected: it requires partner
configuration and browser WebHID/Bluetooth support. The local USB worker satisfies
this app's Safari and in-app browser requirement without those browser APIs.
