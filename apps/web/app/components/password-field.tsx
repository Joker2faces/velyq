"use client";

import { useId, useState } from "react";

/**
 * Password input with a show/hide control.
 *
 * The only piece of client state on the auth screens. The toggle is a real
 * button with an accessible name that flips with the state, so a screen
 * reader user is told what pressing it will do.
 */
export function PasswordField({
  name = "password",
  label,
  hint,
  showLabel,
  hideLabel,
  autoComplete,
  minLength,
  describedBy,
  invalid = false,
}: {
  name?: string;
  label: string;
  hint?: string;
  showLabel: string;
  hideLabel: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  describedBy?: string;
  invalid?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const hintId = useId();
  const described = [describedBy, hint ? hintId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="field field--password">
      <label className="field__label" htmlFor={name}>
        {label}
      </label>
      <div className="field__control">
        <input
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          {...(minLength ? { minLength } : {})}
          {...(described ? { "aria-describedby": described } : {})}
          {...(invalid ? { "aria-invalid": true as const } : {})}
        />
        <button
          className="field__reveal"
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-pressed={visible}
        >
          {visible ? hideLabel : showLabel}
        </button>
      </div>
      {hint ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
