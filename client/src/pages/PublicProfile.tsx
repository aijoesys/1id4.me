import { useMemo } from "react";
import { ArrowUpRight, AtSign, Facebook, Globe2, Instagram, Linkedin, Link2, Mail, MessageCircle, Phone, Share2, ShieldCheck } from "lucide-react";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function PublicProfile() {
  const [, params] = useRoute("/:handle");
  const handle = params?.handle || "";
  const input = useMemo(() => ({ handle }), [handle]);
  const profileQuery = trpc.profiles.publicByHandle.useQuery(input, { enabled: Boolean(handle) });
  if (profileQuery.isLoading) return <div className="public-state"><span className="loading-orb" /><p>Opening this identity...</p></div>;
  if (profileQuery.error || !profileQuery.data) return <div className="public-state"><div className="empty-mark">1</div><h1>That link is still waiting.</h1><p>This 1id4.me handle does not have a public profile yet.</p><Link href="/account" className="coral-btn">Claim a handle <ArrowUpRight size={15} /></Link></div>;

  const { profile } = profileQuery.data;
  const name = profile.name || `@${profileQuery.data.handle}`;
  const shareUrl = window.location.href;
  const shareText = `Connect with ${name} on 1id4.me`;
  const shareProfile = async () => {
    try {
      if (navigator.share) await navigator.share({ title: name, text: shareText, url: shareUrl });
      else { await navigator.clipboard?.writeText(shareUrl); toast.success("Profile link copied."); }
    } catch { /* dismissed native share sheet */ }
  };
  const contactLinks = [
    profile.email && { label: "Email", value: profile.email, href: `mailto:${profile.email}`, icon: Mail },
    profile.telephone && { label: "Call", value: profile.telephone, href: `tel:${profile.telephone.replace(/\s/g, "")}`, icon: Phone },
    profile.whatsapp && { label: "WhatsApp", value: profile.whatsapp, href: `https://wa.me/${profile.whatsapp.replace(/\D/g, "")}`, icon: MessageCircle },
    profile.linkedin && { label: "LinkedIn", value: profile.linkedin.replace(/^https?:\/\//, ""), href: profile.linkedin.startsWith("http") ? profile.linkedin : `https://${profile.linkedin}`, icon: Linkedin },
    profile.facebook && { label: "Facebook", value: profile.facebook.replace(/^https?:\/\//, ""), href: profile.facebook.startsWith("http") ? profile.facebook : `https://${profile.facebook}`, icon: Facebook },
  ].filter(Boolean) as { label: string; value: string; href: string; icon: typeof Mail }[];

  return <div className="public-shell"><div className="public-orbit orbit-one" /><div className="public-orbit orbit-two" /><header className="public-header"><Link href="/" className="public-brand"><span>1</span><strong>1id4<span>.me</span></strong></Link><div className="public-header-actions"><span><ShieldCheck size={14} /> Public preview</span><Link href="/account" className="public-edit">Create yours <ArrowUpRight size={14} /></Link></div></header><main className="public-main"><section className="public-identity"><div className="public-photo">{profile.photo ? <img src={profile.photo} alt={name} /> : <div className="public-initials">{name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div>}<span className="verified-badge"><ShieldCheck size={13} /></span></div><span className="public-kicker">{profile.company || "Independent identity"}</span><h1>{name}</h1>{profile.role && <p className="public-role">{profile.role}{profile.project ? <><span> / </span>{profile.project}</> : null}</p>}{profile.bio && <p className="public-bio">{profile.bio}</p>}<div className="public-handle"><AtSign size={13} /> {profileQuery.data.handle}</div><div className="public-actions"><button className="share-button" onClick={shareProfile}><Share2 size={15} /> Share profile</button><Link href="/account" className="public-edit-main">Edit profile <ArrowUpRight size={15} /></Link></div><div className="share-row" aria-label="Share this digital ID"><span>SHARE THIS ID</span><button onClick={shareProfile} aria-label="Use device share"><Share2 size={15} /></button><a href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`} target="_blank" rel="noreferrer" aria-label="Share on WhatsApp"><MessageCircle size={15} /></a><a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noreferrer" aria-label="Share on LinkedIn"><Linkedin size={15} /></a><a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noreferrer" aria-label="Share on Facebook"><Facebook size={15} /></a><button onClick={async () => { await navigator.clipboard?.writeText(shareUrl); toast.success("Profile link copied."); }} aria-label="Copy profile link"><Link2 size={15} /></button></div></section><section className="public-links"><div className="public-section-heading"><span>WAYS TO CONNECT</span><i /></div>{contactLinks.length ? contactLinks.map(({ label, value, href, icon: Icon }) => <a className="public-link-row" href={href} key={label} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined}><span className="public-link-icon"><Icon size={17} /></span><span><small>{label}</small><strong>{value}</strong></span><ArrowUpRight size={15} /></a>) : <div className="public-empty"><Globe2 size={18} /><span>This profile is just getting started.</span></div>}<div className="public-section-heading social-heading"><span>AROUND THE WEB</span><i /></div><div className="public-socials"><a href={profile.linkedin ? `https://${profile.linkedin.replace(/^https?:\/\//, "")}` : "#"} aria-label="LinkedIn"><Linkedin size={17} /></a><a href={profile.facebook ? `https://${profile.facebook.replace(/^https?:\/\//, "")}` : "#"} aria-label="Facebook"><Facebook size={17} /></a><a href={`https://instagram.com/${profile.handle}`} aria-label="Instagram"><Instagram size={17} /></a></div></section></main><footer className="public-footer"><span>Made with intention on <strong>1id4.me</strong></span><Link href="/account">Claim your own link <ArrowUpRight size={13} /></Link></footer></div>;
}
