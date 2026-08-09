# PayloadGrid Python SDK

```bash
pip install payloadgrid
```

```python
from payloadgrid import PayloadGrid

client = PayloadGrid("pg_live_your_key")
client.send("APP_UUID", "order.completed", {"orderId": "8921"}, "order-8921-completed")
```
