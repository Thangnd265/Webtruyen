import pytest
from apps.web_reader.pipeline.text_splitter import split_into_cues, format_cues_html


def test_split_vietnamese_sentences():
    raw_html = "<p>Mặt trời vừa ló dạng sau núi. Tiếng suối reo róc rách!</p><p>Hắn đứng dậy, nhìn về phương xa...</p>"
    cues = split_into_cues(raw_html)
    assert len(cues) == 3
    assert cues[0]["text"] == "Mặt trời vừa ló dạng sau núi."
    assert cues[0]["id"] == "cue-1"
    assert cues[1]["text"] == "Tiếng suối reo róc rách!"
    assert cues[1]["id"] == "cue-2"
    assert cues[2]["text"] == "Hắn đứng dậy, nhìn về phương xa..."
    assert cues[2]["id"] == "cue-3"


def test_split_dialogue_and_quotes():
    raw_text = """
    — Ngươi là ai? Hắn lạnh lùng hỏi.
    — Ta là kiếm khách giang hồ!
    "Thật không ngờ..." Nàng khẽ thở dài.
    """
    cues = split_into_cues(raw_text)
    texts = [c["text"] for c in cues]
    assert "— Ngươi là ai?" in texts
    assert "Hắn lạnh lùng hỏi." in texts
    assert "— Ta là kiếm khách giang hồ!" in texts
    assert '"Thật không ngờ..."' in texts or "“Thật không ngờ...”" in texts or "Thật không ngờ..." in texts
    assert "Nàng khẽ thở dài." in texts


def test_abbreviations_and_decimals_not_split():
    text = "<p>TS. Nguyễn Văn Nam đến TP. Hồ Chí Minh lúc 8.30 sáng với giá 3.5 triệu đồng v.v.. Đó là sự thật.</p>"
    cues = split_into_cues(text)
    # Should not split on TS. or TP. or 8.30 or 3.5 or v.v..
    assert len(cues) == 2
    assert "TS. Nguyễn Văn Nam" in cues[0]["text"]
    assert "TP. Hồ Chí Minh" in cues[0]["text"]
    assert cues[1]["text"] == "Đó là sự thật."


def test_empty_and_whitespace():
    assert split_into_cues("") == []
    assert split_into_cues("<p>   </p><div>\n\n</div>") == []
    assert split_into_cues("   \n\t  ") == []


def test_format_cues_html():
    cues = [
        {"id": "cue-1", "start": 0.0, "end": 2.5, "text": "Câu thứ nhất."},
        {"id": "cue-2", "start": 2.5, "end": 5.12, "text": "Câu thứ hai."},
    ]
    html = format_cues_html(cues)
    assert '<p id="cue-1" data-start="0.0" data-end="2.5" class="reader-paragraph">Câu thứ nhất.</p>' in html
    assert '<p id="cue-2" data-start="2.5" data-end="5.12" class="reader-paragraph">Câu thứ hai.</p>' in html


def test_html_formatting_and_inline_tags():
    raw_html = "<div><p>Đây là <b>chữ đậm</b> và <i>chữ nghiêng</i>! Tuyệt vời quá.</p></div>"
    cues = split_into_cues(raw_html)
    assert len(cues) == 2
    assert cues[0]["text"] == "Đây là chữ đậm và chữ nghiêng!"
    assert cues[1]["text"] == "Tuyệt vời quá."


def test_custom_start_index():
    cues = split_into_cues("Một câu duy nhất.", start_index=10)
    assert len(cues) == 1
    assert cues[0]["id"] == "cue-10"

