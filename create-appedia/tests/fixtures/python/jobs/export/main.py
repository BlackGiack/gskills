# Deployed on its own: this folder is the import root, so "client" is ./client.py.
from client import Client


class Job:
    """Nightly export of closed orders."""

    def __init__(self):
        self.client = Client()

    def run(self, orders):
        return self.client.write([o for o in orders if o.get("closed")])
