import io
import re
import zipfile
import zlib
from xml.etree import ElementTree

ALLOWED_CV_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
    "text/x-markdown",
}

CANONICAL_MIME_BY_EXT = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".md": "text/markdown",
}

_MAX_DOCX_XML_BYTES = 10 * 1024 * 1024
_MAX_PDF_PAGES = 30
_MAX_PDF_STREAM_BYTES = 2 * 1024 * 1024


def validate_cv_magic_bytes(content: bytes, content_type: str, filename: str) -> None:
    lower_name = filename.lower()
    if content_type == "application/pdf" or lower_name.endswith(".pdf"):
        if not content.lstrip().startswith(b"%PDF-"):
            raise ValueError("Invalid PDF signature")
        return
    if (
        content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        or lower_name.endswith(".docx")
    ):
        if not content.startswith(b"PK\x03\x04"):
            raise ValueError("Invalid DOCX archive signature")
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                if "word/document.xml" not in zf.namelist():
                    raise ValueError("Missing word/document.xml inside DOCX")
                info = zf.getinfo("word/document.xml")
                if info.file_size > _MAX_DOCX_XML_BYTES:
                    raise ValueError("DOCX document exceeds safe decompressed size limit")
        except zipfile.BadZipFile as exc:
            raise ValueError("Corrupted DOCX archive") from exc


def _read_bounded_zip_entry(zf: zipfile.ZipFile, name: str, max_bytes: int) -> bytes:
    with zf.open(name) as fh:
        data = fh.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ValueError("DOCX content exceeds decompressed size limit")
    return data


def _extract_docx_text(content: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        xml_bytes = _read_bounded_zip_entry(zf, "word/document.xml", _MAX_DOCX_XML_BYTES)

    try:
        import docx  # type: ignore

        doc = docx.Document(io.BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except ImportError:
        pass

    root = ElementTree.fromstring(xml_bytes)
    parts: list[str] = []
    for elem in root.iter():
        if elem.tag.endswith("}t") and elem.text:
            parts.append(elem.text)
        elif elem.tag.endswith("}p"):
            parts.append("\n")
    return re.sub(r"\n{3,}", "\n\n", "".join(parts)).strip()


def _normalize_pdf_text(text: str) -> str:
    # Join words hyphenated across PDF line breaks (e.g. "Scikit-\nlearn" -> "Scikit-learn").
    cleaned = re.sub(r"(?<=[A-Za-z0-9])-\s*\n\s*(?=[A-Za-z0-9])", "-", text)
    return re.sub(r"\n{3,}", "\n\n", cleaned).strip()


def _extract_pdf_text(content: bytes) -> str:
    try:
        from pypdf import PdfReader  # type: ignore

        reader = PdfReader(io.BytesIO(content))
        extracted = "\n".join(
            page.extract_text() or "" for page in reader.pages[:_MAX_PDF_PAGES]
        ).strip()
        if extracted:
            return _normalize_pdf_text(extracted)
    except Exception:
        pass

    # Bounded pure-Python fallback: inspect FlateDecode/uncompressed PDF streams for simple Tj literals.
    chunks: list[str] = []
    stream_pattern = re.compile(rb"stream\r?\n(.*?)\r?\nendstream", re.DOTALL)
    text_pattern = re.compile(rb"\(([^()]{1,2048})\)\s*Tj", re.DOTALL)
    for match in stream_pattern.finditer(content):
        raw_stream = match.group(1)
        data = raw_stream[:_MAX_PDF_STREAM_BYTES]
        try:
            decomp = zlib.decompressobj()
            data = decomp.decompress(raw_stream, _MAX_PDF_STREAM_BYTES)
        except zlib.error:
            pass
        for tm in text_pattern.finditer(data):
            decoded_bytes = tm.group(1).replace(b"\\(", b"(").replace(b"\\)", b")").replace(b"\\\\", b"\\")
            if re.search(rb"\\[0-7]{3}", decoded_bytes):
                continue
            decoded_text = decoded_bytes.decode("utf-8", errors="ignore").strip()
            if decoded_text:
                chunks.append(decoded_text)

    if chunks:
        return " ".join(chunks).strip()
    return ""


def extract_cv_text(content: bytes, content_type: str, filename: str) -> str:
    lower_name = filename.lower()
    if content_type == "application/pdf" or lower_name.endswith(".pdf"):
        return _extract_pdf_text(content)
    if (
        content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        or lower_name.endswith(".docx")
    ):
        return _extract_docx_text(content)
    return content.decode("utf-8", errors="ignore").strip()
