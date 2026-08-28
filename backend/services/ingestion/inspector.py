import re
from typing import Dict, Any, List
import pandas as pd
import numpy as np

class SchemaInspector:
    """
    Performs deep profiling of dataset columns beyond literal names:
    - Data type inference
    - Cardinality & uniqueness ratio
    - Null rate
    - Pattern regex detection
    - Temporal / datetime parseability
    - Repetition and relationship characteristics
    """

    @staticmethod
    def inspect_dataframe(df: pd.DataFrame) -> Dict[str, Any]:
        total_rows = len(df)
        if total_rows == 0:
            return {
                "total_rows": 0,
                "total_columns": 0,
                "columns": [],
                "column_names": []
            }

        columns_profile = []

        for col in df.columns:
            series = df[col]
            non_null = series.dropna()
            non_null_count = len(non_null)
            null_count = total_rows - non_null_count
            null_rate = round(null_count / total_rows, 4)

            unique_count = int(series.nunique())
            unique_ratio = round(unique_count / total_rows, 4) if total_rows > 0 else 0.0

            # Sample values (up to 5 unique non-null samples)
            sample_values = [str(x) for x in non_null.unique()[:5].tolist()]

            # Type & temporal detection
            inferred_type = "string"
            is_datetime_candidate = False
            datetime_parse_rate = 0.0

            if pd.api.types.is_numeric_dtype(series):
                if pd.api.types.is_integer_dtype(series):
                    inferred_type = "integer"
                else:
                    inferred_type = "float"
            elif pd.api.types.is_bool_dtype(series):
                inferred_type = "boolean"
            elif pd.api.types.is_datetime64_any_dtype(series):
                inferred_type = "datetime"
                is_datetime_candidate = True
                datetime_parse_rate = 1.0
            else:
                # Test string parseability to datetime
                if non_null_count > 0:
                    test_sample = non_null.head(50)
                    try:
                        parsed = pd.to_datetime(test_sample, errors="coerce", format="mixed")
                        valid_parsed = parsed.notnull().sum()
                        datetime_parse_rate = round(valid_parsed / len(test_sample), 2)
                        if datetime_parse_rate >= 0.8:
                            is_datetime_candidate = True
                            inferred_type = "datetime"
                    except Exception:
                        pass

            # Detect regex pattern
            pattern = None
            if sample_values:
                first_val = sample_values[0]
                if re.match(r"^[A-Za-z]{1,4}\d+$", first_val):
                    pattern = r"^[A-Za-z]+\d+$"
                elif re.match(r"^\d{4}-\d{2}-\d{2}", first_val):
                    pattern = r"YYYY-MM-DD"
                elif re.match(r"^[0-9a-fA-F-]{32,36}$", first_val):
                    pattern = r"UUID"

            # Qualification heuristics
            is_case_id_candidate = (
                unique_ratio >= 0.05 and
                unique_count >= 2 and
                inferred_type in ("string", "integer") and
                not is_datetime_candidate
            )

            is_activity_candidate = (
                unique_count >= 2 and
                (unique_count <= 200 or unique_ratio <= 0.2) and
                inferred_type == "string" and
                not is_datetime_candidate
            )

            is_resource_candidate = (
                unique_count >= 2 and
                unique_count <= 2000 and
                inferred_type in ("string", "integer") and
                not is_datetime_candidate
            )

            columns_profile.append({
                "name": str(col),
                "dtype": inferred_type,
                "null_count": int(null_count),
                "null_rate": null_rate,
                "unique_count": unique_count,
                "unique_ratio": unique_ratio,
                "sample_values": sample_values,
                "pattern": pattern,
                "is_datetime_candidate": is_datetime_candidate,
                "datetime_parse_rate": datetime_parse_rate,
                "is_case_id_candidate": bool(is_case_id_candidate),
                "is_activity_candidate": bool(is_activity_candidate),
                "is_resource_candidate": bool(is_resource_candidate)
            })

        return {
            "total_rows": total_rows,
            "total_columns": len(df.columns),
            "column_names": [str(c) for c in df.columns],
            "columns": columns_profile
        }
