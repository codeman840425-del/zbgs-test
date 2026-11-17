"""Two tiny known systems establish signed-free HiGHS API semantics."""
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
from solve import solve

# c >= -.02 permits the negative coefficient required by b=-.01.
feasible = solve([[1]], [-.01], [[1]], [.02], .002, 10)
# c >= 0 conflicts with c in [-.012,-.008].
infeasible = solve([[1]], [-.01], [[1]], [0], .002, 10)
passed = (feasible['status'] == 'proxy-feasible' and
          abs(feasible['optimalT_M']-.008) < 1e-10 and
          feasible['coefficientsM'][0] < 0 and
          infeasible['status'] == 'proxy-infeasible')
report = {'schema': 'head-cage-feasibility-api-check-v1', 'passed': passed,
          'scope': 'two known scalar systems; no source character data',
          'feasible': feasible, 'infeasible': infeasible}
output = Path(sys.argv[1])
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
print(json.dumps({'passed': passed, 'feasible': feasible['status'],
                  'infeasible': infeasible['status']}))
raise SystemExit(0 if passed else 1)
