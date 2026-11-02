#!/usr/bin/env python3
"""
tests/unit/test_autograd_engine.py
==================================
Unit test suite for the autograd engine (Value), gradcheck, and diagnostics.
"""

import math
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))

from projects.autograd.engine import Value, backward_multiple
from projects.autograd.gradcheck import (
    finite_difference_gradient,
    check_gradient,
    gradcheck_expression,
)
from projects.autograd.diagnostics import (
    diagnose_bug,
    create_buggy_engine,
)


class TestValueEngine(unittest.TestCase):
    def test_basic_arithmetic_forward_and_backward(self):
        # f(x, y) = (x + y) * (x - y) = x^2 - y^2
        # df/dx = 2x, df/dy = -2y
        x = Value(3.0, label="x")
        y = Value(2.0, label="y")
        f = (x + y) * (x - y)
        self.assertAlmostEqual(f.data, 5.0)

        f.backward()
        self.assertAlmostEqual(x.grad, 6.0)
        self.assertAlmostEqual(y.grad, -4.0)

    def test_reverse_operators_and_scalars(self):
        x = Value(4.0)
        # scalar + Value, scalar - Value, scalar * Value, scalar / Value
        f1 = 2.0 + x
        self.assertAlmostEqual(f1.data, 6.0)
        f2 = 10.0 - x
        self.assertAlmostEqual(f2.data, 6.0)
        f3 = 3.0 * x
        self.assertAlmostEqual(f3.data, 12.0)
        f4 = 8.0 / x
        self.assertAlmostEqual(f4.data, 2.0)

        f4.backward()
        # d(8/x)/dx = -8/x^2 = -8/16 = -0.5
        self.assertAlmostEqual(x.grad, -0.5)

    def test_pow_operator(self):
        # f(x) = x ** 3
        # df/dx = 3 * x^2
        x = Value(2.5)
        f = x ** 3
        self.assertAlmostEqual(f.data, 15.625)
        f.backward()
        self.assertAlmostEqual(x.grad, 3.0 * (2.5 ** 2))

        # Fractional power: f(x) = x ** 0.5
        # df/dx = 0.5 * x^(-0.5) = 1 / (2 * sqrt(x))
        y = Value(4.0)
        g = y ** 0.5
        self.assertAlmostEqual(g.data, 2.0)
        g.backward()
        self.assertAlmostEqual(y.grad, 0.25)

    def test_exp_and_log(self):
        # f(x) = exp(x)
        x = Value(1.2)
        f = x.exp()
        self.assertAlmostEqual(f.data, math.exp(1.2))
        f.backward()
        self.assertAlmostEqual(x.grad, math.exp(1.2))

        # g(y) = log(y)
        y = Value(2.5)
        g = y.log()
        self.assertAlmostEqual(g.data, math.log(2.5))
        g.backward()
        self.assertAlmostEqual(y.grad, 1.0 / 2.5)

    def test_relu_and_tanh(self):
        # ReLU positive
        x1 = Value(3.5)
        y1 = x1.relu()
        self.assertEqual(y1.data, 3.5)
        y1.backward()
        self.assertEqual(x1.grad, 1.0)

        # ReLU negative
        x2 = Value(-2.0)
        y2 = x2.relu()
        self.assertEqual(y2.data, 0.0)
        y2.backward()
        self.assertEqual(x2.grad, 0.0)

        # Tanh
        x3 = Value(0.7)
        y3 = x3.tanh()
        self.assertAlmostEqual(y3.data, math.tanh(0.7), places=6)
        y3.backward()
        self.assertAlmostEqual(x3.grad, 1.0 - math.tanh(0.7) ** 2, places=6)

    def test_shared_node_accumulation(self):
        # Critical test: if _backward uses '=' instead of '+=', gradients will be overwritten!
        # Case 1: b = a + a -> db/da = 2
        a = Value(3.0)
        b = a + a
        b.backward()
        self.assertEqual(a.grad, 2.0)

        # Case 2: y = x * x -> dy/dx = 2x
        x = Value(4.0)
        y = x * x
        y.backward()
        self.assertEqual(x.grad, 8.0)

        # Case 3: diamond graph
        #    a
        #   / \
        #  b   c
        #   \ /
        #    d
        # b = 2*a, c = 3*a, d = b * c = 6 * a^2
        # dd/da = 12 * a
        a_node = Value(2.0)
        b_node = a_node * 2.0
        c_node = a_node * 3.0
        d_node = b_node * c_node
        self.assertAlmostEqual(d_node.data, 24.0)
        d_node.backward()
        self.assertAlmostEqual(a_node.grad, 24.0)  # 12 * 2 = 24

    def test_multiple_outputs_backward(self):
        # y1 = a * b, y2 = a + b
        # dy1/da = b, dy1/db = a
        # dy2/da = 1, dy2/db = 1
        a = Value(2.0)
        b = Value(5.0)
        y1 = a * b
        y2 = a + b

        # Joint backward with seed gradients [1.0, 1.0]
        backward_multiple([y1, y2], grad_outputs=[1.0, 1.0])
        self.assertAlmostEqual(a.grad, 5.0 + 1.0)
        self.assertAlmostEqual(b.grad, 2.0 + 1.0)

    def test_multiple_outputs_duplicate_root_accumulates_seeds(self):
        # Repeating one output is equivalent to applying the sum of its seeds.
        x = Value(3.0)
        y = x * x

        backward_multiple([y, y], grad_outputs=[1.0, 2.0])

        self.assertAlmostEqual(y.grad, 3.0)
        self.assertAlmostEqual(x.grad, 18.0)

    def test_multiple_outputs_repeated_call_matches_backward_policy(self):
        x = Value(3.0)
        y = x * x

        backward_multiple([y], grad_outputs=[1.0])
        backward_multiple([y], grad_outputs=[1.0])

        self.assertAlmostEqual(x.grad, 12.0)

    def test_repeated_backward_deep_graph_uses_only_new_gradient_contributions(self):
        for multiple in (False, True):
            with self.subTest(multiple=multiple):
                x = Value(2.0)
                square = x * x
                output = square * 3.0

                def backward(seed=1.0, zero_graph=False, *, multiple=multiple, output=output):
                    if multiple:
                        backward_multiple([output], [seed], zero_graph=zero_graph)
                    else:
                        output.backward(seed_grad=seed, zero_graph=zero_graph)

                backward()
                self.assertEqual((x.grad, square.grad, output.grad), (12.0, 3.0, 1.0))
                backward()
                self.assertEqual((x.grad, square.grad, output.grad), (24.0, 6.0, 1.0))
                backward(seed=-1.0)
                self.assertEqual((x.grad, square.grad, output.grad), (12.0, 3.0, -1.0))
                backward(seed=0.0)
                self.assertEqual((x.grad, square.grad, output.grad), (12.0, 3.0, 0.0))
                backward(seed=2.0, zero_graph=True)
                self.assertEqual((x.grad, square.grad, output.grad), (24.0, 6.0, 2.0))

    def test_repeated_multiple_backward_handles_duplicate_and_ancestor_outputs(self):
        x = Value(2.0)
        square = x * x
        output = square * 3.0
        # Combined derivative of 3*output + 4*square at x=2 is 52.
        for calls in range(1, 4):
            backward_multiple([output, output, square], [1.0, 2.0, 4.0])
            self.assertEqual(x.grad, 52.0 * calls)
            self.assertEqual(square.grad, 13.0)
            self.assertEqual(output.grad, 3.0)
        backward_multiple([output, output, square], [1.0, -1.0, 0.0])
        self.assertEqual(x.grad, 156.0)
        self.assertEqual((square.grad, output.grad), (0.0, 0.0))

    def test_backward_failure_preserves_gradients_on_entire_graph(self):
        for multiple in (False, True):
            for zero_graph in (False, True):
                with self.subTest(multiple=multiple, zero_graph=zero_graph):
                    p, q = Value(2.0), Value(0.0)
                    ok = p * 3.0
                    ok.backward()
                    ok.backward()
                    self.assertEqual(p.grad, 6.0)
                    root = q ** 0.5
                    bad = root + p
                    # Preserve populated roots/intermediates as well as leaves.
                    q.grad, root.grad, bad.grad = -3.0, 2.0, 7.0
                    before = {node: node.grad for node in (p, q, root, bad, ok)}
                    with self.assertRaises(ZeroDivisionError):
                        if multiple:
                            backward_multiple([bad], zero_graph=zero_graph)
                        else:
                            bad.backward(zero_graph=zero_graph)
                    self.assertEqual({node: node.grad for node in before}, before)

    def test_repeated_backward_policy_and_zero_grad(self):
        x = Value(3.0)
        y = x * x
        y.backward()
        self.assertEqual(x.grad, 6.0)

        # Calling zero_grad() must reset all gradients in the graph to 0.0
        y.zero_grad()
        self.assertEqual(x.grad, 0.0)
        self.assertEqual(y.grad, 0.0)

        # Running backward again after zero_grad reproduces the same gradient
        y.backward()
        self.assertEqual(x.grad, 6.0)

        # Repeated backward without zeroing accumulates (PyTorch convention)
        y.backward()
        self.assertEqual(x.grad, 12.0)

    def test_invalid_input_error_handling(self):
        # log of zero or negative
        with self.assertRaises(ValueError):
            Value(0.0).log()
        with self.assertRaises(ValueError):
            Value(-1.5).log()

        # Division by zero
        with self.assertRaises(ZeroDivisionError):
            _ = Value(5.0) / 0.0
        with self.assertRaises(ZeroDivisionError):
            _ = Value(5.0) / Value(0.0)

        # Invalid power type
        with self.assertRaises(TypeError):
            _ = Value(3.0) ** "invalid"  # type: ignore[operator]

        # Invalid binary operand type
        with self.assertRaises(TypeError):
            _ = Value(3.0) + "invalid"  # type: ignore[operator]

    def test_cycle_detection(self):
        a = Value(1.0)
        b = Value(2.0)
        c = a + b
        # Artificially create a cycle in _prev to verify cycle detector
        a._prev.add(c)
        with self.assertRaises(RuntimeError) as ctx:
            c.backward()
        self.assertIn("Cycle detected", str(ctx.exception))


