import type { TreeNode } from "../types";
import { iconText } from "../utils";

export function TreeView({ node, selectedId, onSelect, empty }: { node?: TreeNode; selectedId?: string; onSelect: (objectId?: string) => void; empty: string }) {
  if (!node) return <div className="tree-wrap empty-state">{empty}</div>;
  return <div className="tree-wrap">{renderNode(node, true, selectedId, onSelect)}</div>;
}

function renderNode(node: TreeNode, root: boolean, selectedId: string | undefined, onSelect: (objectId?: string) => void) {
  const clickable = Boolean(node.object_id);
  const kind = node.icon || node.object_type || node.kind || node.type || "object";
  return (
    <div className={`tree-node ${root ? "root" : ""}`} key={`${node.path || node.object_id || node.name}-${root}`}>
      <button className={`tree-label ${clickable ? "clickable" : ""} ${selectedId === node.object_id ? "selected" : ""}`} onClick={() => clickable && onSelect(node.object_id)} type="button">
        <span className={`tree-icon icon-${kind}`}>{iconText(kind)}</span><strong>{node.name}</strong>{node.count !== undefined && <span className="tree-count">{node.count}</span>}{node.object_type && <span className="tree-tag">{node.object_type}</span>}
      </button>
      {(node.children || []).map((child) => renderNode(child, false, selectedId, onSelect))}
    </div>
  );
}
