from __future__ import annotations

from typing import Any


class SchemaDiffEngine:
    """Computes logical and structural differences between two database schemas."""

    def compare(
        self,
        base_schema_intel: dict[str, Any],
        target_schema_intel: dict[str, Any],
        base_objects: list[dict[str, Any]] | None = None,
        target_objects: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        base_tables_list = base_schema_intel.get("tables", [])
        target_tables_list = target_schema_intel.get("tables", [])

        base_tables: dict[str, dict[str, Any]] = {t["id"]: t for t in base_tables_list}
        target_tables: dict[str, dict[str, Any]] = {t["id"]: t for t in target_tables_list}

        base_table_ids = set(base_tables.keys())
        target_table_ids = set(target_tables.keys())

        added_table_ids = sorted(target_table_ids - base_table_ids)
        removed_table_ids = sorted(base_table_ids - target_table_ids)
        common_table_ids = sorted(base_table_ids & target_table_ids)

        tables_added = [
            {
                "id": tid,
                "schema": target_tables[tid].get("schema"),
                "name": target_tables[tid].get("name"),
                "column_count": target_tables[tid].get("column_count", len(target_tables[tid].get("columns", []))),
                "columns": target_tables[tid].get("columns", []),
                "primary_key": target_tables[tid].get("primary_key", []),
            }
            for tid in added_table_ids
        ]

        tables_removed = [
            {
                "id": tid,
                "schema": base_tables[tid].get("schema"),
                "name": base_tables[tid].get("name"),
                "column_count": base_tables[tid].get("column_count", len(base_tables[tid].get("columns", []))),
                "columns": base_tables[tid].get("columns", []),
                "primary_key": base_tables[tid].get("primary_key", []),
            }
            for tid in removed_table_ids
        ]

        tables_modified: list[dict[str, Any]] = []
        total_columns_added = 0
        total_columns_removed = 0
        total_columns_modified = 0

        for tid in common_table_ids:
            b_tab = base_tables[tid]
            t_tab = target_tables[tid]

            table_diff = self._compare_single_table(b_tab, t_tab)
            if table_diff["has_changes"]:
                total_columns_added += len(table_diff["columns"]["added"])
                total_columns_removed += len(table_diff["columns"]["removed"])
                total_columns_modified += len(table_diff["columns"]["modified"])
                tables_modified.append(table_diff)

        # Compare non-table objects (views, functions, triggers, indexes, etc.)
        other_objects_diff = self._compare_other_objects(base_objects or [], target_objects or [])

        # Compare schemas list
        base_schemas = {
            s["name"] for s in base_schema_intel.get("schemas", []) if s.get("name")
        }
        target_schemas = {
            s["name"] for s in target_schema_intel.get("schemas", []) if s.get("name")
        }

        schemas_diff = {
            "added": sorted(target_schemas - base_schemas),
            "removed": sorted(base_schemas - target_schemas),
            "common": sorted(base_schemas & target_schemas),
        }

        total_changes = (
            len(tables_added)
            + len(tables_removed)
            + len(tables_modified)
            + len(schemas_diff["added"])
            + len(schemas_diff["removed"])
            + len(other_objects_diff["added"])
            + len(other_objects_diff["removed"])
        )

        return {
            "summary": {
                "total_changes": total_changes,
                "tables_added": len(tables_added),
                "tables_removed": len(tables_removed),
                "tables_modified": len(tables_modified),
                "columns_added": total_columns_added,
                "columns_removed": total_columns_removed,
                "columns_modified": total_columns_modified,
                "schemas_added": len(schemas_diff["added"]),
                "schemas_removed": len(schemas_diff["removed"]),
                "other_objects_added": len(other_objects_diff["added"]),
                "other_objects_removed": len(other_objects_diff["removed"]),
            },
            "schemas": schemas_diff,
            "tables": {
                "added": tables_added,
                "removed": tables_removed,
                "modified": tables_modified,
            },
            "other_objects": other_objects_diff,
        }

    def _compare_single_table(self, base_table: dict[str, Any], target_table: dict[str, Any]) -> dict[str, Any]:
        table_id = base_table["id"]
        schema = base_table.get("schema")
        name = base_table.get("name")

        base_cols_list = base_table.get("columns", [])
        target_cols_list = target_table.get("columns", [])

        base_cols: dict[str, dict[str, Any]] = {c["name"]: c for c in base_cols_list}
        target_cols: dict[str, dict[str, Any]] = {c["name"]: c for c in target_cols_list}

        b_names = set(base_cols.keys())
        t_names = set(target_cols.keys())

        cols_added = [target_cols[cname] for cname in sorted(t_names - b_names)]
        cols_removed = [base_cols[cname] for cname in sorted(b_names - t_names)]
        cols_modified: list[dict[str, Any]] = []

        for cname in sorted(b_names & t_names):
            b_c = base_cols[cname]
            t_c = target_cols[cname]

            type_changed = b_c.get("data_type") != t_c.get("data_type")
            null_changed = b_c.get("not_null") != t_c.get("not_null")
            pk_changed = b_c.get("primary_key") != t_c.get("primary_key")

            if type_changed or null_changed or pk_changed:
                cols_modified.append(
                    {
                        "name": cname,
                        "data_type_from": b_c.get("data_type"),
                        "data_type_to": t_c.get("data_type"),
                        "not_null_from": b_c.get("not_null"),
                        "not_null_to": t_c.get("not_null"),
                        "primary_key_from": b_c.get("primary_key"),
                        "primary_key_to": t_c.get("primary_key"),
                        "type_changed": type_changed,
                        "nullability_changed": null_changed,
                    }
                )

        # Compare Primary Key
        b_pk = sorted(base_table.get("primary_key", []))
        t_pk = sorted(target_table.get("primary_key", []))
        pk_diff = None
        if b_pk != t_pk:
            pk_diff = {
                "from": b_pk,
                "to": t_pk,
            }

        # Compare Foreign Keys
        b_fks = {self._fk_signature(fk): fk for fk in base_table.get("foreign_keys", [])}
        t_fks = {self._fk_signature(fk): fk for fk in target_table.get("foreign_keys", [])}

        fks_added = [t_fks[sig] for sig in sorted(set(t_fks.keys()) - set(b_fks.keys()))]
        fks_removed = [b_fks[sig] for sig in sorted(set(b_fks.keys()) - set(t_fks.keys()))]

        has_changes = bool(
            cols_added
            or cols_removed
            or cols_modified
            or pk_diff
            or fks_added
            or fks_removed
        )

        return {
            "id": table_id,
            "schema": schema,
            "name": name,
            "has_changes": has_changes,
            "columns": {
                "added": cols_added,
                "removed": cols_removed,
                "modified": cols_modified,
            },
            "primary_key_change": pk_diff,
            "foreign_keys": {
                "added": fks_added,
                "removed": fks_removed,
            },
        }

    @staticmethod
    def _fk_signature(fk: dict[str, Any]) -> str:
        cols = ",".join(sorted(fk.get("columns", [])))
        ref_table = fk.get("references_table") or ""
        ref_cols = ",".join(sorted(fk.get("references_columns", [])))
        return f"{cols}->{ref_table}({ref_cols})"

    def _compare_other_objects(
        self, base_objects: list[dict[str, Any]], target_objects: list[dict[str, Any]]
    ) -> dict[str, list[dict[str, Any]]]:
        # Filter out tables since they are diffed at table-level
        b_map = {
            f"{obj.get('object_type')}:{obj.get('schema')}.{obj.get('name')}": obj
            for obj in base_objects
            if obj.get("object_type") != "tables"
        }
        t_map = {
            f"{obj.get('object_type')}:{obj.get('schema')}.{obj.get('name')}": obj
            for obj in target_objects
            if obj.get("object_type") != "tables"
        }

        b_keys = set(b_map.keys())
        t_keys = set(t_map.keys())

        added = [
            {
                "object_type": t_map[k].get("object_type"),
                "schema": t_map[k].get("schema"),
                "name": t_map[k].get("name"),
                "path": t_map[k].get("path"),
            }
            for k in sorted(t_keys - b_keys)
        ]

        removed = [
            {
                "object_type": b_map[k].get("object_type"),
                "schema": b_map[k].get("schema"),
                "name": b_map[k].get("name"),
                "path": b_map[k].get("path"),
            }
            for k in sorted(b_keys - t_keys)
        ]

        return {"added": added, "removed": removed}


def compare_schemas(
    base_schema_intel: dict[str, Any],
    target_schema_intel: dict[str, Any],
    base_objects: list[dict[str, Any]] | None = None,
    target_objects: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    engine = SchemaDiffEngine()
    return engine.compare(base_schema_intel, target_schema_intel, base_objects, target_objects)
