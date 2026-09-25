import re
from typing import Dict, Any, List

class IntentRouter:
    """
    Classifies incoming user questions into one of seven Core Pio_AI Answer Types:
    - FACT_LOOKUP
    - PROCESS_ANALYSIS
    - COMPARISON
    - DIAGNOSIS
    - RECOMMENDATION
    - SCENARIO
    - VARIANT_ANALYSIS
    """

    @classmethod
    def route_question(cls, question: str, context: Dict[str, Any] = None) -> Dict[str, Any]:
        q = question.lower().strip()

        # 0. CONVERSATION / GREETING INTENT
        # Filter casual greetings or non-analytical chat: "hai", "halo", "terima kasih", "siapa kamu", etc.
        greetings = [
            "hai", "halo", "hello", "hei", "hi", "pagi", "siang", "sore", "malam",
            "tes", "test", "assalamualaikum", "siapa kamu", "kamu siapa", "kamu bisa apa",
            "bisa apa kamu", "terima kasih", "makasih", "thanks", "thank you", "apa kabar"
        ]
        is_process_query = any(k in q for k in [
            "proses", "process", "bottleneck", "hambatan", "sla", "delay", "lambat",
            "waktu", "siklus", "varian", "variant", "rework", "jalur", "finding",
            "kasus", "transisi", "aktivitas", "mengapa", "kenapa", "bagaimana", "rekomendasi"
        ])
        q_clean = re.sub(r"[^\w\s]", "", q).strip()
        if (any(q_clean == g or q_clean.startswith(g + " ") or q_clean.endswith(" " + g) for g in greetings)
            or any(q == g or q.startswith(g + " ") or q.endswith(" " + g) for g in greetings)) and not is_process_query:
            return {
                "intent": "CONVERSATION",
                "required_data": [],
                "entities": {}
            }

        # 1. SCENARIO INTENT
        if any(k in q for k in ["kalau", "jika", "seandainya", "simulasi", "skenario", "dikurangi", "ditingkatkan", "what-if", "what if"]):
            return {
                "intent": "SCENARIO",
                "required_data": ["metrics", "process_graph", "scenarios"],
                "entities": cls._extract_entities(q)
            }

        # 2. FACT_LOOKUP INTENT
        # Specific point queries: "Berapa median cycle time?", "Berapa total case?", "Berapa persen SLA?"
        if any(q.startswith(p) for p in ["berapa", "total", "jumlah", "skor", "nilai"]) and not any(k in q for k in ["kenapa", "mengapa", "sebab", "bagaimana", "rekomendasi"]):
            return {
                "intent": "FACT_LOOKUP",
                "required_data": ["metrics", "summary"],
                "entities": cls._extract_entities(q)
            }

        # 3. VARIANT_ANALYSIS INTENT
        if any(k in q for k in ["varian", "variant", "jalur", "path", "rute"]):
            return {
                "intent": "VARIANT_ANALYSIS",
                "required_data": ["variants", "metrics"],
                "entities": cls._extract_entities(q)
            }

        # 4. COMPARISON INTENT
        if any(k in q for k in ["banding", "dibanding", "perbedaan", "department mana", "departemen mana", "tim mana", "siapa paling", "mana yang paling"]):
            return {
                "intent": "COMPARISON",
                "required_data": ["departments", "actors", "metrics"],
                "entities": cls._extract_entities(q)
            }

        # 5. RECOMMENDATION INTENT
        if any(k in q for k in ["rekomendasi", "saran", "apa yang sebaiknya", "solusi", "langkah perbaikan", "tindakan", "otomatisasi"]):
            return {
                "intent": "RECOMMENDATION",
                "required_data": ["findings", "transitions", "metrics"],
                "entities": cls._extract_entities(q)
            }

        # 6. PROCESS_ANALYSIS INTENT
        if any(k in q for k in ["bagaimana proses", "bagaimana alur", "jelaskan alur", "ringkas proses", "cara kerja proses", "alur keseluruhan", "alur proses"]):
            return {
                "intent": "PROCESS_ANALYSIS",
                "required_data": ["process_graph", "variants", "metrics"],
                "entities": cls._extract_entities(q)
            }

        # 7. DIAGNOSIS (Default deep diagnostic intent: "Kenapa lambat?", "Apa penyebab?", "Bottleneck?")
        return {
            "intent": "DIAGNOSIS",
            "required_data": ["findings", "metrics", "transitions", "variants", "sla"],
            "entities": cls._extract_entities(q)
        }

    @staticmethod
    def _extract_entities(query: str) -> Dict[str, Any]:
        entities = {}
        # Variant match (e.g. "variant 2" or "varian #1")
        var_match = re.search(r"(?:varian|variant)\s*(?:#|\b)?(\d+)", query)
        if var_match:
            entities["variant_rank"] = int(var_match.group(1))

        # Percentage match (e.g. "30%")
        pct_match = re.search(r"(\d+(?:\.\d+)?)\s*%", query)
        if pct_match:
            entities["percentage"] = float(pct_match.group(1))

        return entities
