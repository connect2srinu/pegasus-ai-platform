import { CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { VALIDATION_TYPES } from "../../constants.js";

const ICONS = {
  pass: <CheckCircle2 size={14} className="vr-icon vr-icon--pass" />,
  warn: <AlertTriangle  size={14} className="vr-icon vr-icon--warn" />,
  fail: <XCircle       size={14} className="vr-icon vr-icon--fail" />,
};

const STATUS_LABEL = { pass: "PASS", warn: "WARN", fail: "FAIL" };

function ResultGroup({ type, results }) {
  const [open, setOpen] = useState(true);
  if (!results.length) return null;

  const failing   = results.filter((r) => r.status === "fail").length;
  const warning   = results.filter((r) => r.status === "warn").length;
  const groupStatus = failing ? "fail" : warning ? "warn" : "pass";

  return (
    <div className="vr-group">
      <button className="vr-group-header" onClick={() => setOpen((v) => !v)}>
        <span className="vr-group-icon">{ICONS[groupStatus]}</span>
        <strong className="vr-group-title">{VALIDATION_TYPES[type] || type}</strong>
        <span className="vr-group-counts">
          {failing > 0 && <span className="vr-badge vr-badge--fail">{failing} blocking</span>}
          {warning > 0 && <span className="vr-badge vr-badge--warn">{warning} warning{warning > 1 ? "s" : ""}</span>}
          {!failing && !warning && <span className="vr-badge vr-badge--pass">all pass</span>}
        </span>
        {open ? <ChevronDown size={13} className="vr-chevron" /> : <ChevronRight size={13} className="vr-chevron" />}
      </button>
      {open && (
        <div className="vr-group-body">
          {results.map((r) => (
            <div key={r.id} className={`vr-item vr-item--${r.status}`}>
              <span className="vr-item-icon">{ICONS[r.status]}</span>
              <div className="vr-item-body">
                <span className={`vr-item-badge vr-item-badge--${r.status}`}>{STATUS_LABEL[r.status]}</span>
                <span className="vr-item-msg">{r.message}</span>
                {r.details && (
                  <pre className="vr-item-details">{JSON.stringify(r.details, null, 2)}</pre>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PackageValidationResults({ validationResults = [], validationStatus }) {
  if (!validationResults.length) {
    return (
      <div className="vr-empty">
        <AlertTriangle size={16} style={{ marginRight: 6 }} />
        Package not yet validated. Click <strong>Validate Package</strong> to run checks.
      </div>
    );
  }

  const types = Object.keys(VALIDATION_TYPES);
  const grouped = types.map((type) => ({
    type,
    results: validationResults.filter((r) => r.validationType === type),
  }));

  const statusCls = validationStatus === "passed" ? "pass"
    : validationStatus === "passed_with_warnings" ? "warn"
    : validationStatus === "failed" ? "fail"
    : "gray";

  return (
    <div className="vr-root">
      <div className={`vr-status-banner vr-status-banner--${statusCls}`}>
        {statusCls === "pass" && <CheckCircle2 size={15} />}
        {statusCls === "warn" && <AlertTriangle size={15} />}
        {statusCls === "fail" && <XCircle size={15} />}
        <span>
          {validationStatus === "passed" && "All checks passed — ready to generate AgentCore spec."}
          {validationStatus === "passed_with_warnings" && "Validation passed with warnings — review before proceeding."}
          {validationStatus === "failed" && "Validation failed — fix blocking issues before submission."}
          {(!validationStatus || validationStatus === "pending") && "Validation pending."}
        </span>
      </div>
      {grouped.map(({ type, results }) => (
        <ResultGroup key={type} type={type} results={results} />
      ))}
    </div>
  );
}
