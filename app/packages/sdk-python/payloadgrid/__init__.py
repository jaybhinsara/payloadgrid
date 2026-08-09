import base64
import hashlib
import hmac
import json
import time
import urllib.error
import urllib.request


class PayloadGridError(Exception):
    def __init__(self, message, status=None, details=None):
        super().__init__(message)
        self.status = status
        self.details = details


class PayloadGrid:
    def __init__(self, api_key, base_url="https://payloadgrid.com", timeout=15, retries=2):
        if not api_key:
            raise ValueError("PayloadGrid api_key is required")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.retries = retries

    def _post(self, path, body, idempotency_key=None):
        encoded = json.dumps(body, separators=(",", ":")).encode()
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        last_error = None
        for attempt in range(self.retries + 1):
            try:
                request = urllib.request.Request(f"{self.base_url}{path}", encoded, headers, method="POST")
                with urllib.request.urlopen(request, timeout=self.timeout) as response:
                    return json.loads(response.read() or b"{}")
            except urllib.error.HTTPError as error:
                details = json.loads(error.read() or b"{}")
                last_error = PayloadGridError(details.get("error", f"PayloadGrid HTTP {error.code}"), error.code, details)
                if error.code != 429 and error.code < 500:
                    raise last_error
            except Exception as error:
                last_error = error
            if attempt < self.retries:
                time.sleep(0.25 * (2 ** attempt))
        if isinstance(last_error, Exception):
            raise last_error
        raise PayloadGridError("PayloadGrid request failed")

    def send(self, application_id, event_type, payload, idempotency_key=None):
        return self._post("/api/v1/messages", {"applicationId": application_id, "eventType": event_type, "payload": payload}, idempotency_key)

    def send_batch(self, events):
        return self._post("/api/v1/messages/batch", {"events": events})


def verify_webhook(raw_body, headers, secret, tolerance_seconds=300):
    normalized = {str(key).lower(): value for key, value in headers.items()}
    event_id = normalized.get("payloadgrid-id")
    timestamp = normalized.get("payloadgrid-timestamp")
    signature_header = normalized.get("payloadgrid-signature")
    if not event_id or not timestamp or not signature_header:
        raise ValueError("Missing PayloadGrid signature headers")
    if abs(time.time() - int(timestamp)) > tolerance_seconds:
        raise ValueError("PayloadGrid signature timestamp is outside tolerance")
    body = raw_body if isinstance(raw_body, bytes) else str(raw_body).encode()
    content = f"{event_id}.{timestamp}.".encode() + body
    expected = hmac.new(secret.encode(), content, hashlib.sha256).digest()
    signatures = [value for value in signature_header.replace(",", " ").split() if value != "v1"]
    verified = False
    for value in signatures:
        try:
            verified = hmac.compare_digest(base64.b64decode(value, validate=True), expected)
        except (ValueError, TypeError):
            verified = False
        if verified:
            break
    if not verified:
        raise ValueError("PayloadGrid signature verification failed")
    return {"id": event_id, "timestamp": int(timestamp)}
