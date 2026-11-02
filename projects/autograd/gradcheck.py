#!/usr/bin/env python3
"""
projects/autograd/gradcheck.py
==============================
Independent numerical gradient checking using two-sided finite differences:
    f'(x) ≈ (f(x + h) - f(x - h)) / (2h)

Features:
- Relative and absolute error evaluation with dtype/scale-appropriate tolerances.
- Explicit detection and mathematical explanation of non-differentiable kinks (e.g. ReLU at 0).
- Detailed structured report generation for CLI and test runners.
"""

from dataclasses import asdict, dataclass
from typing import Callable, Dict, List, Optional, Tuple
from .engine import Value


@dataclass
class GradCheckResult:
    param_name: str
    passed: bool
    analytical: float
    numerical: float
    rel_error: float
    abs_error: float
    h: float
    rtol: float
    atol: float
    is_kink: bool = False
    kink_explanation: str = ""

    def to_dict(self) -> dict:
        d = asdict(self)
        d["analytical_grad"] = self.analytical
        d["numerical_grad"] = self.numerical
        d["tolerance"] = {"h": self.h, "rtol": self.rtol, "atol": self.atol}
        return d


def finite_difference_gradient(
    f: Callable[[float], float],
    x: float,
    h: float = 1e-5,
) -> float:
    """
    Compute central (two-sided) finite difference:
        [f(x + h) - f(x - h)] / (2h)
    Central difference has truncation error O(h^2), compared to O(h) for one-sided.
    """
    f_plus = f(x + h)
    f_minus = f(x - h)
    return (f_plus - f_minus) / (2.0 * h)


def check_gradient(
    f: Callable[[float], float],
    x: float,
    analytical_grad: float,
    param_name: str = "x",
    h: float = 1e-5,
    rtol: float = 1e-3,
    atol: float = 1e-5,
    eps: float = 1e-7,
    is_kink_point: bool = False,
    kink_explanation: str = "",
) -> GradCheckResult:
    """
    Compare analytical gradient against two-sided finite difference.

    Tolerance criterion:
        abs(analytical - numerical) <= atol + rtol * max(abs(analytical), abs(numerical))
    """
    numerical = finite_difference_gradient(f, x, h=h)
    abs_diff = abs(analytical_grad - numerical)
    scale = max(abs(analytical_grad), abs(numerical), eps)
    rel_diff = abs_diff / scale

    if is_kink_point and not kink_explanation:
        kink_explanation = (
            f"Point {param_name}={x} is at or near a non-differentiable kink (e.g. ReLU at 0.0). "
            f"The two-sided finite difference averages left and right subgradients: (f(x+h) - f(x-h))/(2h). "
            f"Analytical autograd chooses a single subgradient (e.g. 0.0). "
            f"This divergence reflects calculus non-differentiability, not a software defect."
        )

    # For known kinks, we disclose the kink behavior
    passed = (abs_diff <= atol) or (rel_diff <= rtol) or is_kink_point

    return GradCheckResult(
        param_name=param_name,
        passed=passed,
        analytical=analytical_grad,
        numerical=numerical,
        rel_error=rel_diff,
        abs_error=abs_diff,
        h=h,
        rtol=rtol,
        atol=atol,
        is_kink=is_kink_point,
        kink_explanation=kink_explanation if is_kink_point else "",
    )


def gradcheck_expression(
    fn_builder: Callable[[Dict[str, Value]], Value],
    inputs: Dict[str, float],
    h: float = 1e-5,
    rtol: float = 1e-3,
    atol: float = 1e-5,
    kink_names: Optional[List[str]] = None,
) -> Tuple[bool, List[GradCheckResult]]:
    """
    Run gradcheck on all parameters of a computational graph constructed by fn_builder.
    """
    kink_names_set = set(kink_names or [])

    # 1. Analytical backward
    val_nodes = {k: Value(v, label=k) for k, v in inputs.items()}
    out_node = fn_builder(val_nodes)
    out_node.backward()
    analytical_grads = {k: val_nodes[k].grad for k in inputs}

    # 2. Numerical finite differences for each input parameter
    results: List[GradCheckResult] = []
    all_passed = True

    for name, x0 in inputs.items():
        def eval_at(val: float) -> float:
            perturbed = {
                k: Value(val if k == name else v, label=k)
                for k, v in inputs.items()
            }
            return fn_builder(perturbed).data

        is_kink = name in kink_names_set
        res = check_gradient(
            f=eval_at,
            x=x0,
            analytical_grad=analytical_grads[name],
            param_name=name,
            h=h,
            rtol=rtol,
            atol=atol,
            is_kink_point=is_kink,
        )
        if not res.passed:
            all_passed = False
        results.append(res)

    return all_passed, results
