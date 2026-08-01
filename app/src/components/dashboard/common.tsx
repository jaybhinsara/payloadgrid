import type { ReactNode } from "react";
import { CircleCheck, CircleX, RefreshCw } from "lucide-react";
import type { EmptyProps } from "@/components/dashboard/types";

export function timeAgo(value: string | null) { if (!value) return "Never"; const mins = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60000)); if (mins < 60) return `${mins}m ago`; if (mins < 1440) return `${Math.floor(mins / 60)}h ago`; return `${Math.floor(mins / 1440)}d ago`; }
export function money(value: number | string, currency: string) { try { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0)); } catch { return `${currency} ${Number(value || 0).toLocaleString()}`; } }
export function StatusIcon({ status }: { status: string }) { return status === "delivered" ? <CircleCheck size={15} /> : status === "failed" ? <CircleX size={15} /> : <RefreshCw size={14} />; }
export function Status({ value }: { value: string }) { return <i className={`status-pill ${value}`}><StatusIcon status={value} />{value}</i>; }
export function Empty({ icon, title, copy }: EmptyProps) { return <div className="empty-state"><span>{icon}</span><strong>{title}</strong><p>{copy}</p></div>; }
export function SectionHead({ eyebrow, heading, copy, action }: { eyebrow: string; heading: string; copy?: string; action?: ReactNode }) { return <div className="content-head"><div><span className="section-label">{eyebrow}</span><h2>{heading}</h2>{copy ? <p>{copy}</p> : null}</div>{action}</div>; }