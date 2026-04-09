"""Small string helpers shared across serializers."""


def normalize_name(value: str) -> str:
    """Strip whitespace and apply title case for consistent API storage and display."""
    s = (value or "").strip()
    if not s:
        return s
    return s.title()
