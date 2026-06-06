from __future__ import annotations

import time
from typing import Any, Awaitable, Callable

TTL_HISTORICAL = 3600
TTL_ROLLING = 300
TTL_PREDICTION = 900
TTL_LIVE = 0

_cache: dict[str, tuple[Any, float]] = {}


async def get_cached(key: str, ttl: int, fetch_fn: Callable[[], Awaitable[Any]]) -> Any:
    """
    Check _cache[key]. If exists and age < ttl, return it.
    Otherwise call await fetch_fn(), store result with current timestamp, return result.
    fetch_fn must be an async callable with no arguments.
    """
    if ttl > 0:
        cached = _cache.get(key)
        now = time.time()
        if cached is not None:
            data, set_at = cached
            if now - set_at < ttl:
                return data
        data = await fetch_fn()
        _cache[key] = (data, now)
        return data

    return await fetch_fn()


def invalidate(*keys: str) -> None:
    """Remove given keys from _cache. Silently skip missing."""
    for key in keys:
        _cache.pop(key, None)
