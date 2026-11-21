import React, { useState } from "react";
import { Plus, Check, X, Pencil } from "lucide-react";

interface DynamicFieldDropdownProps {
  label: string;
  value: string;
  fieldKey: string;
  options: string[];
  onChange: (value: string) => void;
  onAddNewOption?: (newOption: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  allowCustomInput?: boolean;
}

export const DynamicFieldDropdown: React.FC<DynamicFieldDropdownProps> = ({
  label,
  value,
  fieldKey,
  options = [],
  onChange,
  onAddNewOption,
  placeholder = "انتخاب یا وارد کردن مورد جدید...",
  required = false,
  className = "",
  allowCustomInput = true,
}) => {
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [isEditingValue, setIsEditingValue] = useState(false);
  const [newOptionText, setNewOptionText] = useState("");

  // Ensure current value is included in list if not empty
  const allOptions = Array.from(new Set([...options, ...(value ? [value] : [])]));

  const handleSaveNew = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newOptionText.trim();
    if (!trimmed) return;

    onChange(trimmed);
    if (onAddNewOption) {
      onAddNewOption(trimmed);
    }
    setNewOptionText("");
    setIsAddingNew(false);
    setIsEditingValue(false);
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex w-36 shrink-0 items-center justify-between gap-1">
        <label className="leading-4 text-slate-600 font-semibold text-xs">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
        {!isAddingNew ? (
          <div className="flex items-center gap-1">
            {value && <button type="button" onClick={() => { setNewOptionText(value); setIsEditingValue(true); setIsAddingNew(true); }} className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900" title="ویرایش مقدار انتخاب‌شده"><Pencil size={12} /></button>}
            <button
              type="button"
              onClick={() => { setIsEditingValue(false); setIsAddingNew(true); }}
              className="rounded p-1 text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-800"
              title="افزودن گزینه جدید به دیتابیس"
            >
              <Plus size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setIsAddingNew(false);
              setIsEditingValue(false);
              setNewOptionText("");
            }}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={11} />
          </button>
        )}
      </div>

      {isAddingNew ? (
        <form onSubmit={handleSaveNew} className="flex min-w-0 flex-1 items-center gap-1">
          <input
            type="text"
            autoFocus
            required
            placeholder={isEditingValue ? "مقدار را ویرایش کنید..." : "عنوان گزینه جدید را بنویسید..."}
            value={newOptionText}
            onChange={(e) => setNewOptionText(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-blue-300 bg-blue-50 p-2 text-xs font-medium text-slate-900 focus:outline-hidden focus:border-blue-500"
          />
          <button
            type="submit"
            className="shrink-0 rounded-md bg-blue-600 px-2.5 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700"
          >
            <Check size={13} />
          </button>
        </form>
      ) : (
        <div className="relative min-w-0 flex-1">
          <select
            value={value || ""}
            onChange={(e) => {
              if (e.target.value === "__ADD_NEW__") {
                setIsAddingNew(true);
              } else {
                onChange(e.target.value);
              }
            }}
            className="w-full rounded-md border border-indigo-200 bg-indigo-50 px-2 py-2 text-xs font-medium text-slate-800 transition-colors focus:border-indigo-500 focus:bg-white focus:outline-hidden"
          >
            {placeholder && <option value="">{placeholder}</option>}
            {allOptions.map((opt, idx) => (
              <option key={idx} value={opt}>
                {opt}
              </option>
            ))}
            <option value="__ADD_NEW__">＋</option>
          </select>
        </div>
      )}
    </div>
  );
};
