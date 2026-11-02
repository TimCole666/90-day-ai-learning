#!/usr/bin/env python3
"""
projects/autograd/diagnostics.py
================================
Observable failing-gradient diagnostic demonstration.

Demonstrates how numerical finite difference gradcheck detects and pinpoints
subtle autograd implementation bugs that would silently corrupt neural network training:
1. Overwrite bug in gradient accumulation (`=` instead of `+=`).
2. Power rule calculus bug (missing exponent decrement `n - 1`).
3. ReLU backward bug (leaking gradients for negative inputs).
"""

from typing import Any, Callable, Dict, Tuple
from .gradcheck import check_gradient


class BuggyValue:
    """
    A variant of Value that deliberately injects an implementation bug
    for educational and diagnostic verification.
    """
    def __init__(self, data: float, _children=(), _op: str = "", label: str = "", bug_type: str = "none"):
        self.data = float(data)
        self.grad = 0.0
        self._backward = lambda: None
        self._prev = set(_children)
        self._op = _op
        self.label = label
        self.bug_type = bug_type

    def __add__(self, other):
        other = other if isinstance(other, BuggyValue) else BuggyValue(other, bug_type=self.bug_type)
        out = BuggyValue(self.data + other.data, (self, other), "+", bug_type=self.bug_type)

        def _backward():
            if self.bug_type == "overwrite-accumulation":
                # BUG: Using '=' instead of '+=' overwrites prior branch gradient!
                self.grad = 1.0 * out.grad
                other.grad = 1.0 * out.grad
            else:
                self.grad += 1.0 * out.grad
                other.grad += 1.0 * out.grad
        out._backward = _backward
        return out

    def __mul__(self, other):
        other = other if isinstance(other, BuggyValue) else BuggyValue(other, bug_type=self.bug_type)
        out = BuggyValue(self.data * other.data, (self, other), "*", bug_type=self.bug_type)

        def _backward():
            if self.bug_type == "overwrite-accumulation":
                # BUG: Using '=' instead of '+=' overwrites prior branch gradient!
                self.grad = other.data * out.grad
                other.grad = self.data * out.grad
            else:
                self.grad += other.data * out.grad
                other.grad += self.data * out.grad
        out._backward = _backward
        return out

    def __pow__(self, other):
        out = BuggyValue(self.data ** other, (self,), f"**{other}", bug_type=self.bug_type)

        def _backward():
            if self.bug_type == "broken-power":
                # BUG: forgot (other - 1.0), used self.data ** other instead!
                self.grad += (other * (self.data ** other)) * out.grad
            else:
                self.grad += (other * (self.data ** (other - 1.0))) * out.grad
        out._backward = _backward
        return out

    def relu(self):
        out = BuggyValue(self.data if self.data > 0 else 0.0, (self,), "ReLU", bug_type=self.bug_type)

        def _backward():
            if self.bug_type == "broken-relu":
                # BUG: Always passes gradient 1.0 even for negative inputs!
                self.grad += 1.0 * out.grad
            else:
                self.grad += (1.0 if self.data > 0 else 0.0) * out.grad
        out._backward = _backward
        return out

    def backward(self):
        topo = []
        visited = set()
        def build_topo(v):
            if v not in visited:
                visited.add(v)
                for child in v._prev:
                    build_topo(child)
                topo.append(v)
        build_topo(self)

        self.grad = 1.0
        for node in reversed(topo):
            node._backward()


def create_buggy_engine(bug_type: str) -> Callable[..., BuggyValue]:
    return lambda val, label="": BuggyValue(val, label=label, bug_type=bug_type)


