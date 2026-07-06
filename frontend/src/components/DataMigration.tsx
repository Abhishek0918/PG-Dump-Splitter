import { useMemo, useState } from "react";

type MigrationMode = "full" | "schema" | "data" | "selective";
type CutoverMode = "offline" | "minimal-downtime";

interface EndpointForm {
  label: string;
  host: string;
  port: string;
  database: string;
  username: string;
  sslMode: string;
  region: string;
}

const defaultSource: EndpointForm = {
  label: "Source RDS",
  host: "source.cluster-xxxx.ap-south-1.rds.amazonaws.com",
  port: "5432",
  database: "postgres",
  username: "postgres",
  sslMode: "require",
  region: "ap-south-1"
};

const defaultTarget: EndpointForm = {
  label: "Target RDS",
  host: "target.cluster-xxxx.ap-south-1.rds.amazonaws.com",
  port: "5432",
  database: "postgres",
  username: "postgres",
  sslMode: "require",
  region: "ap-south-1"
};

const readinessItems = [
  "RDS security groups allow source workstation or migration host",
  "Target parameter group is reviewed for connection limits and WAL settings",
  "PostgreSQL major versions are compatible or upgrade path is approved",
  "Extensions required by source database exist on target",
  "Maintenance window and rollback owner are confirmed",
  "Application write freeze or CDC strategy is approved"
];

const validationItems = [
  "Compare schema object counts",
  "Compare table row counts for critical schemas",
  "Run foreign key and invalid index checks",
  "Validate sequence last values",
  "Run application smoke tests against target",
  "Keep source read-only until sign-off"
];

const architectureNodes = [
  {
    title: "Source RDS PostgreSQL",
    detail: "Existing production database. Keep credentials read-only for dry runs and move to write-freeze only during cutover."
  },
  {
    title: "Migration Host",
    detail: "Temporary EC2 or controlled workstation with psql, pg_dump, pg_restore, network access to both RDS endpoints, and encrypted storage."
  },
  {
    title: "Target RDS PostgreSQL",
    detail: "Prepared destination database with matching extensions, roles, parameter groups, storage, backups, and monitoring."
  },
  {
    title: "Secrets Boundary",
    detail: "Passwords stay outside the planner. Use AWS Secrets Manager, IAM auth, .pgpass, or short-lived environment variables."
  },
  {
    title: "Validation Layer",
    detail: "Schema counts, row counts, sequence values, invalid indexes, FK checks, and application smoke tests before traffic switch."
  },
  {
    title: "Cutover Control",
    detail: "Offline freeze for simple moves, or DMS/logical replication for minimal-downtime final sync before endpoint switch."
  }
];

function updateEndpoint(endpoint: EndpointForm, key: keyof EndpointForm, value: string): EndpointForm {
  return { ...endpoint, [key]: value };
}

function endpointUri(endpoint: EndpointForm): string {
  return `postgresql://${endpoint.username}@${endpoint.host}:${endpoint.port}/${endpoint.database}?sslmode=${endpoint.sslMode}`;
}

