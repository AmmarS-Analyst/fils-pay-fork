import { useEffect, useId, useRef, useState } from "react";
import { displayDateValue, parseDateValue } from "./date-value.js";
import type { DateInputType } from "./date-value.js";
import "./date-input.css";

interface DateInputProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  type?: DateInputType;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
}

export function DateInput({ label, value, onValueChange, type = "date", required, disabled, min, max }: DateInputProps) {
  const id = useId();
  const textRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(() => displayDateValue(value, type));
  const format = type === "date" ? "DD/MM/YYYY" : "DD/MM/YYYY HH:mm";

  useEffect(() => {
    setDraft(displayDateValue(value, type));
    textRef.current?.setCustomValidity("");
  }, [value, type]);

  function updateText(text: string): void {
    setDraft(text);
    const parsed = parseDateValue(text, type);
    const outsideRange = parsed && ((min && parsed < min) || (max && parsed > max));
    textRef.current?.setCustomValidity(parsed === null ? `Enter a valid date as ${format}.` : outsideRange ? "Date is outside the allowed range." : "");
    if (parsed !== null && !outsideRange) onValueChange(parsed);
  }

  return (
    <div className="fp-date-control">
      <label htmlFor={id}>{label}</label>
      <div className="fp-date-field">
        <input
          ref={textRef} id={id} type="text" className="fp-date-text" value={draft}
          placeholder={format} required={required} disabled={disabled}
          autoComplete="off" spellCheck={false} maxLength={type === "date" ? 10 : 16}
          onChange={(event) => updateText(event.target.value)}
        />
        <span className="fp-date-picker">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" />
          </svg>
          <input
            className="fp-date-native" type={type} value={value} min={min} max={max}
            disabled={disabled} aria-label={`Open calendar for ${label}`}
            onClick={(event) => {
              try { event.currentTarget.showPicker(); event.preventDefault(); } catch { /* The native indicator remains the fallback. */ }
            }}
            onChange={(event) => {
              const next = event.target.value;
              setDraft(displayDateValue(next, type));
              textRef.current?.setCustomValidity("");
              onValueChange(next);
            }}
          />
        </span>
      </div>
    </div>
  );
}
