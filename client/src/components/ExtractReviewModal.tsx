import { Check, Edit3, ShieldCheck, X } from "lucide-react";
import type { Profile } from "@/pages/Home";

const reviewFields: Array<{ key: keyof Profile; label: string; type?: string }> = [
  { key: "name", label: "Name on ID" },
  { key: "company", label: "Company name" },
  { key: "project", label: "Project name" },
  { key: "role", label: "Role / position" },
  { key: "issueDate", label: "Issue date", type: "date" },
  { key: "telephone", label: "Telephone number" },
  { key: "whatsapp", label: "WhatsApp no." },
  { key: "email", label: "Email address", type: "email" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "facebook", label: "Facebook" },
  { key: "handle", label: "1id4.me handle" },
  { key: "bio", label: "Link-in-bio intro" },
];

export default function ExtractReviewModal({ fields, onChange, onApprove, onDiscard }: {
  fields: Partial<Profile>;
  onChange: (key: keyof Profile, value: string) => void;
  onApprove: () => void;
  onDiscard: () => void;
}) {
  const visibleFields = reviewFields.filter(({ key }) => fields[key]);
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="scan-review-title"><div className="scan-review-modal"><div className="modal-heading"><div><div className="eyebrow"><Edit3 size={13} /> Review / approve</div><h3 id="scan-review-title">Check the extracted details.</h3></div><button className="icon-btn" onClick={onDiscard} aria-label="Close scan review"><X size={18} /></button></div><div className="scan-review-intro"><ShieldCheck size={17} /><span>AI suggestions are editable. Review every value before applying them to your ID.</span></div>{visibleFields.length ? <div className="scan-review-grid">{visibleFields.map(({ key, label, type }) => <label className="scan-review-field" key={key}><span>{label}</span><input type={type || "text"} value={fields[key] || ""} onChange={(event) => onChange(key, event.target.value)} /></label>)}</div> : <div className="scan-empty">No readable profile fields were found in this scan. Try a brighter, sharper image.</div>}<div className="scan-review-privacy"><ShieldCheck size={14} /><span>Only approved fields will be added. Sensitive ID numbers and payment details are never imported.</span></div><div className="modal-actions scan-review-actions"><button className="text-btn" onClick={onDiscard}>Discard results</button><button className="coral-btn" onClick={onApprove} disabled={!visibleFields.length}><Check size={15} /> Apply to my ID</button></div></div></div>;
}
