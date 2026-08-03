import { useId } from "react";

/**
 * Combobox: pick a suggested value or type a new one, saved as free text.
 * Native <input list> + <datalist> — no extra dependency, keyboard accessible.
 */
export function EditableSelect({
  value,
  onChange,
  options,
  style,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  style?: React.CSSProperties;
  placeholder?: string;
}) {
  const listId = useId();
  return (
    <>
      <input
        list={listId}
        style={style}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}
