import type { CSSProperties, ReactElement } from "react";
export type PayloadGridPortalProps = { url: string; title?: string; className?: string; style?: CSSProperties; onLoad?: () => void };
export function PayloadGridPortal(props: PayloadGridPortalProps): ReactElement;
