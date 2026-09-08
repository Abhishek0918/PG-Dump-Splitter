import { useState } from "react";
import type { VisualizationPayload } from "../types";
import { formatCount, iconText } from "../utils";
import { Metric } from "./Metric";

type ErdRelationship = NonNullable<NonNullable<VisualizationPayload["erd"]>["relationships"]>[number];

function buildFkDependencyTree(relationships: ErdRelationship[], filter: string): {
  parentCount: number;
  dependentTableCount: number;
  relationshipCount: number;
  parents: Array<{ table: string; children: Array<{ table: string; columns: string[]; targetColumns: string[]; constraint?: string | null }> }>;
} {
  const query = filter.trim().toLowerCase();
  const parents = new Map<string, Array<{ table: string; columns: string[]; targetColumns: string[]; constraint?: string | null }>>();
  relationships.forEach((relationship) => {
    const parent = relationship.target_table;
    const child = relationship.source_table;
    if (!parent || !child) return;
    if (query && ![parent, child, relationship.constraint_name, ...(relationship.source_columns || []), ...(relationship.target_columns || [])].some((value) => String(value || "").toLowerCase().includes(query))) {
      return;
    }
    const children = parents.get(parent) || [];
    if (!children.some((item) => item.table === child && item.constraint === relationship.constraint_name)) {
      children.push({
        table: child,
        columns: relationship.source_columns || [],
        targetColumns: relationship.target_columns || [],
        constraint: relationship.constraint_name,
      });
    }
    parents.set(parent, children);
  });
  const rows = [...parents.entries()]
    .map(([table, children]) => ({ table, children: children.sort((a, b) => a.table.localeCompare(b.table)) }))
    .sort((a, b) => b.children.length - a.children.length || a.table.localeCompare(b.table));
  const dependentTables = new Set(rows.flatMap((row) => row.children.map((child) => child.table)));
  return {
    parentCount: rows.length,
    dependentTableCount: dependentTables.size,
    relationshipCount: relationships.length,
    parents: rows,
  };
}

function buildDependentObjects(visualization: VisualizationPayload | null, objectType: string, filter: string): Array<{ id: string; type: string; dependsOn: string; dependencyCount: number }> {
  const nodes = new Map((visualization?.dependency_graph?.nodes || []).map((node) => [node.id, node]));
  const query = filter.trim().toLowerCase();
  const edges = (visualization?.dependency_graph?.edges || [])
    .map((edge) => {
      const dependentNode = nodes.get(edge.target);
      const dependencyNode = nodes.get(edge.source);
      return {
        id: edge.target,
        type: dependentNode?.type || "unknown",
        dependsOn: edge.source,
        dependencyFields: [edge.source, dependencyNode?.label, dependencyNode?.schema].map((value) => String(value || "").toLowerCase()),
        objectFields: [edge.target, dependentNode?.label, dependentNode?.schema, dependentNode?.type].map((value) => String(value || "").toLowerCase()),
      };
    })
    .filter((item) => item.type === objectType);

  const sourceMatchedEdges = query
    ? edges.filter((item) => item.dependencyFields.some((value) => value.includes(query)))
    : edges;
  const filteredEdges = query && sourceMatchedEdges.length
    ? sourceMatchedEdges
    : edges.filter((item) => !query || [...item.dependencyFields, ...item.objectFields].some((value) => value.includes(query)));

  const grouped = new Map<string, { id: string; type: string; dependencies: Set<string> }>();
  filteredEdges.forEach((edge) => {
    const row = grouped.get(edge.id) || { id: edge.id, type: edge.type, dependencies: new Set<string>() };
    if (edge.dependsOn) {
      row.dependencies.add(edge.dependsOn);
    }
    grouped.set(edge.id, row);
  });

  return [...grouped.values()]
    .map((row) => {
      const dependencies = [...row.dependencies].sort((a, b) => a.localeCompare(b));
      return {
        id: row.id,
        type: row.type,
        dependencyCount: dependencies.length,
        dependsOn: summarizeDependencies(dependencies),
      };
    })
    .sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
}

function summarizeDependencies(dependencies: string[]): string {
  if (!dependencies.length) return "unknown dependency";
  const visible = dependencies.slice(0, 3).join(", ");
  const remaining = dependencies.length - 3;
  return remaining > 0 ? `${visible} +${remaining} more` : visible;
}

export function DependencyView({ visualization, filter }: { visualization: VisualizationPayload | null; filter: string }) {
  const [objectType, setObjectType] = useState("functions");
  const relationships = visualization?.erd?.relationships || [];
  const tableTree = buildFkDependencyTree(relationships, filter);
  const dependentObjects = buildDependentObjects(visualization, objectType, filter);
  const objectTypes = ["functions", "views", "constraints", "indexes", "triggers", "materialized_views", "policies", "sequences"];

  if (!visualization) {
    return <div className="diagram-wrap empty-state">Dependency graph is not ready.</div>;
  }

  return (
    <div className="diagram-wrap dependency-diagram-wrap">
      <div className="viz-stat-row">
        <Metric label="Parent Tables" value={formatCount(tableTree.parentCount)} />
        <Metric label="Dependent Tables" value={formatCount(tableTree.dependentTableCount)} />
        <Metric label="FK Mappings" value={formatCount(tableTree.relationshipCount)} />
      </div>
      <div className="dependency-layout">
        <section className="dependency-panel">
          <div className="panel-title">
            <div>
              <h3>Foreign-Key Dependency Tree</h3>
              <p>Parent tables are referenced by child tables. Use Navigator search to focus a table.</p>
            </div>
          </div>
          {tableTree.parents.length ? (
            <div className="dependency-tree">
              {tableTree.parents.slice(0, 80).map((parent) => (
                <article className="dependency-parent" key={parent.table}>
                  <div className="dependency-parent-head">
                    <strong>{parent.table}</strong>
                    <span>{formatCount(parent.children.length)} child tables</span>
                  </div>
                  <div className="dependency-children">
                    {parent.children.slice(0, 24).map((child) => (
                      <div className="dependency-child" key={`${parent.table}-${child.table}`}>
                        <span>{child.table}</span>
                        <small>{child.columns.join(", ") || "FK"} -&gt; {child.targetColumns.join(", ") || "PK"}</small>
                      </div>
                    ))}
                    {parent.children.length > 24 && <div className="dependency-more">+{parent.children.length - 24} more child tables</div>}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">No FK parent-child mappings found.</div>
          )}
        </section>
        <section className="dependency-panel">
          <div className="panel-title">
            <div>
              <h3>Other Dependent Objects</h3>
              <p>Objects that depend on tables or other database objects.</p>
            </div>
            <select value={objectType} onChange={(event) => setObjectType(event.target.value)}>
              {objectTypes.map((type) => <option key={type} value={type}>{type.replace("_", " ")}</option>)}
            </select>
          </div>
          <div className="dependent-object-list">
            {dependentObjects.length ? dependentObjects.slice(0, 140).map((item) => (
              <article className="dependent-object" key={item.id}>
                <span className={`tree-icon icon-${item.type}`}>{iconText(item.type)}</span>
                <div>
                  <strong>{item.id}</strong>
                  <small>depends on {item.dependsOn}</small>
                </div>
              </article>
            )) : <div className="empty-state">No dependent {objectType.replace("_", " ")} found.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
