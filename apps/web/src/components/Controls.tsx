'use client';

/** Labelled slider; the track fills with lime up to the thumb. */
export function Range({
  label,
  display,
  min,
  max,
  step = 1,
  value,
  onChange,
  disabled,
}: {
  label: string;
  display: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label className="range">
      <span>
        {label} <b>{display}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--p': `${fill}%` } as React.CSSProperties}
      />
    </label>
  );
}

/** Pill switch with a label, the web version of the app's SwitchRow. */
export function Toggle({
  checked,
  onChange,
  label,
  dark = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  dark?: boolean;
}) {
  return (
    <label className={`tog${dark ? ' tog-dark' : ''}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <i />
      {label}
    </label>
  );
}
