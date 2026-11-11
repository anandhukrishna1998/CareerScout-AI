import html
from typing import Any
from urllib.parse import urlsplit

import httpx

from app.settings import settings

_PLACEHOLDER_KEYS = {"", "replace-me", "changeme", "none", "null"}
_EMAIL_FONT_STACK = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"


def _sanitize_apply_url(raw_url: Any) -> str:
    candidate = str(raw_url or "").strip()
    if not candidate:
        return "#"
    try:
        parsed = urlsplit(candidate)
    except ValueError:
        return "#"
    if parsed.scheme.lower() in {"http", "https"} and parsed.netloc:
        return candidate
    return "#"


def render_digest_html(
    recipient_name: str,
    subject: str,
    matches: list[dict[str, Any]],
) -> str:
    rows_html = ""
    for m in matches:
        title = html.escape(str(m.get("title", "")), quote=True)
        company = html.escape(str(m.get("company", "")), quote=True)
        location = html.escape(str(m.get("location", "")), quote=True)
        score = int(m.get("score", 0))
        apply_url = html.escape(_sanitize_apply_url(m.get("apply_url")), quote=True)
        strengths = ", ".join(
            html.escape(str(s), quote=True) for s in (m.get("matched_skills") or [])[:4]
        )
        missing = ", ".join(
            html.escape(str(s), quote=True) for s in (m.get("missing_skills") or [])[:3]
        )
        rows_html += (
            f'\n        <div style="border:1px solid #E2DFD6;border-radius:16px;'
            f'padding:18px;margin-bottom:12px;background:#FCFBF8;">'
            f'\n          <div style="display:flex;justify-content:space-between;'
            f'align-items:center;gap:12px;">'
            f'\n            <strong style="font-size:16px;font-weight:600;color:#1B201C;">'
            f"{title}</strong>"
            f'\n            <span style="background:#2D6A4F;color:#FFFFFF;padding:4px 10px;'
            f"border-radius:999px;font-size:12px;font-weight:600;"
            f'font-variant-numeric:tabular-nums;white-space:nowrap;">{score}/100</span>'
            f"\n          </div>"
            f'\n          <p style="margin:6px 0 6px;color:#3F4741;font-size:14px;">'
            f"{company} &middot; {location}</p>"
            f'\n          <p style="margin:4px 0;color:#59615B;font-size:13px;">'
            f"Matched: {strengths or 'Profile alignment'}</p>"
            f'\n          <p style="margin:4px 0 12px;color:#59615B;font-size:13px;">'
            f"Missing: {missing or 'None'}</p>"
            f'\n          <a href="{apply_url}" style="color:#2D6A4F;font-size:13px;'
            f'font-weight:600;text-decoration:none;">Apply on company site</a>'
            f"\n        </div>\n        "
        )

    if not rows_html:
        rows_html = (
            '<p style="color:#59615B;font-size:14px;background:#FCFBF8;'
            "border:1px solid #E2DFD6;border-radius:16px;padding:18px;margin:0;"
            '">No jobs met your minimum match threshold today. '
            "Consider lowering your threshold or broadening locations.</p>"
        )

    escaped_subject = html.escape(subject, quote=True)
    escaped_name = html.escape(recipient_name or "there", quote=True)

    return (
        f'\n    <div style="font-family:{_EMAIL_FONT_STACK};background:#F3F1EC;'
        f"color:#1B201C;border:1px solid #E2DFD6;padding:28px;border-radius:20px;"
        f'max-width:640px;margin:0 auto;">'
        f'\n      <p style="color:#2D6A4F;font-size:12px;font-weight:600;'
        f'letter-spacing:0.04em;margin:0 0 8px;">CareerScout AI Daily Digest</p>'
        f'\n      <h1 style="font-size:22px;font-weight:600;color:#1B201C;'
        f'line-height:1.25;margin:0 0 8px;">{escaped_subject}</h1>'
        f'\n      <p style="color:#3F4741;font-size:14px;line-height:1.5;margin:0 0 20px;">'
        f"Hi {escaped_name}, here are your top {len(matches)} ATS-ranked opportunities:</p>"
        f"\n      {rows_html}"
        f"\n    </div>\n    "
    )


async def dispatch_email_digest(
    recipient_email: str,
    subject: str,
    html_body: str,
) -> tuple[str, str, str]:
    """Returns (status, provider_used, error_message)."""
    provider = settings.email_provider.lower().strip()
    if provider == "resend" and settings.resend_api_key.strip().lower() not in _PLACEHOLDER_KEYS:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {settings.resend_api_key.strip()}"},
                    json={
                        "from": settings.email_from,
                        "to": [recipient_email],
                        "subject": subject,
                        "html": html_body,
                    },
                )
                resp.raise_for_status()
            return "sent", "resend", ""
        except Exception as exc:  # noqa: BLE001
            return "failed", "resend", str(exc)[:300]

    if (
        provider == "sendgrid"
        and settings.sendgrid_api_key.strip().lower() not in _PLACEHOLDER_KEYS
    ):
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    "https://api.sendgrid.com/v3/mail/send",
                    headers={"Authorization": f"Bearer {settings.sendgrid_api_key.strip()}"},
                    json={
                        "personalizations": [{"to": [{"email": recipient_email}]}],
                        "from": {"email": settings.email_from},
                        "subject": subject,
                        "content": [{"type": "text/html", "value": html_body}],
                    },
                )
                resp.raise_for_status()
            return "sent", "sendgrid", ""
        except Exception as exc:  # noqa: BLE001
            return "failed", "sendgrid", str(exc)[:300]

    return "simulated", "local_preview", ""
