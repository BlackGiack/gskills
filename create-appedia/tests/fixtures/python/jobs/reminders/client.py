class Client:
    """Sends reminder e-mails for unpaid orders."""

    def send(self, order_id):
        return f"reminder for {order_id}"
