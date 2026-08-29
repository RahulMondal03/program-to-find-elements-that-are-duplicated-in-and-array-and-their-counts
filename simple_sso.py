"""A simple single sign-on (SSO) implementation.

The model here is the classic token-based SSO handshake, reduced to its
essentials and implemented with nothing but the standard library:

    1. A user authenticates once against a central identity provider (IdP).
    2. The IdP hands back a signed, short-lived token naming the user and the
       service the token is good for.
    3. The user presents that token to a service provider (SP), which verifies
       the signature locally -- no call back to the IdP, no second password.

Tokens are ``payload.signature`` where the payload is base64url-encoded JSON
and the signature is HMAC-SHA256 over the encoded payload. That keeps the
payload readable (it is signed, not encrypted, so never put secrets in it)
while making it unforgeable to anyone without the shared secret.

This is teaching code, not a production identity system: real deployments
should use vetted OIDC/SAML libraries, asymmetric keys so service providers
cannot mint tokens, and a revocation story.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time

# PBKDF2 iteration count for stored passwords. High enough to be slow for an
# attacker with the hash dump, low enough to keep the demo snappy.
_PBKDF2_ROUNDS = 200_000


class SSOError(Exception):
    """Base class for every failure this module raises."""


class AuthenticationError(SSOError):
    """The user could not be authenticated by the identity provider."""


class InvalidToken(SSOError):
    """A token was malformed, unsigned, expired, or meant for someone else."""


def _b64encode(raw):
    """Return ``raw`` as unpadded base64url text."""
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64decode(text):
    """Reverse :func:`_b64encode`, restoring the stripped padding."""
    padding = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + padding)


def _hash_password(password, salt, rounds=_PBKDF2_ROUNDS):
    """Return the PBKDF2-HMAC-SHA256 digest of ``password``."""
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, rounds)


class IdentityProvider:
    """The central login service: it knows the users and mints the tokens.

    Args:
        secret: The signing key shared with each service provider. Must be
            bytes; generate it with :func:`secrets.token_bytes`, do not hardcode
            one.
        issuer: A name for this IdP, recorded in every token it signs.
        token_ttl: How many seconds an issued token stays valid.

    Raises:
        TypeError: If ``secret`` is not bytes.
        ValueError: If ``secret`` is empty or ``token_ttl`` is not positive.
    """

    def __init__(self, secret, issuer="sso.example.com", token_ttl=300):
        if not isinstance(secret, (bytes, bytearray)):
            raise TypeError(f"secret must be bytes, got {type(secret).__name__}")
        if not secret:
            raise ValueError("secret must not be empty")
        if token_ttl <= 0:
            raise ValueError(f"token_ttl must be positive, got {token_ttl}")

        self._secret = bytes(secret)
        self.issuer = issuer
        self.token_ttl = token_ttl
        self._users = {}

    def register(self, username, password, roles=()):
        """Add a user, storing only a salted hash of ``password``.

        Raises:
            ValueError: If ``username`` is already registered or either
                credential is empty.
        """
        if not username or not password:
            raise ValueError("username and password must both be non-empty")
        if username in self._users:
            raise ValueError(f"user {username!r} is already registered")

        salt = secrets.token_bytes(16)
        self._users[username] = {
            "salt": salt,
            "digest": _hash_password(password, salt),
            "roles": tuple(roles),
        }

    def login(self, username, password, audience):
        """Authenticate a user and return a token for ``audience``.

        Args:
            username: The user logging in.
            password: Their plaintext password, checked against the stored hash.
            audience: The name of the service provider the token is for. A
                token minted for one service is rejected by every other one.

        Returns:
            A ``payload.signature`` token string.

        Raises:
            AuthenticationError: If the username is unknown or the password is
                wrong. Both cases raise the same message on purpose, so the
                error does not reveal which usernames exist.
        """
        user = self._users.get(username)
        if user is None:
            # Hash anyway so a missing user does not answer faster than a wrong
            # password and leak the account list through timing.
            _hash_password(password, b"\x00" * 16)
            raise AuthenticationError("invalid username or password")

        candidate = _hash_password(password, user["salt"])
        if not hmac.compare_digest(candidate, user["digest"]):
            raise AuthenticationError("invalid username or password")

        now = int(time.time())
        return self._sign(
            {
                "sub": username,
                "roles": list(user["roles"]),
                "iss": self.issuer,
                "aud": audience,
                "iat": now,
                "exp": now + self.token_ttl,
                # A per-token nonce, so two logins in the same second still
                # produce distinct tokens.
                "jti": secrets.token_hex(8),
            }
        )

    def _sign(self, claims):
        """Encode ``claims`` and append their HMAC signature."""
        payload = _b64encode(
            json.dumps(claims, separators=(",", ":"), sort_keys=True).encode("utf-8")
        )
        signature = _b64encode(
            hmac.new(self._secret, payload.encode("ascii"), hashlib.sha256).digest()
        )
        return f"{payload}.{signature}"


class ServiceProvider:
    """An application that trusts the IdP's signature instead of a password.

    Args:
        name: This service's name. It must match a token's ``aud`` claim.
        secret: The same signing key the identity provider uses.
        issuer: The only issuer whose tokens this service accepts.
        leeway: Seconds of clock skew tolerated around ``exp`` and ``iat``.
    """

    def __init__(self, name, secret, issuer="sso.example.com", leeway=30):
        if not isinstance(secret, (bytes, bytearray)):
            raise TypeError(f"secret must be bytes, got {type(secret).__name__}")
        if leeway < 0:
            raise ValueError(f"leeway must not be negative, got {leeway}")

        self.name = name
        self._secret = bytes(secret)
        self.issuer = issuer
        self.leeway = leeway

    def verify(self, token):
        """Validate ``token`` and return its claims.

        The checks run in order: shape, signature, then the claims themselves.
        The signature is checked before anything in the payload is trusted.

        Returns:
            The decoded claims dict, e.g. ``{"sub": "ada", "roles": [...], ...}``.

        Raises:
            InvalidToken: If the token is malformed, badly signed, expired, not
                yet valid, from another issuer, or addressed to another service.
        """
        if not isinstance(token, str):
            raise InvalidToken(f"token must be a string, got {type(token).__name__}")

        payload, separator, signature = token.partition(".")
        if not separator or not payload or not signature:
            raise InvalidToken("token must be of the form 'payload.signature'")

        expected = _b64encode(
            hmac.new(self._secret, payload.encode("ascii"), hashlib.sha256).digest()
        )
        if not hmac.compare_digest(expected, signature):
            raise InvalidToken("signature does not match")

        try:
            claims = json.loads(_b64decode(payload))
        except (ValueError, UnicodeDecodeError) as exc:
            raise InvalidToken(f"payload is not valid JSON: {exc}") from exc
        if not isinstance(claims, dict):
            raise InvalidToken("payload must be a JSON object")

        if claims.get("iss") != self.issuer:
            raise InvalidToken(
                f"token was issued by {claims.get('iss')!r}, expected {self.issuer!r}"
            )
        if claims.get("aud") != self.name:
            raise InvalidToken(
                f"token was issued for {claims.get('aud')!r}, not {self.name!r}"
            )

        now = int(time.time())
        expires_at = claims.get("exp")
        issued_at = claims.get("iat")
        if not isinstance(expires_at, int) or not isinstance(issued_at, int):
            raise InvalidToken("token is missing integer 'iat'/'exp' claims")
        if now > expires_at + self.leeway:
            raise InvalidToken(f"token expired {now - expires_at} seconds ago")
        if now < issued_at - self.leeway:
            raise InvalidToken("token is not valid yet")

        return claims


if __name__ == "__main__":
    # One shared secret, one IdP, two independent services.
    shared_secret = secrets.token_bytes(32)
    idp = IdentityProvider(shared_secret, issuer="sso.example.com", token_ttl=300)
    idp.register("ada", "correct horse battery staple", roles=["admin"])
    idp.register("grace", "hunt the bug", roles=["engineer"])

    wiki = ServiceProvider("wiki", shared_secret, issuer="sso.example.com")
    payroll = ServiceProvider("payroll", shared_secret, issuer="sso.example.com")

    # Sign in once, then use the token at the service it was minted for.
    ada_token = idp.login("ada", "correct horse battery staple", audience="wiki")
    print(f"token: {ada_token}")
    print(f"wiki accepted: {wiki.verify(ada_token)}")

    # The same login also works for the second service -- that is the "single"
    # in single sign-on: one password prompt, one token per service.
    payroll_token = idp.login("ada", "correct horse battery staple", audience="payroll")
    print(f"payroll accepted: {payroll.verify(payroll_token)}")

    # ...but a token minted for the wiki is useless at payroll.
    try:
        payroll.verify(ada_token)
    except InvalidToken as exc:
        print(f"InvalidToken: {exc}")

    # A tampered payload breaks the signature.
    try:
        wiki.verify(idp.login("grace", "hunt the bug", "wiki")[:-1] + "x")
    except InvalidToken as exc:
        print(f"InvalidToken: {exc}")

    # An expired token is rejected once its lifetime has passed.
    brief_idp = IdentityProvider(shared_secret, token_ttl=1)
    brief_idp.register("ada", "correct horse battery staple")
    strict_wiki = ServiceProvider("wiki", shared_secret, leeway=0)
    expired = brief_idp.login("ada", "correct horse battery staple", "wiki")
    time.sleep(2)
    try:
        strict_wiki.verify(expired)
    except InvalidToken as exc:
        print(f"InvalidToken: {exc}")

    # Bad credentials never produce a token, and never say which half was wrong.
    for username, password in (("ada", "wrong"), ("nobody", "whatever")):
        try:
            idp.login(username, password, "wiki")
        except AuthenticationError as exc:
            print(f"AuthenticationError: {exc}")
