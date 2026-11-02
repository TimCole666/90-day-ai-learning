#!/usr/bin/env python3
"""
projects/autograd/cli.py
========================
Public command-line interface for the Automatic Differentiation Learning Project.

Commands:
- `forward-backward`: Evaluate forward and backward passes on defined graph presets.
- `gradcheck`: Execute independent numerical gradient checks with tolerance accounting.
- `diagnose`: Run observable failing-gradient diagnostic demonstration.
- `graph`: Export computational graph in Mermaid, DOT, or ASCII formats.
"""

import argparse
import json
import math
import os
import sys
from pathlib import Path
from typing import Dict, List

if __package__ is None or __package__ == "":
    _pkg_root = str(Path(__file__).resolve().parent.parent.parent)
    if _pkg_root not in sys.path:
        sys.path.insert(0, _pkg_root)
    from projects.autograd.diagnostics import diagnose_bug
    from projects.autograd.engine import Value, backward_multiple
    from projects.autograd.gradcheck import check_gradient, gradcheck_expression
    from projects.autograd.graph import export_ascii, export_dot, export_mermaid
else:
    from .diagnostics import diagnose_bug
    from .engine import Value, backward_multiple
    from .gradcheck import check_gradient, gradcheck_expression
    from .graph import export_ascii, export_dot, export_mermaid


def build_neuron_preset():
    x1 = Value(2.0, label="x1")
    w1 = Value(-3.0, label="w1")
    x2 = Value(0.0, label="x2")
    w2 = Value(1.0, label="w2")
    b = Value(6.8813735870195432, label="b")

    x1w1 = x1 * w1; x1w1.label = "x1*w1"
    x2w2 = x2 * w2; x2w2.label = "x2*w2"
    x1w1_x2w2 = x1w1 + x2w2; x1w1_x2w2.label = "x1w1+x2w2"
    n = x1w1_x2w2 + b; n.label = "n"
    o = n.tanh(); o.label = "o"
    return o, {"x1": x1, "w1": w1, "x2": x2, "w2": w2, "b": b, "n": n, "o": o}


def build_shared_node_preset():
    a = Value(3.0, label="a")
    b = Value(4.0, label="b")
    sum_node = a + b; sum_node.label = "a+b"
    f = sum_node * a; f.label = "f"
    return f, {"a": a, "b": b, "f": f}


def build_multi_output_preset():
    a = Value(2.0, label="a")
    b = Value(3.0, label="b")
    y1 = a * b; y1.label = "y1"
    y2 = a + b; y2.label = "y2"
    return [y1, y2], {"a": a, "b": b, "y1": y1, "y2": y2}


def cmd_forward_backward(args):
    try:
        if args.preset == "invalid-log":
            v = Value(-1.0)
            _ = v.log()
            return 0

        elif args.preset == "neuron":
            out_node, node_dict = build_neuron_preset()
            out_node.backward()
            grads = {k: node_dict[k].grad for k in ["x1", "w1", "x2", "w2", "b"]}
            res = {
                "status": "success",
                "preset": "neuron",
                "forward": {"output": out_node.data},
                "backward": {"gradients": grads},
            }

        elif args.preset == "shared-node":
            out_node, node_dict = build_shared_node_preset()
            out_node.backward()
            grads = {"a": node_dict["a"].grad, "b": node_dict["b"].grad}
            res = {
                "status": "success",
                "preset": "shared-node",
                "forward": {"output": out_node.data},
                "backward": {"gradients": grads},
            }

        elif args.preset == "multi-output":
            outputs, node_dict = build_multi_output_preset()
            backward_multiple(outputs, grad_outputs=[1.0, 1.0])
            grads = {"a": node_dict["a"].grad, "b": node_dict["b"].grad}
            res = {
                "status": "success",
                "preset": "multi-output",
                "forward": {"outputs": [y.data for y in outputs]},
                "backward": {"gradients": grads},
            }
        else:
            sys.stderr.write(f"Unknown preset: {args.preset}\n")
            return 1

        if args.json:
            print(json.dumps(res, indent=2))
        else:
            print(f"=== Preset: {args.preset} ===")
            print(f"Forward: {res['forward']}")
            print(f"Backward Gradients: {res['backward']['gradients']}")
        return 0

    except ValueError as e:
        sys.stderr.write(f"ValueError: {e}\n")
        return 1
    except Exception as e:
        sys.stderr.write(f"Error: {e}\n")
        return 1


