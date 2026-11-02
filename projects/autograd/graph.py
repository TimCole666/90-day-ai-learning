#!/usr/bin/env python3
"""
projects/autograd/graph.py
==========================
Computation graph export and visualization in multiple formats:
- Mermaid (for markdown, GitHub, and browser rendering)
- Graphviz DOT (for SVG/PDF generation)
- ASCII table / text tree (for terminal inspection)
"""

from typing import Set, Tuple
from .engine import Value, build_topological_sort


def export_mermaid(root: Value) -> str:
    """Export the computational DAG to Mermaid flowchart format."""
    nodes: Set[Value] = set(build_topological_sort([root]))
    edges: Set[Tuple[Value, Value]] = set()

    for n in nodes:
        for child in n._prev:
            edges.add((child, n))

    lines = ["flowchart LR"]
    for n in nodes:
        uid = f"node_{abs(id(n))}"
        label_text = f"{n.label}: " if n.label else ""
        lines.append(f'    {uid}["{label_text}data: {n.data:.4f} | grad: {n.grad:.4f}"]')
        if n._op:
            op_uid = f"op_{abs(id(n))}"
            lines.append(f'    {op_uid}(("{n._op}"))')
            lines.append(f"    {op_uid} --> {uid}")

    for child, parent in edges:
        child_uid = f"node_{abs(id(child))}"
        if parent._op:
            parent_op = f"op_{abs(id(parent))}"
            lines.append(f"    {child_uid} --> {parent_op}")
        else:
            parent_uid = f"node_{abs(id(parent))}"
            lines.append(f"    {child_uid} --> {parent_uid}")

    return "\n".join(lines)


def export_dot(root: Value) -> str:
    """Export the computational DAG to Graphviz DOT format."""
    nodes: Set[Value] = set(build_topological_sort([root]))
    edges: Set[Tuple[Value, Value]] = set()

    for n in nodes:
        for child in n._prev:
            edges.add((child, n))

    dot = [
        "digraph G {",
        "  rankdir=LR;",
        '  node [shape=record, fontname="Helvetica", fontsize=10];',
    ]

    for n in nodes:
        uid = str(abs(id(n)))
        label_text = f"{n.label} | " if n.label else ""
        dot.append(
            f'  "{uid}" [label="{{{label_text}data: {n.data:.4f} | grad: {n.grad:.4f}}}"];'
        )
        if n._op:
            op_uid = f"op_{uid}"
            dot.append(f'  "{op_uid}" [label="{n._op}", shape=circle, fontsize=10];')
            dot.append(f'  "{op_uid}" -> "{uid}";')

    for child, parent in edges:
        child_uid = str(abs(id(child)))
        if parent._op:
            parent_op = f"op_{abs(id(parent))}"
            dot.append(f'  "{child_uid}" -> "{parent_op}";')
        else:
            parent_uid = str(abs(id(parent)))
            dot.append(f'  "{child_uid}" -> "{parent_uid}";')

    dot.append("}")
    return "\n".join(dot)


def export_ascii(root: Value) -> str:
    """Render an ASCII summary table of the DAG nodes in topological order."""
    nodes = build_topological_sort([root])
    lines = [
        "+" + "-" * 76 + "+",
        "| COMPUTATIONAL GRAPH NODES (Topological Order)                              |",
        "+" + "-" * 16 + "+" + "-" * 12 + "+" + "-" * 14 + "+" + "-" * 14 + "+" + "-" * 16 + "+",
        "| Label          | Op         | Data         | Grad         | Prev Nodes     |",
        "+" + "-" * 16 + "+" + "-" * 12 + "+" + "-" * 14 + "+" + "-" * 14 + "+" + "-" * 16 + "+",
    ]

    for n in nodes:
        label_str = (n.label or "<unlabeled>")[:14]
        op_str = (n._op or "leaf")[:10]
        data_str = f"{n.data:.6f}"[:12]
        grad_str = f"{n.grad:.6f}"[:12]
        prev_str = ",".join(c.label or str(abs(id(c)) % 1000) for c in n._prev)[:14]
        lines.append(
            f"| {label_str:14} | {op_str:10} | {data_str:12} | {grad_str:12} | {prev_str:14} |"
        )

    lines.append("+" + "-" * 16 + "+" + "-" * 12 + "+" + "-" * 14 + "+" + "-" * 14 + "+" + "-" * 16 + "+")
    return "\n".join(lines)
