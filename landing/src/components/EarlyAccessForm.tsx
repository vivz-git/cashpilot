"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  companyTypes,
  overdueRanges,
  submitEarlyAccess,
  validate,
  type EarlyAccessRequest,
  type FieldErrors,
  type SubmitResult,
} from "@/lib/early-access";

type Status =
  | { state: "idle" }
  | { state: "submitting" }
  | { state: "done"; result: SubmitResult; name: string }
  | { state: "error" };

const fieldOrder: (keyof EarlyAccessRequest)[] = [
  "name",
  "email",
  "company",
  "companyType",
  "overdue",
  "message",
];

function read(form: HTMLFormElement): EarlyAccessRequest {
  const fd = new FormData(form);
  const get = (key: string) => String(fd.get(key) ?? "");
  return {
    name: get("name"),
    email: get("email"),
    company: get("company"),
    companyType: get("companyType"),
    overdue: get("overdue"),
    message: get("message"),
  };
}

export function EarlyAccessForm() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const successRef = useRef<HTMLDivElement>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    // Honeypot: real visitors never see or fill this field.
    if (new FormData(form).get("website")) {
      setStatus({ state: "done", result: { delivery: "remote" }, name: "" });
      return;
    }

    const data = read(form);
    const nextErrors = validate(data);
    setErrors(nextErrors);

    const firstInvalid = fieldOrder.find((key) => nextErrors[key]);
    if (firstInvalid) {
      const el = form.elements.namedItem(firstInvalid);
      if (el instanceof HTMLElement) el.focus();
      return;
    }

    setStatus({ state: "submitting" });
    try {
      const result = await submitEarlyAccess(data);
      setStatus({ state: "done", result, name: data.name.trim().split(" ")[0] });
      requestAnimationFrame(() => successRef.current?.focus());
    } catch {
      setStatus({ state: "error" });
    }
  }

  function clearError(key: keyof EarlyAccessRequest) {
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  if (status.state === "done") {
    return (
      <div className="form-success" ref={successRef} tabIndex={-1} role="status">
        <h3>{status.name ? `Thanks, ${status.name}.` : "Thanks."}</h3>
        {status.result.delivery === "remote" ? (
          <p>
            Your request has been received. We&rsquo;ll be in touch by email.
          </p>
        ) : (
          <p className="form-notice">
            <strong>Preview mode:</strong> this request was saved in your browser
            only and has not been sent. Submissions will be delivered once an
            endpoint is connected.
          </p>
        )}
      </div>
    );
  }

  const submitting = status.state === "submitting";
  const fieldProps = (key: keyof EarlyAccessRequest) => ({
    id: key,
    name: key,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `${key}-error` : undefined,
    onChange: () => clearError(key),
  });
  const errorFor = (key: keyof EarlyAccessRequest) =>
    errors[key] ? (
      <p className="field-error" id={`${key}-error`}>
        {errors[key]}
      </p>
    ) : null;

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <div className="form-row">
        <div className="field">
          <label htmlFor="name">Name</label>
          <input type="text" autoComplete="name" {...fieldProps("name")} />
          {errorFor("name")}
        </div>
        <div className="field">
          <label htmlFor="email">Work email</label>
          <input
            type="email"
            autoComplete="email"
            inputMode="email"
            {...fieldProps("email")}
          />
          {errorFor("email")}
        </div>
      </div>

      <div className="field">
        <label htmlFor="company">Company</label>
        <input type="text" autoComplete="organization" {...fieldProps("company")} />
        {errorFor("company")}
      </div>

      <div className="form-row">
        <div className="field">
          <label htmlFor="companyType">Company type</label>
          <select defaultValue="" {...fieldProps("companyType")}>
            <option value="" disabled>
              Select…
            </option>
            {companyTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
          {errorFor("companyType")}
        </div>
        <div className="field">
          <label htmlFor="overdue">Approx. amount currently overdue</label>
          <select defaultValue="" {...fieldProps("overdue")}>
            <option value="" disabled>
              Select…
            </option>
            {overdueRanges.map((range) => (
              <option key={range}>{range}</option>
            ))}
          </select>
          {errorFor("overdue")}
        </div>
      </div>

      <div className="field">
        <label htmlFor="message">
          Anything we should know? <span className="optional">Optional</span>
        </label>
        <textarea
          rows={4}
          maxLength={2000}
          placeholder="e.g. how you handle follow-ups today, which tools you invoice from"
          {...fieldProps("message")}
        />
        {errorFor("message")}
      </div>

      <div className="honeypot" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input type="text" id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {status.state === "error" && (
        <p className="form-error" role="alert">
          Something went wrong sending your request. Please try again.
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="button button-primary" disabled={submitting}>
          {submitting ? "Sending…" : "Request Early Access"}
        </button>
        <p className="form-fineprint">
          We&rsquo;ll only use your details to contact you about CashPilot.
        </p>
      </div>
    </form>
  );
}
