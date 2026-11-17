"""Exact Bernstein bounds for real polynomials of stored IEEE coefficients."""
from fractions import Fraction
from math import comb


def rational(value):
    return Fraction(float(value))


def encoded(value):
    return {'numerator': str(value.numerator), 'denominator': str(value.denominator), 'approximate': float(value)}


def multiply(a, b):
    result = [Fraction(0)] * (len(a) + len(b) - 1)
    for i, first in enumerate(a):
        for j, second in enumerate(b):
            result[i + j] += first * second
    return result


def bernstein(power):
    degree = len(power) - 1
    return [sum((power[k] * Fraction(comb(i, k), comb(degree, k)) for k in range(i + 1)), Fraction(0))
        for i in range(degree + 1)]


def split_half(values):
    rows = [values]
    while len(rows[-1]) > 1:
        previous = rows[-1]
        rows.append([(a + b) / 2 for a, b in zip(previous, previous[1:])])
    return [row[0] for row in rows], [row[-1] for row in reversed(rows)]


def bound(values, threshold, segment, component, budget, maximum_depth):
    pending = [(values, Fraction(0), Fraction(1), 0)]
    leaves = []
    while pending:
        coefficients, low, high, depth = pending.pop()
        if budget['visited'] >= budget['maximum']:
            leaves.append({'segment': segment, 'component': component, 'status': 'unproven-budget',
                'tLow': encoded(low), 'tHigh': encoded(high), 'depth': depth})
            continue
        budget['visited'] += 1
        lower, upper = min(coefficients), max(coefficients)
        row = {'segment': segment, 'component': component, 'depth': depth,
            'tLow': encoded(low), 'tHigh': encoded(high), 'lower': encoded(lower), 'upper': encoded(upper)}
        if lower > threshold:
            row['status'] = 'certified-strictly-above'
        elif upper <= threshold:
            row['status'] = 'certified-at-or-below'
        elif depth >= maximum_depth:
            row['status'] = 'unproven-depth'
        else:
            left, right = split_half(coefficients)
            middle = (low + high) / 2
            pending.extend([(right, middle, high, depth + 1), (left, low, middle, depth + 1)])
            continue
        leaves.append(row)
    return leaves


def certify(knots, coefficients, maximum_intervals=4096, maximum_depth=12):
    """Input c[descending cubic power][segment][s,dY,h], actual saved floats."""
    budget = {'visited': 0, 'maximum': maximum_intervals}
    all_leaves, seam_rows, segment_bounds = [], [], []
    for i in range(len(knots) - 1):
        width = rational(knots[i + 1]) - rational(knots[i])
        if width <= 0:
            raise ValueError('Exact interval width must be positive')
        source = [[rational(coefficients[3 - k][i][axis]) for k in range(4)] for axis in range(3)]
        scale = [source[0][k] * width ** k for k in range(4)]
        fprime = [(k + 1) * source[1][k + 1] * width ** k for k in range(3)]
        fprime[0] += 1
        q = multiply(scale, fprime)
        for label, power, threshold in [('s', scale, Fraction(0)), ('q', q, Fraction(3, 25))]:
            beta = bernstein(power)
            segment_bounds.append({'segment': i, 'component': label, 'originalBernstein': [encoded(v) for v in beta]})
            all_leaves.extend(bound(beta, threshold, i, label, budget, maximum_depth))
        if i + 1 < len(knots) - 1:
            components = []
            for axis, name in enumerate(['s', 'dY', 'h']):
                left = sum((source[axis][k] * width ** k for k in range(4)), Fraction(0))
                derivative = sum((k * source[axis][k] * width ** (k - 1) for k in range(1, 4)), Fraction(0))
                right = rational(coefficients[3][i + 1][axis])
                right_derivative = rational(coefficients[2][i + 1][axis])
                components.append({'component': name, 'valueDifference': encoded(left - right),
                    'derivativeDifference': encoded(derivative - right_derivative)})
            seam_rows.append({'knotIndex': i + 1, 'components': components})
    certified = all(row['status'] == 'certified-strictly-above' for row in all_leaves)
    summaries = {}
    for component in ['s', 'q']:
        leaves = [row for row in all_leaves if row['component'] == component]
        lowers = [Fraction(int(row['lower']['numerator']), int(row['lower']['denominator']))
            for row in leaves if 'lower' in row]
        summaries[component] = {'allSegmentsCertified': all(row['status'] == 'certified-strictly-above' for row in leaves),
            'certifiedLowerBound': encoded(min(lowers)) if lowers and all('lower' in row for row in leaves) else None,
            'threshold': '0' if component == 's' else '3/25 (exact decimal 0.12)', 'leafCount': len(leaves)}
    return {'schema': 'stored-coefficient-exact-bernstein-v1', 'allCertified': certified,
        'meaning': 'Real polynomial of actual stored Float64 coefficients; excludes floating evaluation error and cross-knot discontinuity.',
        'budget': budget, 'maximumDepth': maximum_depth, 'summaries': summaries,
        'segmentBernstein': segment_bounds, 'leaves': all_leaves, 'seams': seam_rows}
