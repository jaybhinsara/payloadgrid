import type { Metadata } from "next";
import { Suspense } from "react";
import { EmailVerificationConfirm } from "@/components/email-verification-confirm";

export const metadata: Metadata = { title: "Confirm email", robots: { index: false, follow: false } };
export default function VerifyEmailConfirmPage() { return <Suspense><EmailVerificationConfirm /></Suspense>; }
