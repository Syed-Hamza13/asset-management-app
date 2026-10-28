import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Button, Card, Input, Select, Alert } from "./ui";
import { useToast } from "../context/ToastContext";

const conditions = [
  { value: "filled", label: "is filled" },
  { value: "empty", label: "is empty" },
  { value: "changed", label: "is changed" },
  { value: "equals", label: "equals" },
];

export function AutomationBuilder({ assetTypeId, fields, commonForm = false }) {
  const [rules, setRules] = useState([]);
  const [sourceFieldId, setSourceFieldId] = useState("");
  const [conditionType, setConditionType] = useState("filled");
  const [conditionValue, setConditionValue] = useState("");
  const [targetFieldId, setTargetFieldId] = useState("");
  const [actionType, setActionType] = useState("set_value");
  const [actionValue, setActionValue] = useState("");
  const [dropdownOptions, setDropdownOptions] = useState({});
  const [error, setError] = useState("");
  const { showToast } = useToast();

  async function load() {
    try {
      setRules(
        (
          await (commonForm
            ? api.commonForm.automations.list()
            : api.automations.list(assetTypeId))
        ).data,
      );
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, [assetTypeId, commonForm]);
  useEffect(() => {
    (async () => {
      const dropdownIds = [...new Set(fields.filter((field) => field.type === "dropdown").map((field) => field.dropdownId ?? field.dropdown_id).filter(Boolean))];
      const entries = await Promise.all(dropdownIds.map(async (id) => [id, (await api.dropdowns.get(id)).data.options.filter((option) => option.is_active)]));
      setDropdownOptions(Object.fromEntries(entries));
    })();
  }, [fields]);

  async function add(e) {
    e.preventDefault();
    setError("");
    try {
      const automationApi = commonForm
        ? api.commonForm.automations
        : api.automations;
      const automationArgs = commonForm
        ? [
            {
              sourceFieldId: Number(sourceFieldId),
              conditionType,
              ...(conditionType === "equals" ? { conditionValue } : {}),
              targetFieldId: Number(targetFieldId),
              actionType,
              ...(actionType === "set_value" ? { actionValue } : {}),
            },
          ]
        : [
            assetTypeId,
            {
              sourceFieldId: Number(sourceFieldId),
              conditionType,
              ...(conditionType === "equals" ? { conditionValue } : {}),
              targetFieldId: Number(targetFieldId),
              actionType,
              ...(actionType === "set_value" ? { actionValue } : {}),
            },
          ];
      await automationApi.create(...automationArgs);
      showToast("Automation rule added successfully.");
      setSourceFieldId("");
      setConditionType("filled");
      setConditionValue("");
      setTargetFieldId("");
      setActionType("set_value");
      setActionValue("");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(id) {
    if (!confirm("Delete this automation?")) return;
    try {
      await (commonForm
        ? api.commonForm.automations.remove(id)
        : api.automations.remove(id));
      showToast("Automation rule deleted successfully.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  const sourceOptions = fields.map((f) => ({ value: f.id, label: f.name }));
  const targetOptions = fields.map((f) => ({ value: f.id, label: f.name }));
  const target = fields.find((f) => Number(f.id) === Number(targetFieldId));
  const source = fields.find((f) => Number(f.id) === Number(sourceFieldId));
  const optionsFor = (field) => dropdownOptions[field?.dropdownId ?? field?.dropdown_id] || field?.options || [];
  const labelFor = (dropdownId, value) => dropdownOptions[dropdownId]?.find((option) => String(option.value) === String(value))?.label ?? value;

  return (
    <section className="mt-6">
      <div className="mb-3">
        <h3 className="font-semibold">Automations</h3>
        <p className="text-sm text-slate-500">
          Automatically set one field when another field meets a condition.
        </p>
      </div>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <Card className="p-5">
        <form
          onSubmit={add}
          className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end"
        >
          <Select
            label="When field"
            value={sourceFieldId}
            onChange={(e) => setSourceFieldId(e.target.value)}
            options={sourceOptions}
            required
          />
          <div>
            <Select
              label="Condition"
              value={conditionType}
              onChange={(e) => setConditionType(e.target.value)}
              options={conditions}
            />
            {conditionType === "equals" && (
              <div className="mt-2">
                {source?.type === "dropdown" ? (
                  <Select label="Value" value={conditionValue} onChange={(e) => setConditionValue(e.target.value)} options={optionsFor(source).map((option) => ({ value: option.value, label: option.label }))} required />
                ) : <Input label="Value" value={conditionValue} onChange={(e) => setConditionValue(e.target.value)} required />}
              </div>
            )}
          </div>
          <Select
            label="Set field"
            value={targetFieldId}
            onChange={(e) => {
              setTargetFieldId(e.target.value);
              const f = fields.find(
                (x) => Number(x.id) === Number(e.target.value),
              );
              setActionType(
                f?.type === "date" || f?.type === "auto_date"
                  ? "set_today"
                  : "set_value",
              );
            }}
            options={targetOptions}
            required
          />
          <div>
            <Select
              label="Action"
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              options={[
                { value: "set_value", label: "Set a value" },
                { value: "set_today", label: "Set today (Date)" },
                { value: "clear", label: "Clear (leave blank)" },
              ]}
            />
            {actionType === "set_value" && (
              <div className="mt-2">
                {target?.type === "dropdown" ? (
                  <Select label="Value" value={actionValue} onChange={(e) => setActionValue(e.target.value)} options={optionsFor(target).map((option) => ({ value: option.value, label: option.label }))} required />
                ) : <Input label={target?.type === "date" || target?.type === "auto_date" ? "Date" : "Value"} type={target?.type === "date" || target?.type === "auto_date" ? "date" : target?.type === "number" ? "number" : "text"} value={actionValue} onChange={(e) => setActionValue(e.target.value)} required />}
              </div>
            )}
          </div>
          <Button>Add Rule</Button>
        </form>
      </Card>
      {rules.length > 0 && (
        <Card className="mt-3 divide-y divide-slate-100 overflow-hidden">
          {rules.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm"
            >
              <span className="font-medium">When {r.source_field_name}</span>
              <span className="text-slate-500">
                {conditions.find((c) => c.value === r.condition_type)?.label}
                {r.condition_type === "equals" ? ` “${labelFor(r.source_dropdown_id, r.condition_value)}”` : ""}
              </span>
              <span className="text-slate-400">→</span>
              <span className="font-medium">set {r.target_field_name}</span>
              <span className="text-slate-500">
                {r.action_type === "clear"
                  ? "to blank"
                  : r.action_type === "set_today"
                    ? "to Today"
                    : `to “${labelFor(r.target_dropdown_id, r.action_value)}”`}
              </span>
              <Button
                variant="ghost"
                className="ml-auto"
                onClick={() => remove(r.id)}
              >
                Delete
              </Button>
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}
