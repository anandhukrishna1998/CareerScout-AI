import ipaddress
import re
from urllib.parse import urlsplit

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


def sanitize_http_url(raw_url: str) -> str:
    """Allow only absolute http/https URLs with a valid host to prevent javascript:/data: XSS."""
    trimmed = (raw_url or "").strip()
    if not trimmed:
        return ""
    try:
        parsed = urlsplit(trimmed)
    except ValueError:
        return ""
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        return ""
    return trimmed


def is_safe_outbound_https_url(raw_url: str) -> bool:
    """Reject non-HTTPS URLs and private/loopback/link-local hosts to mitigate SSRF."""
    trimmed = (raw_url or "").strip()
    try:
        parsed = urlsplit(trimmed)
    except ValueError:
        return False
    if parsed.scheme.lower() != "https" or not parsed.hostname:
        return False
    host = parsed.hostname.lower()
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".internal"):
        return False
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return False
    except ValueError:
        pass
    return True

FRANCE_CITIES: dict[str, str] = {
    "paris": "Paris",
    "ile-de-france": "Paris",
    "île-de-france": "Paris",
    "la défense": "Paris (La Défense)",
    "la defense": "Paris (La Défense)",
    "neuilly": "Paris",
    "levallois": "Paris",
    "boulogne-billancourt": "Paris",
    "issy-les-moulineaux": "Paris",
    "montreuil": "Paris",
    "saint-ouen": "Paris",
    "saclay": "Paris-Saclay",
    "palaiseau": "Paris-Saclay",
    "lyon": "Lyon",
    "marseille": "Marseille",
    "toulouse": "Toulouse",
    "bordeaux": "Bordeaux",
    "lille": "Lille",
    "nantes": "Nantes",
    "nice": "Nice",
    "strasbourg": "Strasbourg",
    "rennes": "Rennes",
    "grenoble": "Grenoble",
    "montpellier": "Montpellier",
    "sophia antipolis": "Sophia Antipolis",
    "sophia-antipolis": "Sophia Antipolis",
    "aix-en-provence": "Aix-en-Provence",
    "rouen": "Rouen",
    "metz": "Metz",
    "nancy": "Nancy",
}

EUROPEAN_COUNTRIES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("France", ("france", "télétravail", "teletravail", "hexagone")),
    ("Germany", ("germany", "deutschland", "berlin", "munich", "münchen", "hamburg", "frankfurt", "cologne", "köln", "stuttgart", "konstanz", "marl")),
    ("United Kingdom", ("united kingdom", "great britain", "england", "scotland", "uk", "london", "manchester", "edinburgh", "cambridge", "oxford", "bristol", "belfast")),
    ("Netherlands", ("netherlands", "holland", "amsterdam", "rotterdam", "eindhoven", "utrecht", "delft", "the hague", "den haag")),
    ("Switzerland", ("switzerland", "suisse", "schweiz", "zurich", "zürich", "geneva", "genève", "lausanne", "basel", "bern")),
    ("Spain", ("spain", "españa", "madrid", "barcelona", "valencia", "malaga", "málaga")),
    ("Belgium", ("belgium", "belgique", "brussels", "bruxelles", "antwerp", "ghent", "leuven")),
    ("Italy", ("italy", "italia", "milan", "milano", "rome", "roma", "turin", "torino", "bologna")),
    ("Luxembourg", ("luxembourg",)),
    ("Ireland", ("ireland", "dublin", "cork", "galway")),
    ("Portugal", ("portugal", "lisbon", "lisboa", "porto")),
    ("Poland", ("poland", "warsaw", "krakow", "kraków", "wroclaw", "gdansk")),
    ("Sweden", ("sweden", "stockholm", "gothenburg")),
    ("Denmark", ("denmark", "copenhagen")),
    ("Norway", ("norway", "oslo")),
    ("Finland", ("finland", "helsinki")),
    ("Austria", ("austria", "vienna", "wien")),
    ("Czech Republic", ("czech republic", "czechia", "prague")),
    ("Romania", ("romania", "bucharest")),
    ("Hungary", ("hungary", "budapest")),
    ("Greece", ("greece", "athens")),
    ("Estonia", ("estonia", "tallinn")),
    ("Latvia", ("latvia", "riga")),
    ("Lithuania", ("lithuania", "vilnius")),
    ("Croatia", ("croatia", "zagreb")),
    ("Bulgaria", ("bulgaria", "sofia")),
    ("Slovakia", ("slovakia", "bratislava")),
    ("Slovenia", ("slovenia", "ljubljana")),
    ("Iceland", ("iceland", "reykjavik")),
)

