import React from "react";

export function PayloadGridPortal({ url, title = "Webhook customer portal", className, style, onLoad, view }) {
  if (!url) throw new Error("PayloadGridPortal requires a signed embed url");
  const source = new URL(url);
  if (view) source.searchParams.set("view", view);
  return React.createElement("iframe", {
    src: source.toString(), title, className, onLoad,
    referrerPolicy: "no-referrer",
    sandbox: "allow-scripts allow-same-origin",
    style: { width: "100%", minHeight: 560, border: 0, ...style }
  });
}
export const PayloadGridDeliveryHistory = (props) => React.createElement(PayloadGridPortal, { ...props, view: "deliveries", title: props.title || "Webhook delivery history" });
export const PayloadGridEndpointManager = (props) => React.createElement(PayloadGridPortal, { ...props, view: "endpoints", title: props.title || "Webhook endpoint management" });
