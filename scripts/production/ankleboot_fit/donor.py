"""Read the original MakeClothes fitting rows and MPFB game-engine skin."""

import json
from collections import defaultdict

import numpy as np

from flow import require


def obj(path):
    vertices, uv, faces = [], [], []
    groups = defaultdict(set)
    group = ""
    for line in path.read_text().splitlines():
        row = line.split()
        if not row:
            continue
        if row[0] == "v":
            vertices.append(list(map(float, row[1:4])))
        elif row[0] == "vt":
            uv.append(list(map(float, row[1:3])))
        elif row[0] == "g":
            group = row[1]
        elif row[0] == "f":
            corners = [tuple(int(i) - 1 if i else -1 for i in pair.split("/")) for pair in row[1:]]
            groups[group].update(pair[0] for pair in corners)
            for i in range(1, len(corners) - 1):
                faces.append([corners[0], corners[i], corners[i + 1]])
    return np.array(vertices), np.array(uv), faces, groups


def read_donor(files, reference):
    original, uv, corners, _ = obj(files["boots_ankle_male.obj"])
    human, _, _, groups = obj(reference["base.obj"])
    lines = files["toigo_ankle_boots_male.mhclo"].read_text().splitlines()
    require("basemesh hm08" in lines and "# license CC0" in lines, "Unexpected clothes source")
    scales = []
    for dimension, axis in enumerate("xyz"):
        _, a, b, length = next(l.split() for l in lines if l.startswith(axis + "_scale "))
        scales.append(abs(human[int(a), dimension] - human[int(b), dimension]) / float(length))
    rows = []
    for line in lines[lines.index("verts 0") + 1 :]:
        row = line.split()
        if not row:
            continue
        if not row[0].isdigit():
            break
        require(len(row) == 9, "Expected authored three-vertex fit")
        rows.append(list(map(float, row)))
    rows = np.array(rows)
    require(len(rows) == len(original), "Incomplete source fit")
    refs, coeff = rows[:, :3].astype(int), rows[:, 3:6]
    # MPFB fit_clothes_to_human, in original Y-up OBJ axes and decimetres.
    pos = np.einsum("ijk,ij->ik", human[refs], coeff) + rows[:, 6:] * scales
    rig = json.loads(reference["rig.game_engine.json"].read_bytes())
    weights = json.loads(reference["weights.game_engine.json"].read_bytes())["weights"]
    names = list(weights)
    body_skin = np.zeros((len(human), len(names)))
    for j, name in enumerate(names):
        for i, weight in weights[name]:
            body_skin[i, j] = weight
    skin = np.einsum("ijk,ij->ik", body_skin[refs], coeff) / coeff.sum(axis=1)[:, None]
    skin[skin <= 0.001] = 0  # MPFB's retained influence threshold
    active = np.flatnonzero(skin.any(axis=0))
    skin = skin[:, active]
    require(np.all(skin.sum(axis=1) > 0), "Unweighted donor vertex")
    skin /= skin.sum(axis=1)[:, None]
    joints = {}
    for side in ("l", "r"):
        joints[side] = {}
        for label, bone in [("knee", "calf"), ("ankle", "foot"), ("ball", "ball")]:
            group = rig[bone + "_" + side]["head"]["cube_name"]
            joints[side][label] = human[sorted(groups[group])].mean(axis=0) * 0.1
    corners = np.array(corners)
    return pos * 0.1, uv, corners, [names[i] for i in active], skin, joints
