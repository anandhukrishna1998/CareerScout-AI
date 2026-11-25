import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.settings import settings

_LOCAL_WINDOWS: dict[str, deque[float]] = defaultdict(deque)


def check_rate_limit(key: str, limit: int, window_seconds: int) -> None:
    now = time.monotonic()
    bucket = _LOCAL_WINDOWS[key]
    cutoff = now - window_seconds
    while bucket and bucket[0] < cutoff:
        bucket.popleft()
    if len(bucket) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please wait a moment and try again.",
        )
    bucket.append(now)


async def check_rate_limit_async(key: str, limit: int, window_seconds: int) -> None:
    try:
        import redis.asyncio as aioredis

        client = aioredis.from_url(settings.redis_url, socket_timeout=0.5)
        try:
            redis_key = f"rl:{key}"
            count = await client.incr(redis_key)
            if count == 1:
                await client.expire(redis_key, window_seconds)
            if count > limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Rate limit exceeded. Please wait a moment and try again.",
                )
            return
        finally:
            await client.aclose()
    except HTTPException:
        raise
    except Exception:
        check_rate_limit(key, limit=limit, window_seconds=window_seconds)


def rate_limit_dependency(scope: str, limit: int = 30, window_seconds: int = 60):
    async def _dependency(request: Request) -> None:
        client_ip = request.client.host if request.client else "unknown"
        await check_rate_limit_async(
            f"{scope}:{client_ip}", limit=limit, window_seconds=window_seconds
        )

    return _dependency
