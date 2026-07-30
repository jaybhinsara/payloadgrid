import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
export const metadata: Metadata = { title: "Create workspace", robots: { index: false, follow: false } };
export default function SignupPage() { return <Suspense><AuthForm mode="signup" /></Suspense>; }