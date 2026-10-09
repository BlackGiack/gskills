class Client:
    """Writes order exports to the reporting store."""

    def write(self, rows):
        return len(rows)
