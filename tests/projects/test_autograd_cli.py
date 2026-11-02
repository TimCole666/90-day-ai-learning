#!/usr/bin/env python3
"""
tests/projects/test_autograd_cli.py
===================================
Process-isolated integration test suite for the Automatic Differentiation
Learning Project CLI (Ticket 17).

Key requirements:
- Executes `projects/autograd/cli.py` in isolated subprocesses.
- Runs from an unrelated temporary directory to ensure zero working-directory bias.
- Tests forward/backward execution, shared-node gradient accumulation,
  multi-output DAGs, numerical gradcheck with tolerance accounting,
  non-differentiable kink disclosure, observable failing-gradient diagnosis,
  and computational graph export.
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
CLI_PATH = REPO_ROOT / "projects" / "autograd" / "cli.py"


class TestAutogradCLIProcessIsolated(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.cwd = self.temp_dir.name

    def tearDown(self):
        self.temp_dir.cleanup()

    def run_cli(self, args: list[str], expect_success: bool = True) -> subprocess.CompletedProcess:
        """Run the CLI in a separate process from an unrelated directory."""
        cmd = [sys.executable, str(CLI_PATH)] + args
        env = dict(os.environ)
        # Ensure PYTHONPATH does not accidentally leak the repo root
        env.pop("PYTHONPATH", None)

        res = subprocess.run(
            cmd,
            cwd=self.cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
            timeout=15,
        )
        if expect_success and res.returncode != 0:
            self.fail(
                f"CLI command failed with code {res.returncode}.\n"
                f"Stdout: {res.stdout}\n"
                f"Stderr: {res.stderr}"
            )
        return res

    def test_cli_help(self):
        """CLI must display help and list all required subcommands."""
        res = self.run_cli(["--help"])
        self.assertEqual(res.returncode, 0)
        self.assertIn("forward-backward", res.stdout)
        self.assertIn("gradcheck", res.stdout)
        self.assertIn("diagnose", res.stdout)
        self.assertIn("graph", res.stdout)

    def test_cli_forward_backward_neuron(self):
        """Verify forward and backward passes on Karpathy single-neuron preset."""
        res = self.run_cli(["forward-backward", "--preset", "neuron", "--json"])
        data = json.loads(res.stdout)
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["preset"], "neuron")

        # Verify forward output o = tanh(x1*w1 + x2*w2 + b)
        # With x1=2.0, w1=-3.0, x2=0.0, w2=1.0, b=6.8813735870195432
        # n = -6 + 0 + 6.88137... = 0.881373587...
        # tanh(0.881373587...) = 0.70710678...
        output_val = data["forward"]["output"]
        self.assertAlmostEqual(output_val, 0.70710678, places=5)

        # Verify backward gradients
        grads = data["backward"]["gradients"]
        # dL/do = 1.0, dL/dn = 1 - (0.7071)^2 = 0.5000
        # dL/dx1 = w1 * 0.5 = -1.5000
        # dL/dw1 = x1 * 0.5 = 1.0000
        # dL/dx2 = w2 * 0.5 = 0.5000
        # dL/dw2 = x2 * 0.5 = 0.0000
        # dL/db = 0.5000
        self.assertAlmostEqual(grads["x1"], -1.5, places=4)
        self.assertAlmostEqual(grads["w1"], 1.0, places=4)
        self.assertAlmostEqual(grads["x2"], 0.5, places=4)
        self.assertAlmostEqual(grads["w2"], 0.0, places=4)
        self.assertAlmostEqual(grads["b"], 0.5, places=4)

    def test_cli_forward_backward_shared_node_accumulation(self):
        """Verify shared-node gradient accumulation: f = (a + b) * a."""
        # a=3, b=4 => f = (3+4)*3 = 21
        # df/da = (a+b) + a = 7 + 3 = 10
        # df/db = a = 3
        res = self.run_cli(["forward-backward", "--preset", "shared-node", "--json"])
        data = json.loads(res.stdout)
        self.assertEqual(data["status"], "success")
        self.assertAlmostEqual(data["forward"]["output"], 21.0, places=6)
        grads = data["backward"]["gradients"]
        self.assertAlmostEqual(grads["a"], 10.0, places=6)
        self.assertAlmostEqual(grads["b"], 3.0, places=6)

    def test_cli_forward_backward_multi_output(self):
        """Verify multi-output evaluation on branching graph: y1 = a*b, y2 = a+b."""
        res = self.run_cli(["forward-backward", "--preset", "multi-output", "--json"])
        data = json.loads(res.stdout)
        self.assertEqual(data["status"], "success")
        self.assertIn("outputs", data["forward"])
        # With default a=2.0, b=3.0:
        # y1 = 6.0, y2 = 5.0
        # If seed gradients are 1.0 for each output (joint scalarization / sum loss):
        # dy1/da = 3, dy2/da = 1 => d(y1+y2)/da = 4
        # dy1/db = 2, dy2/db = 1 => d(y1+y2)/db = 3
        grads = data["backward"]["gradients"]
        self.assertAlmostEqual(grads["a"], 4.0, places=5)
        self.assertAlmostEqual(grads["b"], 3.0, places=5)

    def test_cli_gradcheck_complex_expression(self):
        """Verify two-sided numerical gradcheck on non-linear expression."""
        # Tests z = (x*2 + tanh(y))^2 - exp(x/y) + log(x)
        res = self.run_cli(["gradcheck", "--preset", "complex", "--json"])
        data = json.loads(res.stdout)
        self.assertEqual(data["status"], "passed")
        self.assertTrue(data["all_passed"])
        for check in data["checks"]:
            self.assertTrue(check["passed"])
            self.assertLess(check["rel_error"], 1e-4)
            self.assertIn("numerical_grad", check)
            self.assertIn("analytical_grad", check)
            self.assertIn("tolerance", check)

    def test_cli_failed_gradcheck_returns_nonzero(self):
        res = self.run_cli(
            ["gradcheck", "--preset", "complex", "--h", "0.1",
             "--rtol", "0", "--atol", "0", "--json"],
            expect_success=False,
        )
        data = json.loads(res.stdout)
        self.assertEqual(data["status"], "failed")
        self.assertFalse(data["all_passed"])
        self.assertTrue(any(not check["passed"] for check in data["checks"]))
        self.assertNotEqual(res.returncode, 0)
        self.assertNotIn("Traceback", res.stderr)

    def test_cli_gradcheck_discloses_nondifferentiable_point(self):
        """Verify gradcheck identifies and discloses non-differentiable kinks (e.g. ReLU at 0)."""
        res = self.run_cli(["gradcheck", "--preset", "relu-kink", "--json"])
        data = json.loads(res.stdout)
        self.assertIn("nondifferentiable_detected", data)
        self.assertTrue(data["nondifferentiable_detected"])
        self.assertIn("kink_explanation", data)
        self.assertIn("ReLU", data["kink_explanation"])

    def test_cli_diagnose_observable_failing_gradient(self):
        """Verify observable failing-gradient diagnostic demonstration catches and pinpoints bug."""
        # Run diagnosis on deliberate bug: overwrite gradient accumulation (self.grad = out.grad)
        res = self.run_cli(["diagnose", "--bug-type", "overwrite-accumulation", "--json"])
        data = json.loads(res.stdout)
        self.assertEqual(data["status"], "bug_detected")
        self.assertFalse(data["gradcheck_passed"])
        self.assertIn("pinpointed_node", data)
        self.assertIn("explanation", data)
        self.assertIn("suggested_fix", data)
        self.assertIn("+=", data["suggested_fix"])

        # Also test broken power derivative diagnosis
        res_pow = self.run_cli(["diagnose", "--bug-type", "broken-power", "--json"])
        data_pow = json.loads(res_pow.stdout)
        self.assertEqual(data_pow["status"], "bug_detected")
        self.assertIn("pinpointed_node", data_pow)
        self.assertIn("power", data_pow["explanation"].lower())

    def test_cli_graph_visualization(self):
        """Verify graph export in Mermaid and DOT formats."""
        res_mermaid = self.run_cli(["graph", "--preset", "neuron", "--format", "mermaid"])
        self.assertIn("flowchart", res_mermaid.stdout)
        self.assertIn("-->", res_mermaid.stdout)

        res_dot = self.run_cli(["graph", "--preset", "neuron", "--format", "dot"])
        self.assertIn("digraph", res_dot.stdout)
        self.assertIn("->", res_dot.stdout)

    def test_cli_invalid_input_domain_error(self):
        """CLI must cleanly fail on mathematically invalid inputs (e.g. log <= 0)."""
        res = self.run_cli(["forward-backward", "--preset", "invalid-log"], expect_success=False)
        self.assertNotEqual(res.returncode, 0)
        self.assertTrue(
            "domain error" in res.stderr.lower() or "log requires positive" in res.stderr.lower()
        )


if __name__ == "__main__":
    unittest.main()
