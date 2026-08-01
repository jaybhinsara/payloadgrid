import type { Metadata } from "next";
import { Suspense } from "react";
import { PasswordRecovery } from "@/components/password-recovery";
export const metadata: Metadata = { title: "Reset password", robots: { index: false, follow: false } };
export default function ResetPasswordPage() { return <Suspense><PasswordRecovery mode="reset" /></Suspense>; }