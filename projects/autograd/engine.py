#!/usr/bin/env python3
"""
projects/autograd/engine.py
===========================
Clean, rigorous scalar autodiff engine (Value) supporting:
- Addition, subtraction, multiplication, division, powers
- exp, log, relu, tanh
- Shared-node gradient accumulation (+=)
- Branching DAG evaluation and multiple outputs
- Cycle detection in topological sort
- Explicit repeated-backward and zero_grad policies
- Input validation and domain error handling
"""

import math
from typing import Callable, Iterable, List, Optional, Set, Tuple, Union


class Value:
    __slots__ = ("data", "grad", "_backward", "_prev", "_op", "label")

    def __init__(
        self,
        data: Union[float, int],
        _children: Tuple["Value", ...] = (),
        _op: str = "",
        label: str = "",
    ):
        if not isinstance(data, (int, float)):
            raise TypeError(f"Value data must be int or float, got {type(data).__name__}")
        self.data: float = float(data)
        self.grad: float = 0.0
        self._backward: Callable[[], None] = lambda: None
        self._prev: Set["Value"] = set(_children)
        self._op: str = _op
        self.label: str = label

    def __repr__(self) -> str:
        name_str = f"'{self.label}': " if self.label else ""
        return f"Value({name_str}data={self.data:.6f}, grad={self.grad:.6f})"

    @staticmethod
    def _ensure_value(other: Union["Value", float, int]) -> "Value":
        if isinstance(other, Value):
            return other
        if isinstance(other, (int, float)):
            return Value(other)
        raise TypeError(
            f"Unsupported operand type for {type(other).__name__}: expected Value, int, or float"
        )

    def __add__(self, other: Union["Value", float, int]) -> "Value":
        other_val = self._ensure_value(other)
        out = Value(self.data + other_val.data, (self, other_val), "+")

        def _backward():
            self.grad += 1.0 * out.grad
            other_val.grad += 1.0 * out.grad

        out._backward = _backward
        return out

    def __radd__(self, other: Union[float, int]) -> "Value":
        return self + other

    def __neg__(self) -> "Value":
        return self * -1.0

    def __sub__(self, other: Union["Value", float, int]) -> "Value":
        return self + (-other)

    def __rsub__(self, other: Union[float, int]) -> "Value":
        return self._ensure_value(other) + (-self)

    def __mul__(self, other: Union["Value", float, int]) -> "Value":
        other_val = self._ensure_value(other)
        out = Value(self.data * other_val.data, (self, other_val), "*")

        def _backward():
            self.grad += other_val.data * out.grad
            other_val.grad += self.data * out.grad

        out._backward = _backward
        return out

    def __rmul__(self, other: Union[float, int]) -> "Value":
        return self * other

    def __truediv__(self, other: Union["Value", float, int]) -> "Value":
        other_val = self._ensure_value(other)
        if other_val.data == 0.0:
            raise ZeroDivisionError("division by zero in Value / other")
        return self * (other_val ** -1.0)

    def __rtruediv__(self, other: Union[float, int]) -> "Value":
        return self._ensure_value(other) / self

    def __pow__(self, other: Union[int, float]) -> "Value":
        if not isinstance(other, (int, float)):
            raise TypeError(
                f"Power exponent must be int or float, got {type(other).__name__}"
            )
        out = Value(self.data ** other, (self,), f"**{other}")

        def _backward():
            # d(x^n)/dx = n * x^(n - 1)
            self.grad += (other * (self.data ** (other - 1.0))) * out.grad

        out._backward = _backward
        return out

    def exp(self) -> "Value":
        out = Value(math.exp(self.data), (self,), "exp")

        def _backward():
            self.grad += out.data * out.grad

        out._backward = _backward
        return out

    def log(self) -> "Value":
        if self.data <= 0.0:
            raise ValueError(f"Domain error: log requires positive input, got {self.data}")
        out = Value(math.log(self.data), (self,), "log")

        def _backward():
            self.grad += (1.0 / self.data) * out.grad

        out._backward = _backward
        return out

    def relu(self) -> "Value":
        out = Value(self.data if self.data > 0.0 else 0.0, (self,), "ReLU")

        def _backward():
            # Subgradient convention: 0.0 at x <= 0.0
            self.grad += (1.0 if self.data > 0.0 else 0.0) * out.grad

        out._backward = _backward
        return out

    def tanh(self) -> "Value":
        x = self.data
        if x < -20.0:
            t = -1.0
        elif x > 20.0:
            t = 1.0
        else:
            t = math.tanh(x)
        out = Value(t, (self,), "tanh")

        def _backward():
            # d(tanh(x))/dx = 1 - tanh(x)^2
            self.grad += (1.0 - t ** 2) * out.grad

        out._backward = _backward
        return out

    def zero_grad(self):
        """Zeroes gradients for this node and all ancestors in the DAG."""
        topo = build_topological_sort([self])
        for node in topo:
            node.grad = 0.0

    def backward(self, seed_grad: float = 1.0, zero_graph: bool = False):
        """
        Reverse-mode automatic differentiation from this node.

        Policy:
        - If `zero_graph` is True, all DAG node gradients are reset to 0.0 first.
        - `seed_grad` sets the root gradient for this call.
        - Iterates through the topological sort in reverse, triggering `_backward()`.
        - Non-root gradients accumulate across calls, but only this call's
          contributions propagate through shared nodes and intermediate nodes.
        """
        backward_multiple([self], [seed_grad], zero_graph=zero_graph)


