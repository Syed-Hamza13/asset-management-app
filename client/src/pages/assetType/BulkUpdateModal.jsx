import { useState } from "react";
import { Button, DateInput, Input, Modal, Select } from "../../components/ui";
import { indianDateToIso } from "../../utils/date";

// Bulk "set one field to one value" for the selected rows. The value is coerced
// the way the field type needs before it goes to the API; a date that is not a
// real DD/MM/YYYY is refused here rather than by the server.
export function BulkUpdateModal({ open, count, fields, onClose, onSubmit, onSuccess, onError }) {
  const [fieldKey, setFieldKey] = useState("");
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const field = fields.find((item) => item.field_key === fieldKey);
  const options = field?.options?.filter((option) => option.is_active) || [];

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const isDateField = field?.type === "date" || field?.type === "auto_date";
      const nextValue = isDateField
        ? /^\d{4}-\d{2}-\d{2}$/.test(value)
          ? value
          : indianDateToIso(value)
        : field?.type === "number"
          ? Number(value)
          : field?.type === "boolean"
            ? value === "true"
            : value;
      if (isDateField && !nextValue) {
        onError(`${field.name} must be a valid date.`);
        return;
      }
      await onSubmit(fieldKey, nextValue);
      await onSuccess();
    } catch (e) {
      onError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} title={`Update ${count} selected asset${count === 1 ? "" : "s"}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Select
          label="Field"
          value={fieldKey}
          onChange={(event) => {
            setFieldKey(event.target.value);
            setValue("");
          }}
          options={fields.filter((item) => item.type !== "quantity").map((item) => ({ value: item.field_key, label: item.name }))}
          required
        />
        {field?.type === "dropdown" ? (
          <Select label="Value" value={value} onChange={(event) => setValue(event.target.value)} options={options.map((option) => ({ value: option.value, label: option.label }))} required />
        ) : field?.type === "boolean" ? (
          <Select label="Value" value={value} onChange={(event) => setValue(event.target.value)} options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]} required />
        ) : (
          field?.type === "date" || field?.type === "auto_date" ? (
            <DateInput label="Value" value={value} onChange={(event) => setValue(event.target.value)} required />
          ) : (
            <Input label="Value" type={field?.type === "number" ? "number" : "text"} value={value} onChange={(event) => setValue(event.target.value)} required />
          )
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={loading} disabled={!fieldKey}>Update assets</Button>
        </div>
      </form>
    </Modal>
  );
}
