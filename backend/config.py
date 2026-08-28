import os
from pydantic import BaseModel

class Settings(BaseModel):
    PROJECT_NAME: str = "FlowMind"
    API_V1_STR: str = "/api/v1"
    ENGINE_VERSION: str = "0.1.0"
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./flowmind.db")
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "./uploads")
    LLAMA_CPP_URL: str = os.getenv("LLAMA_CPP_URL", "http://127.0.0.1:8080/v1")
    LLAMA_CPP_MODEL: str = os.getenv("LLAMA_CPP_MODEL", "local-model")
    LLM_TIMEOUT: float = float(os.getenv("LLM_TIMEOUT", "15.0"))

settings = Settings()
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