def build_topological_sort(roots: Iterable[Value]) -> List[Value]:
    """
    Build a topological sort of nodes reachable from roots.
    Includes cycle detection: raises RuntimeError if a cycle exists.
    """
    topo: List[Value] = []
    visited: Set[Value] = set()
    active: Set[Value] = set()

    def dfs(node: Value):
        if node in active:
            raise RuntimeError(f"Cycle detected in computational graph at node {node}")
        if node not in visited:
            active.add(node)
            visited.add(node)
            for child in node._prev:
                dfs(child)
            active.remove(node)
            topo.append(node)

    for root in roots:
        dfs(root)
    return topo


def backward_multiple(
    outputs: List[Value],
    grad_outputs: Optional[List[float]] = None,
    zero_graph: bool = False,
):
    """
    Compute backward pass for multiple outputs simultaneously.

    Args:
        outputs: List of target Value nodes.
        grad_outputs: List of seed gradient floats (defaults to 1.0 for each output).
        zero_graph: Whether to discard existing gradients before running backward.

    Each unique output is seeded with the sum of its seeds for this call.
    Non-output nodes retain accumulated gradients across calls unless zero_graph
    is true; historical gradients are never propagated through the graph again.
    If a derivative raises, all gradients are restored to their pre-call values.
    """
    if grad_outputs is None:
        grad_outputs = [1.0] * len(outputs)
    if len(outputs) != len(grad_outputs):
        raise ValueError(
            f"outputs length ({len(outputs)}) must match grad_outputs length ({len(grad_outputs)})"
        )

    topo = build_topological_sort(outputs)
    # Combine repeated roots before traversing the graph so duplicate outputs
    # contribute the sum of their seed gradients instead of overwriting each other.
    seed_by_output = {}
    for out_node, seed in zip(outputs, grad_outputs):
        seed_by_output[out_node] = seed_by_output.get(out_node, 0.0) + seed

    # The closures read node.grad, so historical intermediate gradients must be
    # held aside while computing this call's vector-Jacobian product. Roots keep
    # the established per-call seed policy rather than restoring stale seeds.
    previous_grads = {node: node.grad for node in topo}
    try:
        for node in topo:
            node.grad = 0.0
        for out_node, seed in seed_by_output.items():
            out_node.grad = seed

        for node in reversed(topo):
            node._backward()
        if not zero_graph:
            for node, previous_grad in previous_grads.items():
                if node not in seed_by_output:
                    node.grad += previous_grad
    except BaseException:
        for node, previous_grad in previous_grads.items():
            node.grad = previous_grad
        raise