def diagnose_bug(bug_type: str = "overwrite-accumulation") -> Dict[str, Any]:
    """
    Execute gradcheck on a computational graph using the buggy engine,
    pinpoint the divergence, and return a comprehensive diagnostic report.
    """
    if bug_type == "overwrite-accumulation":
        # Graph with shared node 'a': f = (a + b) * a
        # a=3.0, b=4.0 => f = 21.0
        # Correct analytical: df/da = 2a + b = 10.0
        # Buggy analytical: second branch assigns other.grad or self.grad = (a+b) or a
        a = BuggyValue(3.0, label="a", bug_type=bug_type)
        b = BuggyValue(4.0, label="b", bug_type=bug_type)
        sum_node = a + b
        f = sum_node * a
        f.backward()
        analytical_da = a.grad

        # Numerical ground truth via finite difference on pure function
        eval_f = lambda x: (x + 4.0) * x
        check = check_gradient(eval_f, 3.0, analytical_da, param_name="a", h=1e-5)

        return {
            "status": "bug_detected" if not check.passed else "passed",
            "bug_type": bug_type,
            "gradcheck_passed": check.passed,
            "pinpointed_node": "a",
            "analytical_grad": check.analytical,
            "numerical_grad": check.numerical,
            "rel_error": check.rel_error,
            "abs_error": check.abs_error,
            "explanation": (
                "Gradient accumulation overwrite bug detected on shared node 'a'. "
                f"Analytical gradient ({check.analytical:.4f}) does not match numerical "
                f"finite difference ({check.numerical:.4f}). In a branching computation graph "
                "where a variable appears in multiple sub-expressions, each path contributes to "
                "dL/dx via the multivariable chain rule: dL/dx = sum(dL/dy_i * dy_i/dx). "
                "Using '=' instead of '+=' in backward step closures discards previous branch gradients."
            ),
            "suggested_fix": "Change 'self.grad = ...' to 'self.grad += ...' and 'other.grad = ...' to 'other.grad += ...' in all op backward functions.",
            "reproduction_graph": "f = (a + b) * a, where a=3.0, b=4.0",
        }

    elif bug_type == "broken-power":
        # Graph: f = x ** 3 at x = 2.0
        # Correct analytical: 3 * 2^2 = 12.0
        # Buggy analytical: 3 * 2^3 = 24.0
        x = BuggyValue(2.0, label="x", bug_type=bug_type)
        f = x ** 3
        f.backward()
        analytical_dx = x.grad

        eval_f = lambda v: v ** 3
        check = check_gradient(eval_f, 2.0, analytical_dx, param_name="x", h=1e-5)

        return {
            "status": "bug_detected" if not check.passed else "passed",
            "bug_type": bug_type,
            "gradcheck_passed": check.passed,
            "pinpointed_node": "x",
            "analytical_grad": check.analytical,
            "numerical_grad": check.numerical,
            "rel_error": check.rel_error,
            "abs_error": check.abs_error,
            "explanation": (
                "Calculus power rule implementation bug detected on node 'x'. "
                f"Analytical gradient ({check.analytical:.4f}) diverged from numerical "
                f"finite difference ({check.numerical:.4f}). The power rule derivative is "
                "d(x^n)/dx = n * x^(n - 1), but the implementation omitted decrementing the exponent by 1."
            ),
            "suggested_fix": "Change 'other * (self.data ** other)' to 'other * (self.data ** (other - 1.0))'.",
            "reproduction_graph": "f = x ** 3, where x=2.0",
        }

    elif bug_type == "broken-relu":
        # Graph: f = relu(x) at x = -2.0
        # Correct analytical: 0.0
        # Buggy analytical: 1.0
        x = BuggyValue(-2.0, label="x", bug_type=bug_type)
        f = x.relu()
        f.backward()
        analytical_dx = x.grad

        eval_f = lambda v: max(0.0, v)
        check = check_gradient(eval_f, -2.0, analytical_dx, param_name="x", h=1e-5)

        return {
            "status": "bug_detected" if not check.passed else "passed",
            "bug_type": bug_type,
            "gradcheck_passed": check.passed,
            "pinpointed_node": "x",
            "analytical_grad": check.analytical,
            "numerical_grad": check.numerical,
            "rel_error": check.rel_error,
            "abs_error": check.abs_error,
            "explanation": (
                "ReLU activation backward bug detected on node 'x'. "
                f"Analytical gradient ({check.analytical:.4f}) diverged from numerical "
                f"finite difference ({check.numerical:.4f}). ReLU derivative d(ReLU(x))/dx "
                "must be 0.0 for x <= 0.0, but the implementation leaked a gradient of 1.0."
            ),
            "suggested_fix": "Change backward to: 'self.grad += (1.0 if self.data > 0 else 0.0) * out.grad'.",
            "reproduction_graph": "f = relu(x), where x=-2.0",
        }

    else:
        raise ValueError(f"Unknown bug_type: {bug_type}")
