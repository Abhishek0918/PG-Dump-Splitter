import type { SchemaIntelligencePayload } from "../types";
import { formatCount } from "../utils";
import { Metric } from "./Metric";

export function SchemaIntelligencePanel({ intelligence }: { intelligence: SchemaIntelligencePayload | null }) {
  if (!intelligence) return null;
  const summary = intelligence.summary || {};
  const schemas = (intelligence.schemas || []).slice(0, 8);
  const hotspots = intelligence.relationship_hotspots || [];
  return (
    <section className="schema-intelligence-panel">
      <div className="panel-title"><div><h3>Schema Intelligence</h3><p>Database-level facts extracted from the dump schema.</p></div></div>
      <div className="overview-grid compact-grid">
        <Metric label="Schemas" value={formatCount(summary.schema_count)} />
        <Metric label="Tables" value={formatCount(summary.table_count)} />
        <Metric label="Columns" value={formatCount(summary.column_count)} />
        <Metric label="Foreign Keys" value={formatCount(summary.foreign_key_count)} />
        <Metric label="Views" value={formatCount(summary.view_count)} />
        <Metric label="Functions" value={formatCount(summary.function_count)} />
      </div>
      <div className="schema-intelligence-grid">
        <div>
          <h4>Schemas</h4>
          <div className="schema-chip-list">{schemas.length ? schemas.map((schema) => <span className="schema-chip" key={schema.name || "global"}><strong>{schema.name || "global"}</strong><small>{formatCount(schema.object_count)} objects</small></span>) : <span className="muted">No schema objects found.</span>}</div>
        </div>
        <div>
          <h4>Relationship Hotspots</h4>
          <div className="hotspot-list">{hotspots.length ? hotspots.slice(0, 6).map((item) => <span className="hotspot-row" key={item.table}><strong>{item.table}</strong><small>{formatCount(item.inbound_count)} in | {formatCount(item.outbound_count)} out | {formatCount(item.dependent_object_count)} objects</small></span>) : <span className="muted">No relationships detected yet.</span>}</div>
        </div>
      </div>
    </section>
  );
}
