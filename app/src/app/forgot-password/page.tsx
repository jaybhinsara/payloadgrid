import type { Metadata } from "next";
import { Suspense } from "react";
import { PasswordRecovery } from "@/components/password-recovery";
export const metadata: Metadata = { title: "Forgot password", robots: { index: false, follow: false } };
export default function ForgotPasswordPage() { return <Suspense><PasswordRecovery mode="forgot" /></Suspense>; }