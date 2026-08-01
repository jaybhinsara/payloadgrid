from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


class PayloadGridError(RuntimeError):
    pass


@dataclass(frozen=True)
class SignatureHeaders:
    id: str
    timestamp: str
    signature: str


class PayloadGrid:
    def __init__(self, api_key: str, base_url: str = "https://payloadgrid.com") -> None:
        if not api_key:
            raise ValueError("PayloadGrid api_key is required")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    def messages_create(self, *, application_id: str, event_type: str, payload: Any, idempotency_key: str | None = None) -> dict[str, Any]:
        body = json.dumps({"applicationId": application_id, "eventType": event_type, "payload": payload}).encode()
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        request = urllib.request.Request(f"{self.base_url}/api/v1/messages", data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors="replace")
            raise PayloadGridError(f"PayloadGrid request failed with {error.code}: {detail}") from error


def verify_signature(secret: str, raw_body: str, headers: SignatureHeaders, tolerance_seconds: int = 300) -> bool:
    try:
        timestamp = int(headers.timestamp)
    except ValueError:
        return False
    if abs(time.time() - timestamp) > tolerance_seconds:
        return False
    signed = f"{headers.id}.{headers.timestamp}.{raw_body}".encode()
    expected = base64.b64encode(hmac.new(secret.encode(), signed, hashlib.sha256).digest()).decode()
    received = headers.signature[3:] if headers.signature.startswith("v1,") else headers.signature
    return hmac.compare_digest(expected, received)