import React, { useState } from "react";
import type { FieldDefinition, FieldSource } from "../../shared/models";
import { Icons } from "./Icons";

interface FieldEditorProps {
  fields: FieldDefinition[];
  onChange: (fields: FieldDefinition[]) => void;
  onRefreshPreview: () => void;
}

export const FieldEditor: React.FC<FieldEditorProps> = ({
  fields,
  onChange,
  onRefreshPreview,
}) => {
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customSelector, setCustomSelector] = useState("");
  const [customSource, setCustomSource] = useState<FieldSource>("text");

  const toggleField = (id: string, selected: boolean) => {
    onChange(fields.map((f) => (f.id === id ? { ...f, selected } : f)));
  };

  const updateFieldName = (id: string, name: string) => {
    onChange(fields.map((f) => (f.id === id ? { ...f, name } : f)));
  };

  const updateFieldSource = (id: string, source: FieldSource) => {
    onChange(fields.map((f) => (f.id === id ? { ...f, source } : f)));
  };

  const deleteField = (id: string) => {
    onChange(fields.filter((f) => f.id !== id));
  };

  const selectAll = (selected: boolean) => {
    onChange(fields.map((f) => ({ ...f, selected })));
  };

  const addCustomField = () => {
    if (!customName.trim()) return;
    const newField: FieldDefinition = {
      id: crypto.randomUUID(),
      name: customName.trim().toLowerCase().replace(/\s+/g, "_"),
      relativeSelector: customSelector.trim(),
      source: customSource,
      selected: true,
    };
    onChange([...fields, newField]);
    setCustomName("");
    setCustomSelector("");
    setShowAddCustom(false);
    onRefreshPreview();
  };

  const selectedCount = fields.filter((f) => f.selected).length;

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">
            <Icons.Table />
            <span>Extracted Fields ({selectedCount} of {fields.length} selected)</span>
          </h2>
          <p className="card-desc">
            Check the fields you want to export. Click any column name to rename it.
          </p>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn-secondary btn-sm" onClick={() => selectAll(true)} title="Select all fields">
            Select All
          </button>
          <button className="btn-secondary btn-sm" onClick={() => selectAll(false)} title="Deselect all fields">
            Clear
          </button>
        </div>
      </div>

      <div className="fields-table">
        {fields.map((field) => (
          <div className="field-row" key={field.id}>
            <input
              type="checkbox"
              checked={field.selected}
              onChange={(e) => toggleField(field.id, e.target.checked)}
              title="Include in export"
              style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--primary)" }}
            />

            <input
              type="text"
              className="field-name-input"
              value={field.name}
              onChange={(e) => updateFieldName(field.id, e.target.value)}
              placeholder="Column name"
              title="Click to rename column"
            />

            <select
              value={field.source}
              onChange={(e) => updateFieldSource(field.id, e.target.value as FieldSource)}
              style={{ fontSize: 11, padding: "4px 6px" }}
              title="Source attribute"
            >
              <option value="text">Text</option>
              <option value="href">Link URL (href)</option>
              <option value="src">Image URL (src)</option>
              <option value="alt">Image Alt</option>
              <option value="datetime">Datetime</option>
            </select>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {field.sampleValue && (
                <span className="field-sample" title={`Sample: ${field.sampleValue}`}>
                  {field.sampleValue}
                </span>
              )}
              <button
                className="btn-danger btn-sm"
                onClick={() => deleteField(field.id)}
                title="Remove field"
                style={{ padding: "3px 6px" }}
              >
                <Icons.Trash />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showAddCustom ? (
        <div style={{ background: "var(--bg-app)", border: "1px solid var(--border-color)", padding: 10, borderRadius: "var(--radius-sm)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 12 }}>Add Custom Field</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px", gap: 8 }}>
            <input
              type="text"
              placeholder="Field name (e.g. sku)"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
            <input
              type="text"
              placeholder="CSS selector (e.g. span.sku-code)"
              value={customSelector}
              onChange={(e) => setCustomSelector(e.target.value)}
            />
            <select
              value={customSource}
              onChange={(e) => setCustomSource(e.target.value as FieldSource)}
            >
              <option value="text">Text</option>
              <option value="href">href</option>
              <option value="src">src</option>
              <option value="alt">alt</option>
              <option value="datetime">datetime</option>
            </select>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <button className="btn-secondary btn-sm" onClick={() => setShowAddCustom(false)}>Cancel</button>
            <button className="btn-primary btn-sm" onClick={addCustomField}>Add Field</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <button className="btn-secondary btn-sm" onClick={() => setShowAddCustom(true)}>
            <Icons.Plus />
            <span>Add Custom Field</span>
          </button>
          <button className="btn-secondary btn-sm" onClick={onRefreshPreview}>
            <Icons.Refresh />
            <span>Refresh Preview</span>
          </button>
        </div>
      )}
    </div>
  );
};
