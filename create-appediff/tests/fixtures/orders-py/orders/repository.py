"""Where orders are stored."""
from typing import Protocol

from .models import Order


class Repository(Protocol):
    """Stores orders."""

    def save(self, order: Order) -> None: ...

    def get(self, order_id: str) -> Order: ...


class MemoryRepository(Repository):
    """An in-memory Repository."""

    def __init__(self) -> None:
        self.orders: dict[str, Order] = {}

    def save(self, order: Order) -> None:
        self.orders[order.id] = order

    def get(self, order_id: str) -> Order:
        if order_id not in self.orders:
            raise KeyError(f"order {order_id} not found")
        return self.orders[order_id]
