"""Placing and reading orders."""
from datetime import datetime

from .models import Order, Status
from .repository import Repository


class EmptyOrderError(ValueError):
    """Raised when an order has no items."""


class OrderService:
    """Places and reads orders."""

    def __init__(self, repo: Repository) -> None:
        self.repo = repo
        self.seq = 0

    def place(self, order: Order) -> Order:
        """Validate an order, stamp it and save it."""
        if not order.items:
            raise EmptyOrderError("order has no items")
        self.seq += 1
        order.id = f"o-{self.seq}"
        order.status = Status.PLACED
        order.placed_at = datetime.now()
        self.repo.save(order)
        return order

    def get(self, order_id: str) -> Order:
        return self.repo.get(order_id)
