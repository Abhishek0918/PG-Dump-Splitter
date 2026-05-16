from __future__ import annotations

from collections import defaultdict, deque

from app.models.metadata import DumpObject


class DependencyGraph:
    def __init__(self) -> None:
        self.dependencies: dict[str, set[str]] = defaultdict(set)
        self.object_types: dict[str, str] = {}

    def add_object(self, obj: DumpObject) -> None:
        self.object_types[obj.object_id] = obj.object_type.value
        self.dependencies.setdefault(obj.object_id, set())
        for dependency in obj.dependencies:
            self.dependencies[obj.object_id].add(dependency)
            self.dependencies.setdefault(dependency, set())

    def to_dict(self) -> dict[str, object]:
        nodes = [{"id": node, "object_type": self.object_types.get(node, "external")} for node in sorted(self.dependencies)]
        edges = [
            {"source": source, "target": target}
            for source in sorted(self.dependencies)
            for target in sorted(self.dependencies[source])
        ]
        return {"nodes": nodes, "edges": edges}

    def edge_count(self) -> int:
        return sum(len(values) for values in self.dependencies.values())

    def topological_order(self) -> list[str]:
        indegree = {node: 0 for node in self.dependencies}
        adjacency: dict[str, set[str]] = defaultdict(set)
        for node, deps in self.dependencies.items():
            indegree[node] += len(deps)
            for dep in deps:
                adjacency[dep].add(node)

        queue = deque(sorted(node for node, degree in indegree.items() if degree == 0))
        order: list[str] = []
        while queue:
            current = queue.popleft()
            order.append(current)
            for dependent in sorted(adjacency.get(current, set())):
                indegree[dependent] -= 1
                if indegree[dependent] == 0:
                    queue.append(dependent)

        if len(order) < len(indegree):
            unresolved = sorted(node for node in indegree if node not in order)
            order.extend(unresolved)
        return order