class TestGradCheck(unittest.TestCase):
    def test_finite_difference_matches_analytical(self):
        # f(x) = 3*x^2 - 4*x + 1, df/dx = 6*x - 4
        f = lambda val: 3.0 * (val ** 2) - 4.0 * val + 1.0
        x = 2.5
        analytical = 6.0 * 2.5 - 4.0  # 11.0
        numerical = finite_difference_gradient(f, x, h=1e-5)
        self.assertAlmostEqual(analytical, numerical, places=4)

        result = check_gradient(f, x, analytical, h=1e-5, rtol=1e-4)
        self.assertTrue(result.passed)
        self.assertLess(result.rel_error, 1e-5)

    def test_gradcheck_relu_kink_disclosure(self):
        # At x=0, ReLU has a kink: left derivative is 0, right derivative is 1.
        # Two-sided difference (relu(0+h) - relu(0-h))/(2h) = (h - 0)/(2h) = 0.5
        # Subgradient is usually 0.0.
        # check_gradient must detect this non-differentiable point and disclose it!
        f_relu = lambda v: max(0.0, v)
        result = check_gradient(f_relu, 0.0, analytical_grad=0.0, h=1e-5, is_kink_point=True)
        self.assertTrue(result.is_kink)
        self.assertIn("kink", result.kink_explanation.lower())


class TestDiagnostics(unittest.TestCase):
    def test_diagnose_overwrite_bug(self):
        # The diagnostic suite must catch and explain the overwrite accumulation bug
        report = diagnose_bug("overwrite-accumulation")
        self.assertFalse(report["gradcheck_passed"])
        self.assertEqual(report["status"], "bug_detected")
        self.assertIn("+=", report["suggested_fix"])

    def test_diagnose_broken_power(self):
        report = diagnose_bug("broken-power")
        self.assertFalse(report["gradcheck_passed"])
        self.assertEqual(report["status"], "bug_detected")
        self.assertIn("power", report["explanation"].lower())


if __name__ == "__main__":
    unittest.main()
