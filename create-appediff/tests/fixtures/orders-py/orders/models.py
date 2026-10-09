"""Orders and their items."""
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class Status(str, Enum):
    """Where an order is in its life."""
    PLACED = "placed"
    SHIPPED = "shipped"


@dataclass
class Item:
    """One line of an order."""
    sku: str
    quantity: int


@dataclass
class Order:
    """A customer's request for items."""
    id: str = ""
    items: list[Item] = field(default_factory=list)
    status: Status = Status.PLACED
    placed_at: datetime | None = None
