"""HTTP routes for orders (framework-agnostic handlers)."""
from ..models import Item, Order
from ..service import OrderService


def create_order(service: OrderService, payload: dict) -> dict:
    """POST /orders: place an order from a JSON payload."""
    order = Order(items=[Item(**i) for i in payload.get("items", [])])
    placed = service.place(order)
    return {"id": placed.id, "status": placed.status.value}


def get_order(service: OrderService, order_id: str) -> dict:
    """GET /orders/<id>."""
    order = service.get(order_id)
    return {"id": order.id, "status": order.status.value, "items": len(order.items)}
