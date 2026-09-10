import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Check, Eye, Globe2, KeyRound, LockKeyhole, Mail, Phone, Save, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type Profile = Record<string, string>;

const starterProfile: Profile = {
  company: "Northstar Studio", project: "Field Notes / 04", name: "Avery Morgan", role: "Creative Director",
  issueDate: "2026-09-10", telephone: "+91 98765 43210", whatsapp: "+91 98765 43210", email: "avery@northstar.studio",
  linkedin: "linkedin.com/in/averymorgan", facebook: "facebook.com/averymorgan", handle: "averymorgan", photo: "", paymentQr: "",
};

function readLocalProfile() {
  try { return { ...starterProfile, ...JSON.parse(localStorage.getItem("id4me-profile") || "{}") }; }
  catch { return starterProfile; }
}

function FormField({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <label className="account-field"><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

export default function ProfileAccount() {
  const [profile, setProfile] = useState<Profile>(() => readLocalProfile());
  const [identifier, setIdentifier] = useState(() => profile.email || profile.telephone || "");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [onlineHandle, setOnlineHandle] = useState("");
  const sessionQuery = trpc.profiles.session.useQuery();
  const signUp = trpc.profiles.signUp.useMutation();
  const login = trpc.profiles.login.useMutation();
  const update = trpc.profiles.update.useMutation();
  const logout = trpc.profiles.logout.useMutation();

  useEffect(() => {
    const session = sessionQuery.data;
    if (session) {
      setOnlineHandle(session.handle);
      setProfile((current) => ({ ...current, ...session.profile }));
    }
  }, [sessionQuery.data]);

  const isOnline = Boolean(sessionQuery.data || onlineHandle);
  const publicUrl = useMemo(() => `/${profile.handle || onlineHandle || "yourhandle"}`, [profile.handle, onlineHandle]);
  const set = (key: string, value: string) => setProfile((current) => ({ ...current, [key]: value }));

  const submitAuth = async () => {
    try {
      if (mode === "signup") {
        const result = await signUp.mutateAsync({ handle: profile.handle, identifier, password, profile });
        setOnlineHandle(result.handle); setPassword("");
        toast.success("Your 1id4.me profile is live.");
      } else {
        const result = await login.mutateAsync({ identifier, password });
        setOnlineHandle(result.handle); setProfile((current) => ({ ...current, ...result.profile })); setPassword("");
        toast.success("Welcome back. Your profile is unlocked.");
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not complete that request."); }
  };

  const saveProfile = async () => {
    try {
      const result = await update.mutateAsync({ handle: profile.handle, identifier, profile });
      setOnlineHandle(result.handle); localStorage.setItem("id4me-profile", JSON.stringify(profile));
      toast.success("Profile saved online.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Please log in to save edits."); }
  };

  return <div className="account-shell"><header className="account-topbar"><Link href="/" className="account-brand"><span>1</span><strong>1id4<span>.me</span></strong></Link><Link href="/" className="account-back"><ArrowLeft size={15} /> Back to ID builder</Link></header><main className="account-main"><div className="account-hero"><div className="eyebrow coral-text"><span className="eyebrow-line" /> YOUR DIGITAL DOORWAY</div><h1>Keep your world<br /><em>within reach.</em></h1><p>Save your ID details once, claim a memorable link, and let people find the right way to connect.</p></div><div className="account-grid"><section className="account-card profile-editor"><div className="account-card-heading"><div><span className="section-kicker">PROFILE DETAILS</span><h2>Edit your public profile.</h2></div><div className="online-pill"><span className="live-dot" /> {isOnline ? "Online" : "Local draft"}</div></div><div className="account-fields"><FormField label="Your 1id4.me handle" value={profile.handle || ""} onChange={(value) => set("handle", value.replace(/^@/, "").replace(/[^a-zA-Z0-9._-]/g, ""))} placeholder="yourhandle" /><FormField label="Name on ID" value={profile.name || ""} onChange={(value) => set("name", value)} placeholder="Your name" /><FormField label="Role / position" value={profile.role || ""} onChange={(value) => set("role", value)} placeholder="Creative Director" /><FormField label="Company name" value={profile.company || ""} onChange={(value) => set("company", value)} placeholder="Your company" /><FormField label="Email address" value={profile.email || ""} onChange={(value) => { set("email", value); if (!identifier) setIdentifier(value); }} placeholder="you@example.com" type="email" /><FormField label="Telephone number" value={profile.telephone || ""} onChange={(value) => { set("telephone", value); if (!identifier) setIdentifier(value); }} placeholder="+91 ..." type="tel" /><FormField label="LinkedIn" value={profile.linkedin || ""} onChange={(value) => set("linkedin", value)} placeholder="linkedin.com/in/..." /><FormField label="Facebook / social handle" value={profile.facebook || ""} onChange={(value) => set("facebook", value)} placeholder="facebook.com/..." /></div><div className="account-save-row"><span><LockKeyhole size={13} /> Changes are saved to your account, not your browser.</span>{isOnline ? <button className="coral-btn" onClick={saveProfile} disabled={update.isPending}><Save size={15} /> {update.isPending ? "Saving..." : "Save profile"}</button> : <a className="outline-btn" href="#access">Sign in to save <ArrowLeft size={14} style={{ transform: "rotate(180deg)" }} /></a>}</div></section><aside className="account-side"><section className="account-card access-card" id="access"><div className="access-icon"><KeyRound size={18} /></div><span className="section-kicker">{isOnline ? "ACCOUNT ACTIVE" : "PRIVATE ACCESS"}</span><h2>{isOnline ? `@${onlineHandle}` : mode === "signup" ? "Claim your link." : "Welcome back."}</h2><p>{isOnline ? "Your profile is protected and ready to edit." : "Use an email address or phone number plus your own password to manage your public profile."}</p>{!isOnline ? <><div className="auth-switch"><button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Create account</button><button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Log in</button></div>{mode === "signup" && <div className="auth-hint"><Globe2 size={14} /> Your profile will be available at <strong>1id4.me/{profile.handle || "yourhandle"}</strong></div>}<FormField label="Email or telephone number" value={identifier} onChange={setIdentifier} placeholder="you@example.com or +91 ..." /> <FormField label="Password" value={password} onChange={setPassword} placeholder="At least 8 characters" type="password" /><button className="coral-btn account-submit" onClick={submitAuth} disabled={signUp.isPending || login.isPending}><KeyRound size={15} /> {mode === "signup" ? "Create my profile" : "Log in to edit"}</button></> : <><div className="account-link-preview"><div className="link-preview-icon"><Globe2 size={18} /></div><div><span>PUBLIC PROFILE</span><strong>1id4.me/{onlineHandle}</strong></div><a href={publicUrl} target="_blank" rel="noreferrer" aria-label="Open public profile"><Eye size={16} /></a></div><button className="outline-btn full-width" onClick={async () => { await logout.mutateAsync(); setOnlineHandle(""); sessionQuery.refetch(); toast.success("You are logged out."); }}><LockKeyhole size={14} /> Log out</button></>}</section><section className="account-card privacy-card"><ShieldCheck size={18} /><div><strong>Your details stay yours.</strong><span>Your password is securely hashed. Public visitors only see the profile information you choose to share.</span></div></section></aside></div></main></div>;
}
