"""Short-lived, local SIWE sessions for The Desk.

This module provides wallet identity only. It does not authorize trading actions,
read or control wallet funds, or gate paper engine APIs.
"""

from __future__ import annotations

import hashlib
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from threading import Lock

try:
    from eth_account import Account
    from eth_account.messages import encode_defunct
except ImportError:  # Keep non-wallet Desk routes usable in the system Python.
    Account = None  # type: ignore[assignment]
    encode_defunct = None  # type: ignore[assignment]


BASE_CHAIN_ID = 8453
CHALLENGE_TTL_SECONDS = 300
SESSION_TTL_SECONDS = 8 * 60 * 60
SESSION_COOKIE = "desk_wallet_session"
ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")

_lock = Lock()
_challenges: dict[str, dict[str, object]] = {}
_sessions: dict[str, dict[str, object]] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def _rfc3339(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def _local_origin(host: str, port: int, origin: str | None) -> tuple[str, str]:
    if not isinstance(host, str) or len(host) > 120 or "@" in host:
        raise ValueError("Wallet sign-in is available only from the local Desk.")
    match = re.fullmatch(r"(127\.0\.0\.1|localhost):(\d{1,5})", host, re.IGNORECASE)
    if not match or int(match.group(2)) != port:
        raise ValueError("Wallet sign-in is available only from the local Desk.")
    expected_origin = f"http://{host}"
    if origin and origin != expected_origin:
        raise ValueError("Wallet sign-in request origin does not match this Desk page.")
    return host, expected_origin + "/"


def validate_local_origin(host: str, port: int, origin: str | None) -> None:
    _local_origin(host, port, origin)


def issue_challenge(address: str, host: str, port: int, origin: str | None) -> dict[str, str]:
    if not isinstance(address, str) or not ADDRESS_RE.fullmatch(address):
        raise ValueError("A valid EVM wallet address is required.")
    domain, uri = _local_origin(host, port, origin)
    issued = _now()
    expires = issued + timedelta(seconds=CHALLENGE_TTL_SECONDS)
    nonce = secrets.token_hex(16)
    message = (
        f"{domain} wants you to sign in with your Ethereum account:\n"
        f"{address}\n\n"
        "Sign in to The Desk with your Base wallet.\n\n"
        f"URI: {uri}\n"
        "Version: 1\n"
        f"Chain ID: {BASE_CHAIN_ID}\n"
        f"Nonce: {nonce}\n"
        f"Issued At: {_rfc3339(issued)}\n"
        f"Expiration Time: {_rfc3339(expires)}"
    )
    now_epoch = time.time()
    with _lock:
        for key, item in list(_challenges.items()):
            if float(item["expires_epoch"]) <= now_epoch:
                _challenges.pop(key, None)
        if len(_challenges) >= 512:
            raise ValueError("Too many sign-in attempts. Retry shortly.")
        _challenges[nonce] = {
            "address": address,
            "domain": domain,
            "message": message,
            "expires_epoch": expires.timestamp(),
        }
    return {"nonce": nonce, "message": message, "expiresAt": _rfc3339(expires)}


def verify_challenge(
    address: str, nonce: str, message: str, signature: str,
    host: str, port: int, origin: str | None,
) -> tuple[str, dict[str, object]]:
    domain, _uri = _local_origin(host, port, origin)
    if not isinstance(address, str) or not ADDRESS_RE.fullmatch(address):
        raise ValueError("A valid EVM wallet address is required.")
    if not isinstance(nonce, str) or not isinstance(message, str) or not isinstance(signature, str):
        raise ValueError("Wallet sign-in response is incomplete.")
    if len(message) > 2_000 or len(signature) > 300:
        raise ValueError("Wallet sign-in response is too large.")
    with _lock:
        challenge = _challenges.pop(nonce, None)
    if not challenge:
        raise ValueError("Wallet sign-in request expired or was already used. Start again.")
    if float(challenge["expires_epoch"]) <= time.time():
        raise ValueError("Wallet sign-in request expired. Start again.")
    if challenge["domain"] != domain or challenge["message"] != message:
        raise ValueError("Wallet sign-in message does not match the request from this page.")
    if str(challenge["address"]).lower() != address.lower():
        raise ValueError("Wallet address changed during sign-in. Start again.")
    if f"\nChain ID: {BASE_CHAIN_ID}\n" not in message:
        raise ValueError("Sign-in is scoped to Base Mainnet only.")
    if Account is None or encode_defunct is None:
        raise ValueError("Wallet verification dependency is missing. Install requirements-wallet.txt with the Python used to start The Desk.")
    try:
        recovered = Account.recover_message(encode_defunct(text=message), signature=signature)
    except Exception as exc:
        raise ValueError("Wallet signature could not be verified.") from exc
    if recovered.lower() != address.lower():
        raise ValueError("This signature does not belong to the selected wallet.")

    token = secrets.token_urlsafe(32)
    now = _now()
    expires = now + timedelta(seconds=SESSION_TTL_SECONDS)
    session_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    session = {
        "address": recovered,
        "chainId": BASE_CHAIN_ID,
        "createdAt": _rfc3339(now),
        "expiresAt": _rfc3339(expires),
        "expires_epoch": expires.timestamp(),
    }
    with _lock:
        for key, item in list(_sessions.items()):
            if float(item["expires_epoch"]) <= time.time():
                _sessions.pop(key, None)
        _sessions[session_hash] = session
    return token, {key: value for key, value in session.items() if key != "expires_epoch"}


def get_session(token: str | None) -> dict[str, object] | None:
    if not token:
        return None
    session_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    with _lock:
        session = _sessions.get(session_hash)
        if not session:
            return None
        if float(session["expires_epoch"]) <= time.time():
            _sessions.pop(session_hash, None)
            return None
        return {key: value for key, value in session.items() if key != "expires_epoch"}


def revoke_session(token: str | None) -> None:
    if not token:
        return
    session_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    with _lock:
        _sessions.pop(session_hash, None)
