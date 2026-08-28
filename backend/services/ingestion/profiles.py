import hashlib
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from backend.models import SchemaProfile

class MappingProfileManager:
    """
    Manages Schema Profiles (Mapping Memory):
    - Computes structural schema fingerprint
    - Matches incoming datasets against known confirmed profiles
    - Saves confirmed mappings for future instant suggestions without retraining LLMs.
    """

    @staticmethod
    def compute_fingerprint(column_names: List[str]) -> str:
        """Computes a deterministic hash of sorted, normalized column names."""
        normalized = sorted([c.lower().strip() for c in column_names if c])
        raw_str = "|".join(normalized)
        return hashlib.sha256(raw_str.encode("utf-8")).hexdigest()[:24]

    @classmethod
    def find_matching_profile(cls, db: Session, column_names: List[str], org_id: str = "default") -> Optional[Dict[str, Any]]:
        fingerprint = cls.compute_fingerprint(column_names)
        profile = (
            db.query(SchemaProfile)
            .filter(
                SchemaProfile.organization_id == org_id,
                SchemaProfile.fingerprint == fingerprint,
                SchemaProfile.confirmed_by_user == True
            )
            .order_by(SchemaProfile.usage_count.desc())
            .first()
        )

        if profile and profile.mapping_json:
            return {
                "profile_id": profile.id,
                "fingerprint": profile.fingerprint,
                "mapping": profile.mapping_json,
                "usage_count": profile.usage_count,
                "match_type": "EXACT_PROFILE_MATCH"
            }

        return None

    @classmethod
    def save_confirmed_mapping(cls, db: Session, column_names: List[str], mapping: Dict[str, Any], org_id: str = "default") -> SchemaProfile:
        fingerprint = cls.compute_fingerprint(column_names)
        profile = (
            db.query(SchemaProfile)
            .filter(SchemaProfile.organization_id == org_id, SchemaProfile.fingerprint == fingerprint)
            .first()
        )

        clean_mapping = {
            "case_id": mapping.get("case_id"),
            "activity": mapping.get("activity"),
            "timestamp": mapping.get("timestamp"),
            "actor": mapping.get("actor"),
            "department": mapping.get("department"),
            "custom_attributes": mapping.get("custom_attributes", {})
        }

        if profile:
            profile.mapping_json = clean_mapping
            profile.usage_count += 1
            profile.confirmed_by_user = True
        else:
            profile = SchemaProfile(
                organization_id=org_id,
                fingerprint=fingerprint,
                column_signature_json=column_names,
                mapping_json=clean_mapping,
                confirmed_by_user=True,
                usage_count=1
            )
            db.add(profile)

        db.commit()
        db.refresh(profile)
        return profile
