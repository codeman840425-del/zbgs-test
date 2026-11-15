# Diagnostic rejection, not clothing failure count

The original absolute 30mm ray-distance rule falsely flags an opaque top already in front of the full-body boundary. At the first recorded standing failure, edge 163–170, actual top face954 is 46.215mm closer to the camera than the body point and is the first rendered hit. This is occlusion, not an exposed hole. See ../ray-witness/ray-witness.json and the unchanged normal-material frame.

The 16,364 counts from this diagnostic cannot be reported as 16,364 holes or skin intersections. Preserve the raw result. The corrected test admits any actual foreground top intersection while retaining the 30mm rear allowance as a conservative finite risk screen. No model, coverage face selection or product threshold changed.
