import type { DumpObject } from "../types";
import { highlightSql, safeFilename } from "../utils";
import { downloadText } from "../helpers";

export function SqlPreview({ selectedObject, sql, query, setQuery }: { selectedObject: DumpObject | null; sql: string; query: string; setQuery: (value: string) => void }) {
  return <><div className="sql-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search SQL" /><button className="tool-button" onClick={() => navigator.clipboard.writeText(sql)}>Copy</button><button className="tool-button" onClick={() => downloadText(`${safeFilename(selectedObject?.name || "object")}.sql`, sql, "text/sql")} disabled={!sql}>Download Source</button><span className="sql-meta">{selectedObject ? `${selectedObject.object_type} | ${selectedObject.schema || "_global"} | ${selectedObject.path || ""}` : "No source selected"}</span></div><pre className="sql-preview"><code dangerouslySetInnerHTML={{ __html: highlightSql(sql, query) }} /></pre></>;
}
