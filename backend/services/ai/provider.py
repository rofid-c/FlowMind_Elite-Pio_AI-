import os
import json
import shutil
import logging
import subprocess
import urllib.request
import urllib.error
from typing import Dict, Any, Optional
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)

class AIProvider(ABC):
    """Abstract interface for Process Intelligence AI Providers."""
    
    @abstractmethod
    def generate_response(
        self,
        system_prompt: str,
        context_data: Dict[str, Any],
        user_question: str
    ) -> Optional[Dict[str, Any]]:
        pass


class GeminiDirectAPIProvider(AIProvider):
    """
    Direct Google Gemini REST API Provider (Gemini 2.0 Flash / 1.5 Flash).
    Fast, reliable, and uses GEMINI_API_KEY or GOOGLE_API_KEY environment variable.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

    def is_available(self) -> bool:
        return bool(self.api_key and len(self.api_key.strip()) > 10)

    def generate_response(
        self,
        system_prompt: str,
        context_data: Dict[str, Any],
        user_question: str
    ) -> Optional[Dict[str, Any]]:
        if not self.is_available():
            return None

        prompt = (
            f"=== SYSTEM INSTRUCTIONS ===\n{system_prompt}\n\n"
            f"=== EVIDENCE CONTEXT ===\n{json.dumps(context_data, indent=2)}\n\n"
            f"=== USER QUESTION ===\n{user_question}\n\n"
            "=== OUTPUT FORMAT CONTRACT (PRD FlowMind v1) ===\n"
            "Respond strictly with a single RAW valid JSON object (NO markdown backticks, NO surrounding text) in BAHASA INDONESIA:\n"
            "{\n"
            '  "summary": "Ringkasan eksekutif 2-3 kalimat yang menjawab langsung pertanyaan user",\n'
            '  "evidence": [\n'
            '    {"metric": "Nama Metrik (e.g. Median Cycle Time / SLA / Bottleneck)", "value": "Nilai terukur (e.g. 11.2 jam / 86.3%)"}\n'
            '  ],\n'
            '  "possible_causes": [\n'
            '    "Dugaan penyebab 1 (misal: antrean ulasan menumpuk)",\n'
            '    "Dugaan penyebab 2 (misal: kapasitas reviewer terbatas)"\n'
            '  ],\n'
            '  "recommendation": "Investigasi antrean approval sebelum mengubah proses.",\n'
            '  "recommendations": [\n'
            '    "Investigasi antrean approval sebelum mengubah proses.",\n'
            '    "Gunakan simulasi pemotongan durasi pada menu Skenario What-If."\n'
            '  ],\n'
            '  "uncertainty": "Data event log tidak mencakup pencatatan timestamp antrean eksplisit di luar sistem.",\n'
            '  "follow_up_questions": ["Pertanyaan lanjutan 1", "Pertanyaan lanjutan 2"]\n'
            "}"
        )

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={self.api_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json"
            }
        }

        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=20) as resp:
                if resp.status == 200:
                    body = json.loads(resp.read().decode("utf-8"))
                    cand = body.get("candidates", [])[0]
                    text_out = cand.get("content", {}).get("parts", [])[0].get("text", "")
                    clean_text = text_out.strip()
                    if clean_text.startswith("```"):
                        clean_text = clean_text.split("\n", 1)[1] if "\n" in clean_text else clean_text
                        if clean_text.endswith("```"):
                            clean_text = clean_text.rsplit("```", 1)[0]
                    return json.loads(clean_text)
        except Exception as e:
            logger.warning(f"Gemini REST API generation failed: {e}")

        return None


class GeminiCLIProvider(AIProvider):
    """
    Adapter for Google Antigravity / Gemini CLI (`agy` preferred, then `gemini`).
    Prioritizes `agy` which uses the AGY session auth (no API key needed),
    over `gemini.CMD` (npm) which requires GEMINI_API_KEY.
    Handles CLI discovery, validation, timeout, and subprocess execution.
    """

    def __init__(self, timeout_seconds: int = 25):
        self.timeout_seconds = timeout_seconds
        # Prioritize `agy` (uses AGY session auth, always available)
        # over `gemini.CMD` from npm (requires GEMINI_API_KEY)
        self.cli_bin = self._discover_cli()

    def _discover_cli(self) -> Optional[str]:
        """Find a working CLI binary. Prioritize `agy` over `gemini`."""
        # 1. Try agy first (most reliable - uses session auth)
        agy = shutil.which("agy")
        if agy:
            logger.info(f"Using AGY CLI: {agy}")
            return agy
        # 2. Try agy from known install location
        agy_local = os.path.expandvars(r"%LOCALAPPDATA%\agy\bin\agy.exe")
        if os.path.exists(agy_local):
            logger.info(f"Using AGY CLI (local): {agy_local}")
            return agy_local
        # 3. Fall back to gemini only if GEMINI_API_KEY is set (else it will fail)
        gemini_cmd = shutil.which("gemini")
        if gemini_cmd and (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")):
            logger.info(f"Using Gemini CLI: {gemini_cmd}")
            return gemini_cmd
        # 4. Nothing usable
        return None

    def is_available(self) -> bool:
        return bool(self.cli_bin and os.path.exists(self.cli_bin))

    def generate_response(
        self,
        system_prompt: str,
        context_data: Dict[str, Any],
        user_question: str
    ) -> Optional[Dict[str, Any]]:
        # 1. First check if Direct API is configured (faster, more reliable)
        direct_prov = GeminiDirectAPIProvider()
        if direct_prov.is_available():
            res = direct_prov.generate_response(system_prompt, context_data, user_question)
            if res:
                return res

        if not self.is_available():
            return None

        prompt = (
            f"=== SYSTEM INSTRUCTIONS ===\n{system_prompt}\n\n"
            f"=== EVIDENCE CONTEXT ===\n{json.dumps(context_data, indent=2)}\n\n"
            f"=== USER QUESTION ===\n{user_question}\n\n"
            "=== OUTPUT FORMAT CONTRACT (PRD FlowMind v1) ===\n"
            "Respond strictly with a single RAW valid JSON object (NO markdown backticks, NO surrounding text) in BAHASA INDONESIA:\n"
            "{\n"
            '  "summary": "Ringkasan eksekutif 2-3 kalimat yang menjawab langsung pertanyaan user",\n'
            '  "evidence": [\n'
            '    {"metric": "Nama Metrik (e.g. Median Cycle Time / SLA / Bottleneck)", "value": "Nilai terukur (e.g. 11.2 jam / 86.3%)"}\n'
            '  ],\n'
            '  "possible_causes": [\n'
            '    "Dugaan penyebab 1 (misal: antrean ulasan menumpuk)",\n'
            '    "Dugaan penyebab 2 (misal: kapasitas reviewer terbatas)"\n'
            '  ],\n'
            '  "recommendation": "Investigasi antrean approval sebelum mengubah proses.",\n'
            '  "recommendations": [\n'
            '    "Investigasi antrean approval sebelum mengubah proses.",\n'
            '    "Gunakan simulasi pemotongan durasi pada menu Skenario What-If."\n'
            '  ],\n'
            '  "uncertainty": "Data event log tidak mencakup pencatatan timestamp antrean eksplisit di luar sistem.",\n'
            '  "follow_up_questions": ["Pertanyaan lanjutan 1", "Pertanyaan lanjutan 2"]\n'
            "}"
        )

        cmd = [self.cli_bin, "-p", prompt, "--output-format", "text"]

        for attempt in range(2):
            try:
                res = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=self.timeout_seconds,
                    encoding="utf-8",
                    errors="replace"
                )
                if res.returncode == 0 and res.stdout.strip():
                    raw = res.stdout.strip()
                    if raw.startswith("```"):
                        raw = raw.split("\n", 1)[1] if "\n" in raw else raw
                        if raw.endswith("```"):
                            raw = raw.rsplit("```", 1)[0]
                        raw = raw.strip()
                    parsed = json.loads(raw)
                    if isinstance(parsed, dict) and "summary" in parsed:
                        return parsed
            except subprocess.TimeoutExpired:
                logger.warning(f"Gemini CLI call timed out (attempt {attempt + 1})")
            except Exception as e:
                logger.warning(f"Gemini CLI call failed: {e}")

        return None
