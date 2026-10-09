# Deployed on its own, like jobs/export: a module with the same name lives there.
from client import Client


class Job:
    """Hourly reminders for unpaid orders."""

    def __init__(self):
        self.client = Client()

    def run(self, order_ids):
        return [self.client.send(i) for i in order_ids]
