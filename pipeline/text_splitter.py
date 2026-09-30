"""Vietnamese Text Splitter for VieNeu-TTS Audiobook Pipeline.

Splits Vietnamese HTML or plain text into clean, individual sentences with unique cue IDs
(e.g., cue-1, cue-2), handling quotes, abbreviations, decimals, and dialogue dashes.
"""

from __future__ import annotations

import html
import re
from typing import Any, List, Dict
from bs4 import BeautifulSoup

# Common Vietnamese and general abbreviations that should not trigger sentence boundaries
ABBREVIATIONS = [
    r"\bTS\.",
    r"\bThS\.",
    r"\bPGS\.",
    r"\bGS\.",
    r"\bBS\.",
    r"\bBSCK\.",
    r"\bKTS\.",
    r"\bCN\.",
    r"\bTh\.S\.",
    r"\bT\.Ư\.",
    r"\bT\.Ư\b",
    r"\bTP\.",
    r"\bTT\.",
    r"\bNXB\.",
    r"\bMr\.",
    r"\bMrs\.",
    r"\bMs\.",
    r"\bDr\.",
    r"\bProf\.",
    r"\bv\.v\.",
    r"\be\.g\.",
    r"\bi\.e\.",
    r"\bNo\.",
    r"\bSt\.",
]

DOT_PLACEHOLDER = "__DOT_TOKEN__"
ELLIPSIS_PLACEHOLDER = "__ELLIPSIS_TOKEN__"


try:
    from english_normalizer import normalize_english_for_tts
except ImportError:
    try:
        from pipeline.english_normalizer import normalize_english_for_tts
    except ImportError:
        from apps.web_reader.pipeline.english_normalizer import normalize_english_for_tts


def normalize_vietnamese_text(text: str) -> str:
    """Normalizes unusual whitespace, HTML entities, unicode characters, and English terms for TTS."""
    if not text:
        return ""
    text = html.unescape(text)
    # Replace non-breaking spaces and special spaces with standard space
    text = re.sub(r"[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]", " ", text)
    # Collapse consecutive spaces
    text = re.sub(r"[ \t]+", " ", text)
    # Apply English pronunciation normalizer
    try:
        text = normalize_english_for_tts(text)
    except Exception:
        pass
    return text.strip()


def extract_paragraphs(html_or_text: str) -> List[str]:
    """Extracts paragraphs from HTML or plain text, preserving block boundaries."""
    if not html_or_text:
        return []

    # Check if string contains HTML markup
    if "<" in html_or_text and ">" in html_or_text:
        soup = BeautifulSoup(html_or_text, "html.parser")
        # Remove script and style tags
        for tag in soup(["script", "style", "head", "title"]):
            tag.decompose()

        # Add newline delimiter after block elements to ensure paragraph separation
        for block in soup.find_all(
            ["p", "div", "br", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "hr", "tr"]
        ):
            block.append("\n")

        raw_text = soup.get_text()
    else:
        raw_text = html_or_text

    raw_paragraphs = raw_text.split("\n")
    cleaned_paragraphs = []
    for p in raw_paragraphs:
        p_clean = normalize_vietnamese_text(p)
        if p_clean:
            cleaned_paragraphs.append(p_clean)

    return cleaned_paragraphs


def split_paragraph_into_sentences(paragraph: str) -> List[str]:
    """Splits a single paragraph into discrete sentences, protecting abbreviations."""
    if not paragraph or not paragraph.strip():
        return []

    work = paragraph.strip()

    # 1. Protect numbers with decimals (e.g., 3.14, 8.30)
    work = re.sub(r"(\d+)\.(\d+)", rf"\1{DOT_PLACEHOLDER}\2", work)

    # 2. Protect abbreviations
    for abbrev_pattern in ABBREVIATIONS:
        def _replace_abbrev_dot(match: re.Match) -> str:
            return match.group(0).replace(".", DOT_PLACEHOLDER)
        work = re.sub(abbrev_pattern, _replace_abbrev_dot, work, flags=re.IGNORECASE)

    # 3. Protect ellipses (... and …)
    work = re.sub(r"\.{3,}", ELLIPSIS_PLACEHOLDER, work)
    work = re.sub(r"…", ELLIPSIS_PLACEHOLDER, work)

    # 4. Split sentences on terminators (. ! ? or ellipsis) followed by quotes, space, or end of string
    # We match the delimiter and keep it attached to the preceding sentence
    terminator_pattern = rf"((?:[.!?]|{ELLIPSIS_PLACEHOLDER})+[\"\'”’]?(?:\s+|$))"
    tokens = re.split(terminator_pattern, work)

    sentences = []
    current_sentence = ""
    for token in tokens:
        if not token:
            continue
        current_sentence += token
        if re.search(terminator_pattern, token):
            cleaned = current_sentence.strip()
            if cleaned:
                sentences.append(cleaned)
            current_sentence = ""

    if current_sentence.strip():
        sentences.append(current_sentence.strip())

    # 5. Restore placeholders and clean up
    restored_sentences = []
    for s in sentences:
        s_restored = s.replace(DOT_PLACEHOLDER, ".").replace(ELLIPSIS_PLACEHOLDER, "...")
        s_restored = normalize_vietnamese_text(s_restored)
        if s_restored:
            restored_sentences.append(s_restored)

    return restored_sentences


def split_into_cues(html_or_text: str, start_index: int = 1) -> List[Dict[str, Any]]:
    """Splits Vietnamese text/HTML into a list of cue dictionaries.

    Returns:
        List of dicts: [{"id": "cue-1", "text": "Sentence text..."}, ...]
    """
    if not html_or_text or not html_or_text.strip():
        return []

    paragraphs = extract_paragraphs(html_or_text)
    cues: List[Dict[str, Any]] = []
    cue_idx = start_index

    for para in paragraphs:
        sentences = split_paragraph_into_sentences(para)
        for s in sentences:
            cues.append({
                "id": f"cue-{cue_idx}",
                "text": s,
            })
            cue_idx += 1

    return cues


def format_cues_html(cues: List[Dict[str, Any]]) -> str:
    """Formats a list of cues into reader-ready HTML with cue IDs and optional timing data."""
    html_lines = []
    for cue in cues:
        cue_id = cue.get("id", "")
        text = html.escape(cue.get("text", ""))
        start = cue.get("start")
        end = cue.get("end")

        if start is not None and end is not None:
            line = f'<p id="{cue_id}" data-start="{start}" data-end="{end}" class="reader-paragraph">{text}</p>'
        else:
            line = f'<p id="{cue_id}" class="reader-paragraph">{text}</p>'
        html_lines.append(line)

    return "\n".join(html_lines)
