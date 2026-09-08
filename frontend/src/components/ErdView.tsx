import { useState } from "react";
import type { VisualizationPayload } from "../types";
import { formatCount } from "../utils";
import { Metric } from "./Metric";

type ErdTable = NonNullable<NonNullable<VisualizationPayload["erd"]>["tables"]>[number];
type ErdRelationship = NonNullable<NonNullable<VisualizationPayload["erd"]>["relationships"]>[number];
type DiagramPosition = { x: number; y: number; width: number; height: number };

function selectVisibleErdTables(tables: ErdTable[], relationships: ErdRelationship[], filter: string): ErdTable[] {
  const query = filter.trim().toLowerCase();
  if (!query) return tables;
  const directIds = new Set(
    tables
      .filter((table) => [table.id, table.label, table.schema, table.full_name].some((value) => String(value || "").toLowerCase().includes(query)))
      .map((table) => table.id)
  );
  const connectedIds = new Set(directIds);
  relationships.forEach((relationship) => {
    if (directIds.has(relationship.source_table)) connectedIds.add(relationship.target_table);
    if (directIds.has(relationship.target_table)) connectedIds.add(relationship.source_table);
  });
  return tables.filter((table) => connectedIds.has(table.id));
}

function buildErdLayout(tables: ErdTable[]): { width: number; height: number; positions: Map<string, DiagramPosition> } {
  const cardWidth = 300;
  const baseHeight = 96;
  const rowGap = 44;
  const columnGap = 46;
  const columns = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(Math.max(tables.length, 1)))));
  const positions = new Map<string, DiagramPosition>();
  tables.forEach((table, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const height = Math.max(baseHeight, 72 + Math.min(table.columns?.length || 0, 8) * 24);
    positions.set(table.id, {
      x: 28 + column * (cardWidth + columnGap),
      y: 34 + row * (250 + rowGap),
      width: cardWidth,
      height,
    });
  });
  const rows = Math.max(1, Math.ceil(tables.length / columns));
  return {
    width: 56 + columns * cardWidth + (columns - 1) * columnGap,
    height: 70 + rows * 250 + (rows - 1) * rowGap,
    positions,
  };
}

function connectorPath(source: DiagramPosition, target: DiagramPosition, index: number): string {
  const sourceX = source.x + source.width;
  const sourceY = source.y + 34 + (index % 4) * 8;
  const targetX = target.x;
  const targetY = target.y + 34 + (index % 4) * 8;
  const midX = sourceX + (targetX - sourceX) / 2;
  if (source.x === target.x) {
    const loopX = source.x + source.width + 34 + (index % 5) * 10;
    return `M ${sourceX} ${sourceY} C ${loopX} ${sourceY}, ${loopX} ${targetY}, ${target.x + target.width} ${targetY}`;
  }
  return `M ${sourceX} ${sourceY} C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetX} ${targetY}`;
}

export function ErdView({ visualization, filter }: { visualization: VisualizationPayload | null; filter: string }) {
  const allTables = visualization?.erd?.tables || [];
  const allRelationships = visualization?.erd?.relationships || [];
  const tables = selectVisibleErdTables(allTables, allRelationships, filter).slice(0, 80);
  const visibleIds = new Set(tables.map((table) => table.id));
  const relationships = allRelationships.filter((relationship) => visibleIds.has(relationship.source_table) && visibleIds.has(relationship.target_table));
  const layout = buildErdLayout(tables);

  if (!allTables.length) {
    return <div className="diagram-wrap empty-state">ERD is not ready.</div>;
  }

  return (
    <div className="diagram-wrap erd-diagram-wrap">
      <div className="viz-stat-row">
        <Metric label="Visible Tables" value={formatCount(tables.length)} />
        <Metric label="FK Relationships" value={formatCount(relationships.length)} />
        <Metric label="Total Tables" value={formatCount(allTables.length)} />
      </div>
      <div className="diagram-toolbar">
        <span>{filter ? `Showing tables connected to "${filter}".` : "Showing database ERD. Use Navigator search to focus a table."}</span>
        {tables.length < allTables.length && <strong>{formatCount(allTables.length - tables.length)} tables hidden for readability</strong>}
      </div>
      <div className="svg-canvas">
        <svg className="erd-svg" viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label="Entity relationship diagram">
          <defs>
            <marker id="erd-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L9,3 z" className="svg-arrow" />
            </marker>
          </defs>
          <g className="relationship-layer">
            {relationships.map((relationship, index) => {
              const source = layout.positions.get(relationship.source_table);
              const target = layout.positions.get(relationship.target_table);
              if (!source || !target) return null;
              const path = connectorPath(source, target, index);
              const labelX = (source.x + target.x + source.width) / 2;
              const labelY = (source.y + target.y) / 2 - 8;
              return (
                <g key={`${relationship.source_table}-${relationship.target_table}-${index}`}>
                  <path d={path} className="erd-link" markerEnd="url(#erd-arrow)" />
                  <text x={labelX} y={labelY} className="erd-link-label">{relationship.constraint_name || "FK"}</text>
                </g>
              );
            })}
          </g>
          <g className="table-layer">
            {tables.map((table) => {
              const position = layout.positions.get(table.id);
              if (!position) return null;
              const columns = (table.columns || []).slice(0, 8);
              return (
                <g className="erd-table-node" key={table.id} transform={`translate(${position.x}, ${position.y})`}>
                  <rect className="erd-table-box" width={position.width} height={position.height} rx="12" />
                  <rect className="erd-table-head" width={position.width} height="40" rx="12" />
                  <text x="14" y="25" className="erd-table-title">{table.full_name || table.id}</text>
                  {columns.map((column, index) => (
                    <g key={`${table.id}-${column.name}`} transform={`translate(14, ${58 + index * 24})`}>
                      <text className={`erd-column ${column.primary_key ? "pk" : ""} ${column.foreign_key ? "fk" : ""}`} x="0" y="0">
                        {column.primary_key ? "PK " : column.foreign_key ? "FK " : ""}{column.name}
                      </text>
                      <text className="erd-column-type-svg" x={position.width - 28} y="0" textAnchor="end">{column.data_type || ""}</text>
                    </g>
                  ))}
                  {(table.columns?.length || 0) > columns.length && <text x="14" y={position.height - 14} className="erd-more">+{(table.columns?.length || 0) - columns.length} more columns</text>}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
