from orders.public import OrderService


def place_from_cli(service: OrderService, sku: str) -> str:
    """Place a one-item order from the command line."""
    return service.place({"sku": sku})
