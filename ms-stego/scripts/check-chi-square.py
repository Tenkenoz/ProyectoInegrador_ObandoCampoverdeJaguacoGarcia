import decimal
import json
import math
from pathlib import Path
import subprocess


def reference(statistic, degrees):
    x = statistic / 2
    if degrees % 2 == 0:
        with decimal.localcontext() as context:
            context.prec = 90
            value = decimal.Decimal(str(statistic)) / 2
            term = decimal.Decimal(1)
            total = term
            for index in range(1, degrees // 2):
                term *= value / index
                total += term
            return float((-value).exp() * total)
    value = math.erfc(math.sqrt(x))
    shape = 0.5
    while shape < degrees / 2:
        value += math.exp(shape * math.log(x) - x - math.lgamma(shape + 1))
        shape += 1
    return min(1, value)


cases = [
    (degrees * factor, degrees)
    for degrees in [1, 2, 3, 4, 10, 32, 128, 255, 384]
    for factor in [0.01, 0.5, 1, 2, 5]
]
code = """
import { chiSquareSurvival } from './dist/steganography/lsb/utils/chi-square.js';
let data = '';
for await (const chunk of process.stdin) data += chunk;
console.log(JSON.stringify(JSON.parse(data).map(([x, df]) => chiSquareSurvival(x, df))));
"""
result = subprocess.run(
    ['node', '--input-type=module', '-e', code],
    cwd=Path(__file__).resolve().parents[1],
    input=json.dumps(cases),
    text=True,
    capture_output=True,
    check=True,
)
values = json.loads(result.stdout)
errors = [abs(value - reference(x, degrees)) for (x, degrees), value in zip(cases, values)]
if len(values) != len(cases) or max(errors) >= 1e-11:
    raise SystemExit('Independent chi-square verification failed')
print(f'Passed {len(cases)} cases; maximum absolute error {max(errors):.3g}')
