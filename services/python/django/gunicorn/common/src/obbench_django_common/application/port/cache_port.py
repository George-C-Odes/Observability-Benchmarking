"""Port interface for the cache dependency.

Follows the hexagonal / ports-and-adapters pattern identical to the
Java ``CachePort`` interface and Go ``Cache`` interface.
"""

from abc import ABC, abstractmethod


class CachePort(ABC):
    """Minimal cache abstraction used by the application service."""

    @abstractmethod
    def get(self, key: str) -> str:
        """Return the cached value for *key*, or ``""`` if absent."""

    @abstractmethod
    def size(self) -> int:
        """Return the configured maximum cache capacity."""

    @abstractmethod
    def close(self) -> None:
        """Release any resources held by the cache."""