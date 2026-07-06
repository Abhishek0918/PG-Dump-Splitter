from __future__ import annotations

from pgsplit.dependency.graph_builder import DependencyGraph


def topological_sort(graph: DependencyGraph) -> list[str]:
    return graph.topological_order()
