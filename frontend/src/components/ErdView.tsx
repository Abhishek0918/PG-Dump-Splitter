import { useState, useRef, useMemo, useCallback } from "react";
import type { VisualizationPayload } from "../types";
import { formatCount } from "../utils";
import { Metric } from "./Metric";

type ErdTable = NonNullable<NonNullable<VisualizationPayload["erd"]>["tables"]>[number];
type ErdRelationship = NonNullable<NonNullable<VisualizationPayload["erd"]>["relationships"]>[number];
type DiagramPosition = { x: number; y: number; width: number; height: number };

function buildErdLayout(tables: ErdTable[]): { width: number; height: number; positions: Map<string, DiagramPosition> } {
  const cardWidth = 320;
  const baseHeight = 96;
  const rowGap = 56;
  const columnGap = 64;
  const columns = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(Math.max(tables.length, 1)))));
  const positions = new Map<string, DiagramPosition>();

  tables.forEach((table, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const colCount = Math.min(table.columns?.length || 0, 10);
    const height = Math.max(baseHeight, 64 + colCount * 26 + (table.columns && table.columns.length > 10 ? 24 : 10));

    positions.set(table.id, {
      x: 36 + column * (cardWidth + columnGap),
      y: 44 + row * (280 + rowGap),
      width: cardWidth,
      height,
    });
  });

  const rows = Math.max(1, Math.ceil(tables.length / columns));
  return {
    width: 72 + columns * cardWidth + (columns - 1) * columnGap,
    height: 88 + rows * 280 + (rows - 1) * rowGap,
    positions,
  };
}

function connectorPath(source: DiagramPosition, target: DiagramPosition, index: number): string {
  const sourceX = source.x + source.width;
  const sourceY = source.y + 36 + (index % 4) * 8;
  const targetX = target.x;
  const targetY = target.y + 36 + (index % 4) * 8;
  const midX = sourceX + (targetX - sourceX) / 2;

  if (source.x === target.x) {
    const loopX = source.x + source.width + 40 + (index % 5) * 12;
    return `M ${sourceX} ${sourceY} C ${loopX} ${sourceY}, ${loopX} ${targetY}, ${target.x + target.width} ${targetY}`;
  }
  return `M ${sourceX} ${sourceY} C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetX} ${targetY}`;
}

