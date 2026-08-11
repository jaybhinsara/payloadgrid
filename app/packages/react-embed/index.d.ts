import type { CSSProperties, ReactElement } from "react";
export type PayloadGridPortalProps = { url: string; title?: string; className?: string; style?: CSSProperties; onLoad?: () => void; view?: "deliveries" | "endpoints" };
export function PayloadGridPortal(props: PayloadGridPortalProps): ReactElement;
export function PayloadGridDeliveryHistory(props: PayloadGridPortalProps): ReactElement;
export function PayloadGridEndpointManager(props: PayloadGridPortalProps): ReactElement;
