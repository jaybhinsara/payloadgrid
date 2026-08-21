import type { Metadata } from "next";
import { Suspense } from "react";
import { VerificationRecovery } from "@/components/verification-recovery";

export const metadata: Metadata = { title: "Verify email", robots: { index: false, follow: false } };
export default function VerifyEmailPage() { return <Suspense><VerificationRecovery /></Suspense>; }
