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
        except zipfile.BadZipFile as exc:
            raise ValueError("Corrupted DOCX archive") from exc


def _extract_docx_text(content: bytes) -> str:
    try:
        import docx  # type: ignore

        doc = docx.Document(io.BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except ImportError:
        pass

    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        xml_bytes = zf.read("word/document.xml")
    root = ElementTree.fromstring(xml_bytes)
    parts: list[str] = []
    for elem in root.iter():
        if elem.tag.endswith("}t") and elem.text:
            parts.append(elem.text)
        elif elem.tag.endswith("}p"):
            parts.append("\n")
    return re.sub(r"\n{3,}", "\n\n", "".join(parts)).strip()


def _extract_pdf_text(content: bytes) -> str:
    try:
        from pypdf import PdfReader  # type: ignore

        reader = PdfReader(io.BytesIO(content))
        extracted = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
        if extracted:
            return extracted
    except ImportError:
        pass

    # Pure-Python fallback: inspect uncompressed and FlateDecode PDF streams for Tj/TJ text operators.
    chunks: list[str] = []
    stream_pattern = re.compile(rb"stream\r?\n(.*?)\r?\nendstream", re.DOTALL)
    text_pattern = re.compile(rb"\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj", re.DOTALL)
    for match in stream_pattern.finditer(content):
        raw_stream = match.group(1)
        data = raw_stream
        try:
            data = zlib.decompress(raw_stream)
        except zlib.error:
            pass
        for tm in text_pattern.finditer(data):
            decoded = tm.group(1).replace(b"\\(", b"(").replace(b"\\)", b")").replace(b"\\\\", b"\\")
            chunks.append(decoded.decode("utf-8", errors="ignore"))

    if chunks:
        return " ".join(chunks).strip()
    return content.decode("utf-8", errors="ignore").strip()


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
