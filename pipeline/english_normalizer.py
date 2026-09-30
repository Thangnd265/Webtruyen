"""English Pronunciation and Terminology Normalizer for VieNeu-TTS.

Preserves English words without forced Vietnamese translation while optimizing
them for clean, crisp, natural pronunciation by VieNeu-TTS neural engine:
1. Fixes All-Caps words (e.g., STATUS -> Status, LEVEL -> Level).
2. Expands gaming acronyms with spaces (e.g., HP -> H P, MP -> M P, EXP -> E X P).
3. Strips obstructive brackets around terms (e.g., [Status] -> Status).
4. Hyphenates complex fantasy/foreign names for clear syllable articulation (e.g., Rosenheim -> Ro-zen-haim).
5. Supports per-book custom glossary dictionaries.
"""

from __future__ import annotations

import re
from typing import Dict, Optional

# Standard gaming acronyms that should be read letter-by-letter
GAMING_ACRONYMS: Dict[str, str] = {
    "HP": "H P",
    "MP": "M P",
    "EXP": "E X P",
    "SP": "S P",
    "AP": "A P",
    "DPS": "D P S",
    "AOE": "A O E",
    "PK": "P K",
    "PVP": "P V P",
    "PvP": "P V P",
    "PVE": "P V E",
    "PvE": "P V E",
    "NPC": "N P C",
    "VIP": "V I P",
    "GM": "G M",
    "STR": "S T R",
    "DEX": "D E X",
    "INT": "I N T",
    "VIT": "V I T",
    "AGI": "A G I",
    "LUK": "L U K",
    "CD": "C D",
    "DOT": "D O T",
    "CC": "C C",
}

# Standard English terms often written in ALL CAPS that should be TitleCase
COMMON_ALL_CAPS_TERMS = {
    "STATUS": "Status",
    "LEVEL": "Level",
    "SKILL": "Skill",
    "ITEM": "Item",
    "DAMAGE": "Damage",
    "BOSS": "Boss",
    "QUEST": "Quest",
    "MONSTER": "Monster",
    "GUILD": "Guild",
    "INVENTORY": "Inventory",
    "CRITICAL": "Critical",
    "WEED": "Weed",
    "ATTACK": "Attack",
    "DEFENSE": "Defense",
    "MANA": "Mana",
    "BUFF": "Buff",
    "DEBUFF": "Debuff",
    "COOLDOWN": "Cooldown",
    "DROP": "Drop",
    "RANK": "Rank",
    "SOLO": "Solo",
    "FARM": "Farm",
    "SERVER": "Server",
    "GAME": "Game",
    "OVER": "Over",
}

# Syllable hyphenation for fantasy and complex foreign names to ensure clear articulation
DEFAULT_SYLLABLE_MAP: Dict[str, str] = {
    "Rosenheim": "Ro-zen-haim",
    "rosenheim": "Ro-zen-haim",
    "Serabourg": "Se-ra-burg",
    "serabourg": "Se-ra-burg",
    "Necromancer": "Ne-cro-man-cer",
    "necromancer": "ne-cro-man-cer",
    "Alveron": "Al-ve-ron",
    "alveron": "al-ve-ron",
    "Zahab": "Za-hab",
    "zahab": "za-hab",
    "Darius": "Da-ri-us",
    "darius": "da-ri-us",
    "Geihar": "Gei-har",
    "geihar": "gei-har",
    "Freya": "Fre-ya",
    "freya": "fre-ya",
    "Mapan": "Ma-pan",
    "mapan": "ma-pan",
    "Surka": "Sur-ka",
    "surka": "sur-ka",
    "Romuna": "Ro-mu-na",
    "romuna": "ro-mu-na",
    "Zephyr": "Ze-phyr",
    "zephyr": "ze-phyr",
}


def normalize_english_for_tts(
    text: str,
    custom_glossary: Optional[Dict[str, str]] = None,
) -> str:
    """Normalizes English words and terms within Vietnamese text for optimal VieNeu pronunciation."""
    if not text:
        return ""

    out = text

    # 1. Custom user glossary rules take highest priority
    if custom_glossary:
        for k, v in custom_glossary.items():
            if k and v:
                pattern = re.compile(rf"\b{re.escape(k)}\b", re.IGNORECASE)
                out = pattern.sub(v, out)

    # 2. Syllable hyphenation for fantasy names
    for name, hyphenated in DEFAULT_SYLLABLE_MAP.items():
        pattern = re.compile(rf"\b{re.escape(name)}\b")
        out = pattern.sub(hyphenated, out)

    # 3. Gaming acronyms (e.g. HP -> H P, EXP -> E X P)
    for acr, spaced in GAMING_ACRONYMS.items():
        pattern = re.compile(rf"\b{re.escape(acr)}\b")
        out = pattern.sub(spaced, out)

    # 4. Common ALL-CAPS words to TitleCase (e.g. STATUS -> Status)
    for cap, titled in COMMON_ALL_CAPS_TERMS.items():
        pattern = re.compile(rf"\b{re.escape(cap)}\b")
        out = pattern.sub(titled, out)

    # 5. Clean obstructive brackets around words: [Status] -> Status, 【Skill】 -> Skill
    out = re.sub(r"[\[【]([A-Za-z0-9\s_-]+)[\]】]", r" \1 ", out)

    # 6. Normalize stat notation: Level: 50 or Level:50 -> Level 50
    out = re.sub(r"\b(Level|Cấp|Lv|lv)\s*[:：]\s*(\d+)", r"\1 \2", out)

    # 7. Collapse any resulting multiple spaces
    out = re.sub(r"[ \t]+", " ", out).strip()

    return out


if __name__ == "__main__":
    sample = (
        "Weed mỉm cười nhìn vào bảng [STATUS]. LEVEL của cậu đã tăng lên Level 50, "
        "HP và MP đầy ắp. Cậu sử dụng SKILL triệu hồi Necromancer để tấn công Boss tại vương quốc Rosenheim!"
    )
    print("ORIGINAL:")
    print(sample)
    print("\nNORMALIZED:")
    print(normalize_english_for_tts(sample))
