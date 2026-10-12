/** Small form building blocks shared by the teacher forms. */
import type { ReactNode } from "react";

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {hint && <p className="field-hint">{hint}</p>}
      {children}
    </div>
  );
}

/** A row of large buttons where exactly one is selected. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} className={value === o ? "selected" : ""} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

export function NumberInput({ id, value, onChange, min, max }: { id: string; value: number; onChange: (n: number) => void; min: number; max: number }) {
  return (
    <input
      id={id}
      type="number"
      className="input input-number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, Math.round(n))));
      }}
    />
  );
}

/** Clickable example chips that fill a text field (teacher-initiated only). */
export function Examples({ examples, onPick }: { examples: string[]; onPick: (v: string) => void }) {
  return (
    <div className="chips">
      <span className="chips-label">Examples:</span>
      {examples.map((e) => (
        <button key={e} type="button" className="chip" onClick={() => onPick(e)}>
          {e}
        </button>
      ))}
    </div>
  );
}