_EUROPEAN_COUNTRY_SET = {c for c, _ in EUROPEAN_COUNTRIES} | {"Europe"}
_FR_CODE_RE = re.compile(r"(?:,\s*|\bremote[-\s]+|\()fr(?:\)|\b|$)", re.IGNORECASE)
_EU_GENERIC_RE = re.compile(
    r"\b(?:europe(?:an\s+union)?|eu\s+only|eu\s+remote|remote\s+eu|eea|emea|cest|cet)\b",
    re.IGNORECASE,
)
_NON_EU_DISQUALIFIER_RE = re.compile(
    r"\b(?:united\s+states|u\.s\.a?\.?|usa|us\s+only|us\s+remote|north\s+america|latin\s+america|latam|"
    r"canada(?:\s+only)?|apac|asia(?:\s+only)?|india|philippines|australia|new\s+zealand|brazil|mexico|"
    r"singapore|japan|china|south\s+africa|nigeria|argentina|colombia|americas|"
    r"san\s+francisco|new\s+york|nyc|seattle|austin|boston|chicago|los\s+angeles|newark|toronto|"
    r"vancouver|bangalore|bengaluru|texas|california|georgia|est\s+only|pst\s+only|cst\s+only|mst\s+only)\b",
    re.IGNORECASE,
)
_US_STATE_CODE_RE = re.compile(
    r",\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|IL|IN|MA|MD|MI|MN|MO|NC|NJ|NY|OH|OR|PA|TN|TX|UT|VA|WA|WI)\b"
)


def sanitize_company_slug(raw: str) -> str | None:
    """Validate an external ATS board slug to prevent path traversal or SSRF."""
    slug = raw.strip().lower()
    if not slug or not _SLUG_RE.match(slug):
        return None
    return slug


def parse_europe_country_city(location: str) -> tuple[str, str]:
    """Normalize a location string into canonical (Country, City) focused on France and Europe."""
    clean = (location or "").strip()
    if not clean:
        return "Worldwide", "Remote"

    lower = clean.lower()

    if _US_STATE_CODE_RE.search(clean) and "france" not in lower:
        parts = [p.strip() for p in clean.split(",") if p.strip()]
        return "United States", parts[0] if parts else clean

    if _NON_EU_DISQUALIFIER_RE.search(lower) and not any(
        re.search(rf"\b{re.escape(tok)}\b", lower)
        for country, aliases in EUROPEAN_COUNTRIES
        for tok in (country.lower(), *aliases)
    ):
        parts = [p.strip() for p in clean.split(",") if p.strip()]
        return parts[-1] if len(parts) >= 2 else clean, parts[0] if parts else clean

    for token, city_name in FRANCE_CITIES.items():
        if re.search(rf"(?<![a-z0-9]){re.escape(token)}(?![a-z0-9])", lower):
            return "France", city_name

    if _FR_CODE_RE.search(clean) or re.search(r"\bfrance\b", lower):
        city = "Remote" if "remote" in lower or "télétravail" in lower or "teletravail" in lower else ""
        return "France", city

    for canonical, aliases in EUROPEAN_COUNTRIES:
        for alias in aliases:
            if re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", lower):
                parts = [p.strip() for p in clean.split(",") if p.strip()]
                city = ""
                if len(parts) >= 2 and parts[0].lower() != canonical.lower():
                    city = parts[0]
                elif canonical.lower() != lower and alias != canonical.lower():
                    city = clean.split(",")[0].strip()
                elif "remote" in lower:
                    city = "Remote"
                return canonical, city

    if _EU_GENERIC_RE.search(lower):
        return "Europe", "Remote"

    if any(tok in lower for tok in ("worldwide", "anywhere", "remote only", "global")):
        return "Worldwide", "Remote"

    parts = [p.strip() for p in clean.split(",") if p.strip()]
    if len(parts) >= 2:
        return parts[-1], parts[0]
    return clean, clean


def is_europe_job(
    location: str,
    title: str = "",
    description: str = "",
    source: str = "",
) -> bool:
    """Return True only when a job belongs to France or Europe."""
    parsed_country, _ = parse_europe_country_city(location)
    loc_lower = (location or "").lower()
    if parsed_country in _EUROPEAN_COUNTRY_SET:
        if _US_STATE_CODE_RE.search(location or "") and "france" not in loc_lower:
            return False
        return True

    if _NON_EU_DISQUALIFIER_RE.search(loc_lower) or _US_STATE_CODE_RE.search(location or ""):
        return False

    if source in {"france_travail", "apec", "welcome_to_the_jungle", "hellowork", "free_work", "malt"}:
        return True

    snippet = f"{location} {title} {description[:400]}".lower()
    return bool(
        _EU_GENERIC_RE.search(snippet)
        or re.search(r"\b(?:france|paris|lyon|berlin|london|amsterdam|europe)\b", snippet)
    )