export function ErdView({ visualization, filter = "" }: { visualization: VisualizationPayload | null; filter?: string }) {
  const [schemaFilter, setSchemaFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [hoveredRelIndex, setHoveredRelIndex] = useState<number | null>(null);
  const [showAllColumns, setShowAllColumns] = useState<boolean>(false);

  // Pan & Zoom State
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(0.95);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const svgContainerRef = useRef<HTMLDivElement>(null);

  const allTables = visualization?.erd?.tables || [];
  const allRelationships = visualization?.erd?.relationships || [];

  // Distinct schemas list
  const availableSchemas = useMemo(() => {
    const set = new Set<string>();
    allTables.forEach((t) => {
      if (t.schema) set.add(t.schema);
    });
    return Array.from(set).sort();
  }, [allTables]);

  // Filter tables by schema and search queries
  const visibleTables = useMemo(() => {
    let result = allTables;

    if (schemaFilter !== "all") {
      result = result.filter((t) => (t.schema || "public") === schemaFilter);
    }

    const query = (searchQuery || filter).trim().toLowerCase();
    if (query) {
      const directIds = new Set(
        result
          .filter((t) =>
            [t.id, t.label, t.schema, t.full_name].some((val) =>
              String(val || "").toLowerCase().includes(query)
            ) ||
            (t.columns || []).some((c) =>
              c.name.toLowerCase().includes(query) || (c.data_type && c.data_type.toLowerCase().includes(query))
            )
          )
          .map((t) => t.id)
      );

      const connectedIds = new Set(directIds);
      allRelationships.forEach((rel) => {
        if (directIds.has(rel.source_table)) connectedIds.add(rel.target_table);
        if (directIds.has(rel.target_table)) connectedIds.add(rel.source_table);
      });

      result = result.filter((t) => connectedIds.has(t.id));
    }

    return result.slice(0, 100);
  }, [allTables, allRelationships, schemaFilter, searchQuery, filter]);

  const visibleIds = useMemo(() => new Set(visibleTables.map((t) => t.id)), [visibleTables]);

  const visibleRelationships = useMemo(() => {
    return allRelationships.filter(
      (rel) => visibleIds.has(rel.source_table) && visibleIds.has(rel.target_table)
    );
  }, [allRelationships, visibleIds]);

  const layout = useMemo(() => buildErdLayout(visibleTables), [visibleTables]);

  // Connected table IDs when a table is focused
  const connectedTableIds = useMemo(() => {
    if (!selectedTableId) return new Set<string>();
    const ids = new Set<string>([selectedTableId]);
    visibleRelationships.forEach((rel) => {
      if (rel.source_table === selectedTableId) ids.add(rel.target_table);
      if (rel.target_table === selectedTableId) ids.add(rel.source_table);
    });
    return ids;
  }, [selectedTableId, visibleRelationships]);

  // Interactive Pan / Drag Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest(".erd-floating-controls") || (e.target as HTMLElement).closest(".erd-toolbar-controls")) return;
    setIsPanning(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    setIsPanning(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignored
    }
  };

  // Scroll wheel to zoom
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const zoomFactor = 1 - e.deltaY * 0.0012;
    setZoom((prev) => Math.min(2.5, Math.max(0.2, Number((prev * zoomFactor).toFixed(3)))));
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(2.5, Number((prev + 0.15).toFixed(2))));
  const handleZoomOut = () => setZoom((prev) => Math.max(0.2, Number((prev - 0.15).toFixed(2))));
  const handleResetZoom = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };
  const handleFitToScreen = useCallback(() => {
    if (!svgContainerRef.current) return;
    const containerWidth = svgContainerRef.current.clientWidth || 800;
    const containerHeight = svgContainerRef.current.clientHeight || 600;
    const scaleX = (containerWidth - 64) / layout.width;
    const scaleY = (containerHeight - 64) / layout.height;
    const optimalScale = Math.min(1.2, Math.max(0.25, Math.min(scaleX, scaleY)));
    setZoom(Number(optimalScale.toFixed(2)));
    setPan({
      x: Math.max(0, (containerWidth - layout.width * optimalScale) / 2),
      y: Math.max(0, (containerHeight - layout.height * optimalScale) / 2),
    });
  }, [layout]);

  if (!allTables.length) {
    return <div className="diagram-wrap empty-state">ERD is not ready.</div>;
  }

  return (
    <div className="diagram-wrap erd-diagram-wrap">
      <div className="viz-stat-row">
        <Metric label="Visible Tables" value={formatCount(visibleTables.length)} />
        <Metric label="FK Relationships" value={formatCount(visibleRelationships.length)} />
        <Metric label="Total Tables" value={formatCount(allTables.length)} />
        <Metric label="Schemas" value={formatCount(availableSchemas.length || 1)} />
      </div>

      <div className="diagram-toolbar">
        <div className="erd-toolbar-controls">
          <select
            className="erd-schema-select"
            value={schemaFilter}
            onChange={(e) => setSchemaFilter(e.target.value)}
          >
            <option value="all">All Schemas ({availableSchemas.length})</option>
            {availableSchemas.map((schema) => (
              <option key={schema} value={schema}>
                schema: {schema}
              </option>
            ))}
          </select>

          <input
            className="erd-search-input"
            type="text"
            placeholder="Search table or column..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <button
            className={`tool-button ${showAllColumns ? "active" : ""}`}
            onClick={() => setShowAllColumns(!showAllColumns)}
          >
            {showAllColumns ? "Compact Columns" : "Show All Columns"}
          </button>
        </div>

        <div>
          {selectedTableId && (
            <button className="tool-button" onClick={() => setSelectedTableId(null)}>
              Clear Table Focus
            </button>
          )}
          {visibleTables.length < allTables.length && (
            <strong> {formatCount(allTables.length - visibleTables.length)} tables hidden</strong>
          )}
        </div>
      </div>

      <div className="erd-canvas-container" ref={svgContainerRef}>
        <div
          className={`svg-canvas ${isPanning ? "is-panning" : ""}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
        >
          <svg
            className="erd-svg"
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role="img"
            aria-label="Entity relationship diagram"
          >
            <defs>
              <marker
                id="erd-arrow"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L0,6 L9,3 z" className="svg-arrow" />
              </marker>
              <marker
                id="erd-arrow-active"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L0,6 L9,3 z" className="svg-arrow highlighted" />
              </marker>
            </defs>

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Relationships Layer */}
              <g className="relationship-layer">
                {visibleRelationships.map((relationship, index) => {
                  const source = layout.positions.get(relationship.source_table);
                  const target = layout.positions.get(relationship.target_table);
                  if (!source || !target) return null;

                  const path = connectorPath(source, target, index);
                  const labelX = (source.x + target.x + source.width) / 2;
                  const labelY = (source.y + target.y) / 2 - 8;

                  const isSelected =
                    selectedTableId !== null &&
                    (relationship.source_table === selectedTableId ||
                      relationship.target_table === selectedTableId);

                  const isDimmed = selectedTableId !== null && !isSelected;
                  const isHovered = hoveredRelIndex === index;

                  return (
                    <g
                      key={`${relationship.source_table}-${relationship.target_table}-${index}`}
                      onMouseEnter={() => setHoveredRelIndex(index)}
                      onMouseLeave={() => setHoveredRelIndex(null)}
                      style={{ cursor: "pointer" }}
                    >
                      <path
                        d={path}
                        className={`erd-link ${isSelected || isHovered ? "highlighted" : ""} ${
                          isDimmed ? "dimmed" : ""
                        }`}
                        markerEnd={isSelected || isHovered ? "url(#erd-arrow-active)" : "url(#erd-arrow)"}
                      />
                      <text
                        x={labelX}
                        y={labelY}
                        className={`erd-link-label ${isDimmed ? "dimmed" : ""}`}
                      >
                        {relationship.constraint_name || "FK"}
                      </text>
                    </g>
                  );
                })}
              </g>

              {/* Tables Layer */}
              <g className="table-layer">
                {visibleTables.map((table) => {
                  const position = layout.positions.get(table.id);
                  if (!position) return null;

                  const isSelected = selectedTableId === table.id;
                  const isConnected = selectedTableId !== null && connectedTableIds.has(table.id);
                  const isDimmed = selectedTableId !== null && !isSelected && !isConnected;

                  const columnLimit = showAllColumns ? (table.columns?.length || 0) : 8;
                  const columns = (table.columns || []).slice(0, columnLimit);
                  const remainingCount = (table.columns?.length || 0) - columns.length;

                  return (
                    <g
                      className={`erd-table-node ${isSelected ? "selected" : ""} ${
                        isConnected ? "connected" : ""
                      } ${isDimmed ? "dimmed" : ""}`}
                      key={table.id}
                      transform={`translate(${position.x}, ${position.y})`}
                      onClick={() => setSelectedTableId((curr) => (curr === table.id ? null : table.id))}
                    >
                      <rect className="erd-table-box" width={position.width} height={position.height} />
                      <rect className="erd-table-head" width={position.width} height={42} />

                      {/* Schema Tag & Table Title */}
                      <text x="14" y="19" className="erd-schema-badge">
                        {table.schema || "public"}
                      </text>
                      <text x="14" y="34" className="erd-table-title">
                        {table.label || table.full_name || table.id}
                      </text>

                      {/* Columns */}
                      {columns.map((column, index) => {
                        const colY = 62 + index * 26;
                        return (
                          <g key={`${table.id}-${column.name}`} transform={`translate(14, ${colY})`}>
                            {column.primary_key && (
                              <text className="erd-badge-pk" x="0" y="0">
                                PK
                              </text>
                            )}
                            {column.foreign_key && !column.primary_key && (
                              <text className="erd-badge-fk" x="0" y="0">
                                FK
                              </text>
                            )}
                            <text
                              className="erd-column"
                              x={column.primary_key || column.foreign_key ? 22 : 0}
                              y="0"
                            >
                              {column.name}
                            </text>
                            <text
                              className="erd-column-type-svg"
                              x={position.width - 28}
                              y="0"
                              textAnchor="end"
                            >
                              {column.data_type || ""}
                            </text>
                          </g>
                        );
                      })}

                      {/* Overflow indicator */}
                      {remainingCount > 0 && (
                        <text x="14" y={position.height - 12} className="erd-more">
                          +{remainingCount} more columns
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </g>
          </svg>
        </div>

        {/* Floating Pan/Zoom Controls */}
        <div className="erd-floating-controls">
          <button className="erd-control-btn" onClick={handleZoomOut} title="Zoom Out">
            -
          </button>
          <span className="erd-zoom-level">{Math.round(zoom * 100)}%</span>
          <button className="erd-control-btn" onClick={handleZoomIn} title="Zoom In">
            +
          </button>
          <button className="erd-control-btn" onClick={handleFitToScreen} title="Fit to Screen">
            Fit
          </button>
          <button className="erd-control-btn" onClick={handleResetZoom} title="Reset to 100%">
            1:1
          </button>
        </div>
      </div>
    </div>
  );
}
