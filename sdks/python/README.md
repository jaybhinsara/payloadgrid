# payloadgrid

Source-ready beta Python client. This package has not been published to PyPI yet.

```python
from payloadgrid import PayloadGrid
client = PayloadGrid(api_key="pg_live_...")
client.messages_create(
    application_id="APPLICATION_UUID",
    event_type="order.completed",
    idempotency_key="order_8921_completed",
    payload={"orderId": "8921"},
)
```