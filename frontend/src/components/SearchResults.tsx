import type { DumpObject } from "../types";
import { iconText } from "../utils";

export function SearchResults({ query, items, onSelect }: { query: string; items: DumpObject[]; onSelect: (objectId?: string) => void }) {
  return <section className="search-results-panel"><div className="panel-title"><div><h3>Search Results</h3><p>{items.length.toLocaleString()} matches for "{query}"</p></div></div><div className="search-results">{items.length ? items.map((item) => <button className="search-result" key={item.object_id} onClick={() => onSelect(item.object_id)}><span className={`tree-icon icon-${item.object_type}`}>{iconText(item.object_type)}</span><span><span className="result-title">{item.schema ? `${item.schema}.${item.name}` : item.name}</span><span className="result-path">{item.path || item.object_id}</span></span><span className="tree-tag">{item.object_type}</span></button>) : <div className="command-empty">No matching objects found.</div>}</div></section>;
}
