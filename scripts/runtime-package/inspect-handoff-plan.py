"""Read-only diagnostic replay using the selected operator's own planner."""
import json
from pathlib import Path
import sys


def main():
    operator, runtime, delivery, matrix_path, request_path = map(Path, sys.argv[1:])
    sys.path.insert(0, str(operator / "scripts" / "production"))
    import variant_batch as planner

    matrix = planner.read_json(matrix_path)
    request = planner.read_json(request_path)
    errors = planner.validate_matrix_files(matrix, delivery)
    if errors:
        raise ValueError("; ".join(errors))
    queries, members, _ = planner.resolve_runtime(matrix, request, runtime, True, False)
    result = planner.plan(matrix, request, queries=queries, members=members, diagnostic=True)
    print(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()