function shellSafe(value: string): string {
  return value.replace(/"/g, '\\"');
}

export function DataMigration() {
  const [source, setSource] = useState<EndpointForm>(defaultSource);
  const [target, setTarget] = useState<EndpointForm>(defaultTarget);
  const [mode, setMode] = useState<MigrationMode>("full");
  const [cutover, setCutover] = useState<CutoverMode>("offline");
  const [schemaFilter, setSchemaFilter] = useState("public");
  const [parallelJobs, setParallelJobs] = useState("4");
  const [compress, setCompress] = useState(true);
  const [cleanTarget, setCleanTarget] = useState(false);

  const migrationCommands = useMemo(() => {
    const sourceUri = endpointUri(source);
    const targetUri = endpointUri(target);
    const format = compress ? "custom" : "plain";
    const dumpFile = `${source.database || "database"}_${mode}_dump.${compress ? "dump" : "sql"}`;
    const schemaArg = mode === "selective" || mode === "schema" ? ` --schema="${shellSafe(schemaFilter || "public")}"` : "";
    const dataOnly = mode === "data" ? " --data-only" : "";
    const schemaOnly = mode === "schema" ? " --schema-only" : "";
    const clean = cleanTarget ? " --clean --if-exists" : "";
    return {
      precheck: `psql "${sourceUri}" -c "SELECT version();"\npsql "${targetUri}" -c "SELECT version();"`,
      dump: `pg_dump "${sourceUri}" --format=${format} --no-owner --no-privileges${schemaArg}${dataOnly}${schemaOnly} --file="${dumpFile}"`,
      restore: compress
        ? `pg_restore --dbname="${targetUri}" --jobs=${parallelJobs || "4"} --no-owner --no-privileges${clean} "${dumpFile}"`
        : `psql "${targetUri}" --file="${dumpFile}"`,
      validate: `psql "${targetUri}" -c "SELECT schemaname, relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 20;"`
    };
  }, [cleanTarget, compress, mode, parallelJobs, schemaFilter, source, target]);

  const phases = [
    { title: "1. Discovery", detail: "Collect versions, extensions, sizes, schemas, table counts, roles, and application write behavior." },
    { title: "2. Prepare Target", detail: "Create target RDS, parameter group, subnet/security rules, extensions, roles, and database shell." },
    { title: "3. Dry Run", detail: "Run dump and restore into a temporary target, capture duration, warnings, object drift, and row count deltas." },
    { title: "4. Final Sync", detail: cutover === "minimal-downtime" ? "Use AWS DMS or logical replication for ongoing changes after base load." : "Freeze writes, take final dump, restore, and validate before application switch." },
    { title: "5. Cutover", detail: "Point application to target endpoint, run smoke tests, monitor errors/latency, and keep rollback window open." }
  ];

  return (
    <div className="migration-workspace">
      <section className="migration-hero">
        <div>
          <span className="eyebrow">Data Migration</span>
          <h2>PostgreSQL RDS to RDS migration planner</h2>
          <p>
            Structure the move from one Amazon RDS PostgreSQL database to another with connection readiness,
            migration mode, generated command templates, validation gates, and a cutover runbook.
          </p>
        </div>
        <div className="migration-status-grid">
          <StatusTile label="Engine" value="PostgreSQL" />
          <StatusTile label="Mode" value={mode} />
          <StatusTile label="Cutover" value={cutover === "offline" ? "Offline" : "Minimal downtime"} />
        </div>
      </section>

      <section className="migration-grid two">
        <EndpointCard title="Source RDS" endpoint={source} onChange={(key, value) => setSource((current) => updateEndpoint(current, key, value))} />
        <EndpointCard title="Target RDS" endpoint={target} onChange={(key, value) => setTarget((current) => updateEndpoint(current, key, value))} />
      </section>

      <section className="migration-panel">
        <div className="panel-title">
          <div>
            <h3>System Design</h3>
            <p>Recommended control-plane layout for a safe PostgreSQL RDS-to-RDS migration.</p>
          </div>
        </div>
        <div className="architecture-flow">
          <FlowNode title="Source RDS" caption={source.host} />
          <span className="flow-arrow">-&gt;</span>
          <FlowNode title="Migration Host" caption="pg_dump, pg_restore, validation scripts" highlight />
          <span className="flow-arrow">-&gt;</span>
          <FlowNode title="Target RDS" caption={target.host} />
        </div>
        <div className="architecture-grid">
          {architectureNodes.map((node) => (
            <article className="architecture-card" key={node.title}>
              <strong>{node.title}</strong>
              <p>{node.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="migration-grid three">
        <div className="migration-panel">
          <h3>Migration Strategy</h3>
          <label>Migration mode</label>
          <select value={mode} onChange={(event) => setMode(event.target.value as MigrationMode)}>
            <option value="full">Full database</option>
            <option value="schema">Schema only</option>
            <option value="data">Data only</option>
            <option value="selective">Selective schema</option>
          </select>
          <label>Cutover style</label>
          <select value={cutover} onChange={(event) => setCutover(event.target.value as CutoverMode)}>
            <option value="offline">Offline maintenance window</option>
            <option value="minimal-downtime">Minimal downtime with CDC/DMS</option>
          </select>
          <label>Schema filter</label>
          <input value={schemaFilter} onChange={(event) => setSchemaFilter(event.target.value)} placeholder="public, auth, sales" />
        </div>

        <div className="migration-panel">
          <h3>Restore Options</h3>
          <label>Parallel jobs</label>
          <input value={parallelJobs} onChange={(event) => setParallelJobs(event.target.value)} placeholder="4" />
          <label className="migration-check">
            <input type="checkbox" checked={compress} onChange={(event) => setCompress(event.target.checked)} />
            Use custom compressed dump format
          </label>
          <label className="migration-check">
            <input type="checkbox" checked={cleanTarget} onChange={(event) => setCleanTarget(event.target.checked)} />
            Include clean target restore flags
          </label>
        </div>

        <div className="migration-panel">
          <h3>Security Notes</h3>
          <p className="muted">
            Do not store passwords in this planner. Use `PGPASSWORD`, AWS Secrets Manager, IAM authentication,
            or `.pgpass` on the migration host.
          </p>
          <p className="muted">
            Prefer a temporary EC2 migration host in the same VPC/subnet path as both RDS instances for speed and network control.
          </p>
        </div>
      </section>

      <section className="migration-grid two">
        <ChecklistPanel title="Pre-Migration Readiness" items={readinessItems} />
        <ChecklistPanel title="Post-Restore Validation" items={validationItems} />
      </section>

      <section className="migration-panel">
        <div className="panel-title">
          <div>
            <h3>Generated PostgreSQL Commands</h3>
            <p>Review and run from a secure migration host. These commands intentionally omit passwords.</p>
          </div>
        </div>
        <div className="command-grid">
          <CommandBlock title="Connection precheck" command={migrationCommands.precheck} />
          <CommandBlock title="Dump source" command={migrationCommands.dump} />
          <CommandBlock title="Restore target" command={migrationCommands.restore} />
          <CommandBlock title="Validation query" command={migrationCommands.validate} />
        </div>
      </section>

      <section className="migration-panel">
        <div className="panel-title">
          <div>
            <h3>Execution Runbook</h3>
            <p>Use this structure to coordinate database, application, and cloud infrastructure owners.</p>
          </div>
        </div>
        <div className="phase-list">
          {phases.map((phase) => (
            <article className="phase-card" key={phase.title}>
              <strong>{phase.title}</strong>
              <p>{phase.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function EndpointCard({ title, endpoint, onChange }: { title: string; endpoint: EndpointForm; onChange: (key: keyof EndpointForm, value: string) => void }) {
  return (
    <section className="migration-panel endpoint-card">
      <h3>{title}</h3>
      <div className="endpoint-fields">
        <label>RDS endpoint</label>
        <input value={endpoint.host} onChange={(event) => onChange("host", event.target.value)} />
        <label>Port</label>
        <input value={endpoint.port} onChange={(event) => onChange("port", event.target.value)} />
        <label>Database</label>
        <input value={endpoint.database} onChange={(event) => onChange("database", event.target.value)} />
        <label>Username</label>
        <input value={endpoint.username} onChange={(event) => onChange("username", event.target.value)} />
        <label>SSL mode</label>
        <select value={endpoint.sslMode} onChange={(event) => onChange("sslMode", event.target.value)}>
          <option value="require">require</option>
          <option value="verify-ca">verify-ca</option>
          <option value="verify-full">verify-full</option>
          <option value="disable">disable</option>
        </select>
        <label>AWS region</label>
        <input value={endpoint.region} onChange={(event) => onChange("region", event.target.value)} />
      </div>
    </section>
  );
}

function ChecklistPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="migration-panel">
      <h3>{title}</h3>
      <div className="checklist">
        {items.map((item) => (
          <label className="migration-check" key={item}>
            <input type="checkbox" />
            {item}
          </label>
        ))}
      </div>
    </section>
  );
}

function CommandBlock({ title, command }: { title: string; command: string }) {
  return (
    <article className="command-block">
      <div className="command-title">
        <strong>{title}</strong>
        <button className="tool-button" type="button" onClick={() => navigator.clipboard.writeText(command)}>Copy</button>
      </div>
      <pre>{command}</pre>
    </article>
  );
}

function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FlowNode({ title, caption, highlight = false }: { title: string; caption: string; highlight?: boolean }) {
  return (
    <div className={`flow-node ${highlight ? "highlight" : ""}`}>
      <strong>{title}</strong>
      <span>{caption}</span>
    </div>
  );
}
