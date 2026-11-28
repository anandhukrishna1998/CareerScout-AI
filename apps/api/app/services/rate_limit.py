import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.settings import settings

_LOCAL_WINDOWS: dict[str, deque[float]] = defaultdict(deque)
_LUA_INCR_EXPIRE = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
"""
_REDIS_CLIENT = None


def _get_redis_client():
    global _REDIS_CLIENT
    if _REDIS_CLIENT is None:
        import redis.asyncio as aioredis

        _REDIS_CLIENT = aioredis.from_url(settings.redis_url, socket_timeout=0.5)
    return _REDIS_CLIENT


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
        client = _get_redis_client()
        count = int(await client.eval(_LUA_INCR_EXPIRE, 1, f"rl:{key}", int(window_seconds)))
        if count > limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded. Please wait a moment and try again.",
            )
        return
    except HTTPException:
        raise
    except Exception:
        check_rate_limit(key, limit=limit, window_seconds=window_seconds)


def _extract_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "").strip()
    if forwarded_for:
        first_hop = forwarded_for.split(",", 1)[0].strip()
        if first_hop:
            return first_hop
    real_ip = request.headers.get("x-real-ip", "").strip()
    if real_ip:
        return real_ip
    return request.client.host if request.client else "unknown"


def rate_limit_dependency(scope: str, limit: int = 30, window_seconds: int = 60):
    async def _dependency(request: Request) -> None:
        client_ip = _extract_client_ip(request)
        await check_rate_limit_async(
            f"{scope}:{client_ip}", limit=limit, window_seconds=window_seconds
        )

    return _dependency