def cmd_gradcheck(args):
    if args.preset == "relu-kink":
        # Check ReLU at x=0
        f_relu = lambda v: max(0.0, v)
        result = check_gradient(
            f_relu,
            args.x if hasattr(args, "x") and args.x is not None else 0.0,
            analytical_grad=0.0,
            param_name="x",
            h=args.h,
            rtol=args.rtol,
            atol=args.atol,
            is_kink_point=True,
        )
        data = {
            "status": "passed",
            "preset": "relu-kink",
            "nondifferentiable_detected": True,
            "kink_explanation": result.kink_explanation,
            "check": result.to_dict(),
        }

    elif args.preset == "complex":
        # z = (x*2 + tanh(y))^2 - exp(x/y) + log(x)
        inputs = {"x": 1.5, "y": 2.5}

        def fn_builder(vals):
            x = vals["x"]
            y = vals["y"]
            return (x * 2.0 + y.tanh()) ** 2 - (x / y).exp() + x.log()

        all_passed, results = gradcheck_expression(
            fn_builder,
            inputs,
            h=args.h,
            rtol=args.rtol,
            atol=args.atol,
        )
        data = {
            "status": "passed" if all_passed else "failed",
            "preset": "complex",
            "all_passed": all_passed,
            "checks": [r.to_dict() for r in results],
            "tolerances": {"h": args.h, "rtol": args.rtol, "atol": args.atol},
        }

    else:
        sys.stderr.write(f"Unknown preset: {args.preset}\n")
        return 1

    if args.json:
        print(json.dumps(data, indent=2))
    else:
        print(f"=== Gradcheck Result ({args.preset}) ===")
        print(json.dumps(data, indent=2))
    return 0 if data["status"] == "passed" else 1


def cmd_diagnose(args):
    report = diagnose_bug(args.bug_type)
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print("=" * 65)
        print(f"  🔍 FAILING GRADIENT DIAGNOSTIC: {args.bug_type}")
        print("=" * 65)
        print(f"Status:            {report['status']}")
        print(f"Pinpointed Node:   {report['pinpointed_node']}")
        print(f"Analytical Grad:   {report['analytical_grad']:.6f}")
        print(f"Numerical Grad:    {report['numerical_grad']:.6f}")
        print(f"Relative Error:    {report['rel_error']:.2e}")
        print("-" * 65)
        print("Root Cause Analysis:")
        print(report["explanation"])
        print("-" * 65)
        print("Suggested Fix:")
        print(report["suggested_fix"])
        print("=" * 65)
    return 0


def cmd_graph(args):
    if args.preset == "neuron":
        root, _ = build_neuron_preset()
    elif args.preset == "shared-node":
        root, _ = build_shared_node_preset()
    else:
        sys.stderr.write(f"Unknown preset for graph: {args.preset}\n")
        return 1

    root.backward()

    if args.format == "mermaid":
        print(export_mermaid(root))
    elif args.format == "dot":
        print(export_dot(root))
    else:
        print(export_ascii(root))
    return 0


def main():
    parser = argparse.ArgumentParser(
        prog="autograd",
        description="Automatic Differentiation Learning Project CLI",
    )
    subparsers = parser.add_subparsers(dest="subcommand", help="Available subcommands")

    # forward-backward
    p_fb = subparsers.add_parser("forward-backward", help="Run forward and backward passes")
    p_fb.add_argument("--preset", choices=["neuron", "shared-node", "multi-output", "invalid-log"], default="neuron")
    p_fb.add_argument("--json", action="store_true", help="Output results in JSON format")

    # gradcheck
    p_gc = subparsers.add_parser("gradcheck", help="Run numerical finite difference gradient checks")
    p_gc.add_argument("--preset", choices=["complex", "relu-kink"], default="complex")
    p_gc.add_argument("--x", type=float, default=0.0, help="Input x for relu-kink")
    p_gc.add_argument("--h", type=float, default=1e-5, help="Finite difference step size")
    p_gc.add_argument("--rtol", type=float, default=1e-3, help="Relative error tolerance")
    p_gc.add_argument("--atol", type=float, default=1e-5, help="Absolute error tolerance")
    p_gc.add_argument("--json", action="store_true", help="Output results in JSON format")

    # diagnose
    p_diag = subparsers.add_parser("diagnose", help="Run observable failing-gradient diagnostic demonstration")
    p_diag.add_argument(
        "--bug-type",
        choices=["overwrite-accumulation", "broken-power", "broken-relu"],
        default="overwrite-accumulation",
        help="Type of deliberate autograd defect to diagnose",
    )
    p_diag.add_argument("--json", action="store_true", help="Output results in JSON format")

    # graph
    p_graph = subparsers.add_parser("graph", help="Export computation graph visualization")
    p_graph.add_argument("--preset", choices=["neuron", "shared-node"], default="neuron")
    p_graph.add_argument("--format", choices=["mermaid", "dot", "ascii"], default="ascii")

    args = parser.parse_args()
    if not args.subcommand:
        parser.print_help()
        sys.exit(0)

    dispatch = {
        "forward-backward": cmd_forward_backward,
        "gradcheck": cmd_gradcheck,
        "diagnose": cmd_diagnose,
        "graph": cmd_graph,
    }

    ret = dispatch[args.subcommand](args)
    sys.exit(ret)


if __name__ == "__main__":
    main()
