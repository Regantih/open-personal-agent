"""Validate every Open Memory Format example against the schema."""
import json
import pathlib
import sys

import jsonschema

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCHEMA = ROOT / "spec" / "open-memory-format" / "schema.json"
EXAMPLES = sorted((ROOT / "spec" / "open-memory-format" / "examples").glob("*.json"))

schema = json.loads(SCHEMA.read_text())
jsonschema.Draft202012Validator.check_schema(schema)
validator = jsonschema.Draft202012Validator(schema)

failed = False
for path in EXAMPLES:
    errors = sorted(validator.iter_errors(json.loads(path.read_text())), key=str)
    if errors:
        failed = True
        print(f"FAIL {path.relative_to(ROOT)}")
        for err in errors:
            print(f"  - {err.json_path}: {err.message}")
    else:
        print(f"ok   {path.relative_to(ROOT)}")

sys.exit(1 if failed else 0)
