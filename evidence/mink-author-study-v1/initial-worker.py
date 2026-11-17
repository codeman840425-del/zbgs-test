"""Run unchanged author source with a finite headless display adapter and observers."""
import ast
import hashlib
import importlib.metadata
import json
from pathlib import Path
import runpy
import time
import traceback
import unittest

import mujoco
import mujoco.viewer
import numpy as np
from loop_rate_limiters import RateLimiter
import mink

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = Path(__file__).resolve().parent
SOURCE = ROOT / 'experiments/tools/mink-author-study/source'
GENERATED = PACKAGE / 'generated'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class HeadlessDisplay:
    """Replace display lifetime/sync only. There is no target or solver mutation."""
    def __init__(self, **kwargs):
        self.cam = mujoco.MjvCamera()
        self.iterations = 0
        self.syncs = 0

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def is_running(self):
        if self.iterations == 200:
            return False
        self.iterations += 1
        return True

    def sync(self):
        self.syncs += 1


def main():
    if GENERATED.exists():
        raise ValueError('Refusing to overwrite an existing execution')
    GENERATED.mkdir()
    report = {'schema': 'mink-author-study-result-v1', 'status': 'running',
              'commit': '5f800f0a369d05bab88b5e5582cf95122d3b82a5',
              'gpuRendering': False, 'training': False, 'vrmTested': False,
              'nativeLieAcceleration': False, 'displayIterationLimit': 200}
    records = {'ur5eOriginalExample': [], 'authorActiveCollisionTest': []}
    case_name = 'ur5eOriginalExample'
    pending = None
    original_solve = mink.solve_ik
    original_integrate = mink.Configuration.integrate_inplace
    original_launch = mujoco.viewer.launch_passive
    original_sleep = RateLimiter.sleep

    def distances(configuration, pairs):
        values = []
        for first, second in pairs:
            values.append(float(mujoco.mj_geomDistance(configuration.model, configuration.data,
                                                     first, second, 100., np.empty(6))))
        return values

    def observe_solve(configuration, tasks, dt, solver, *args, **kwargs):
        nonlocal pending
        limits = kwargs.get('limits', [])
        collisions = [limit for limit in limits if isinstance(limit, mink.CollisionAvoidanceLimit)]
        pairs = [pair for limit in collisions for pair in limit.geom_id_pairs]
        constraints = [limit.compute_qp_inequalities(configuration, dt) for limit in collisions]
        before = configuration.q.copy()
        gaps = distances(configuration, pairs)
        started = time.perf_counter()
        velocity = original_solve(configuration, tasks, dt, solver, *args, **kwargs)
        elapsed = time.perf_counter() - started
        active = [(constraint.G[np.isfinite(constraint.h)], constraint.h[np.isfinite(constraint.h)])
                  for constraint in constraints if constraint.G is not None]
        residual = max([float(np.max(G @ (velocity * dt) - h)) for G, h in active if len(h)] or [0.])
        pending = {'dt': dt, 'solver': solver, 'qBefore': before.tolist(),
                   'velocity': velocity.tolist(), 'solveSeconds': elapsed,
                   'distanceBeforeM': gaps, 'actualGeomIdPairs': [list(pair) for pair in pairs],
                   'actualGeomNamePairs': [[configuration.model.geom(a).name,
                                           configuration.model.geom(b).name] for a, b in pairs],
                   'activeCollisionRows': sum(len(h) for _, h in active),
                   'maximumCollisionInequalityResidualM': residual,
                   'activeG': [G.tolist() for G, _ in active],
                   'activeH': [h.tolist() for _, h in active],
                   'taskErrorsBefore': [task.compute_error(configuration).tolist() for task in tasks]}
        assert np.isfinite(velocity).all()
        pending['_tasks'] = tasks
        return velocity

    def observe_integrate(configuration, velocity, dt):
        original_integrate(configuration, velocity, dt)
        assert pending is not None
        pending['qAfter'] = configuration.q.tolist()
        pending['distanceAfterM'] = distances(configuration, pending['actualGeomIdPairs'])
        pending['taskErrorsAfter'] = [task.compute_error(configuration).tolist()
                                     for task in pending.pop('_tasks')]
        assert np.isfinite(configuration.q).all()
        records[case_name].append(pending.copy())

    try:
        assert Path(mink.__file__).resolve().is_relative_to(SOURCE.resolve())
        mink.solve_ik = observe_solve
        mink.Configuration.integrate_inplace = observe_integrate
        mujoco.viewer.launch_passive = HeadlessDisplay
        RateLimiter.sleep = lambda self: None
        example = SOURCE / 'examples/arm_ur5e.py'
        assert example.read_bytes() == (PACKAGE / 'original/arm_ur5e.py').read_bytes()
        state = runpy.run_path(str(example), run_name='__main__')
        assert len(records[case_name]) == 200
        assert state['viewer'].syncs == 200
        report['ur5e'] = {'originalExampleSha256': digest(example),
                          'nq': state['model'].nq, 'nv': state['model'].nv,
                          'initialQ': records[case_name][0]['qBefore'],
                          'finalQ': state['configuration'].q.tolist(),
                          'collisionGroups': state['collision_pairs'],
                          'limitTypes': [type(limit).__name__ for limit in state['limits']],
                          'velocityLimitsRadPerSecond': state['max_velocities'],
                          'dt': state['rate'].dt, 'iterations': 200,
                          'targetInput': 'Original home-matched mocap; no simulated pointer movement',
                          'solver': state['solver']}

        case_name = 'authorActiveCollisionTest'
        test_path = SOURCE / 'tests/test_collision_avoidance_limit.py'
        assert test_path.read_bytes() == (PACKAGE / 'original/test_collision_avoidance_limit.py').read_bytes()
        tree = ast.parse(test_path.read_text(encoding='utf-8'))
        test_class = next(node for node in tree.body if isinstance(node, ast.ClassDef)
                          and node.name == 'TestCollisionAvoidanceLimit')
        method = next(node for node in test_class.body if isinstance(node, ast.FunctionDef)
                      and node.name == 'test_step_closes_gain_fraction_of_gap_independent_of_dt')
        namespace = {'mujoco': mujoco, 'np': np, 'SE3': mink.SE3,
                     'Configuration': mink.Configuration, 'FrameTask': mink.FrameTask,
                     'CollisionAvoidanceLimit': mink.CollisionAvoidanceLimit,
                     'solve_ik': observe_solve}
        # Extract an unchanged self-contained author method. Avoid unrelated class setup
        # downloading robot_descriptions assets that this method never consumes.
        exec(compile(ast.Module(body=[method], type_ignores=[]), str(test_path), 'exec'), namespace)
        namespace[method.name](unittest.TestCase())
        assert len(records[case_name]) == 4
        report['activeCollisionTest'] = {'sourceSha256': digest(test_path), 'method': method.name,
                                         'sourceLines': [method.lineno, method.end_lineno],
                                         'originalAssertionsPassed': True,
                                         'setupDifference': 'Only the self-contained original method is called; unrelated UR5e class setup is omitted',
                                         'goal': 'Original SE3.identity(), no target edits',
                                         'minimumDistanceM': .005, 'gain': .85,
                                         'detectionDistanceM': .1, 'iterations': 4}
        report['status'] = 'original-author-headless-samples-passed'
        report['environmentCorrectionCount'] = 0
    except Exception:
        report['status'] = 'failed'
        report['traceback'] = traceback.format_exc()
        raise
    finally:
        mink.solve_ik = original_solve
        mink.Configuration.integrate_inplace = original_integrate
        mujoco.viewer.launch_passive = original_launch
        RateLimiter.sleep = original_sleep
        report['versions'] = {name: importlib.metadata.version(name) for name in [
            'mujoco', 'qpsolvers', 'daqp', 'numpy', 'scipy', 'loop-rate-limiters', 'absl-py']}
        report['minkSourcePath'] = str(Path(mink.__file__).resolve())
        (GENERATED / 'trace.json').write_text(json.dumps(records, indent=2, allow_nan=False) + '\n', encoding='utf-8')
        (GENERATED / 'report.json').write_text(json.dumps(report, indent=2, allow_nan=False) + '\n', encoding='utf-8')
        print(json.dumps(report, allow_nan=False), flush=True)


if __name__ == '__main__':
    main()
