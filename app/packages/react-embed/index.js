import React from "react";

export function PayloadGridPortal({ url, title = "Webhook delivery history", className, style, onLoad }) {
  if (!url) throw new Error("PayloadGridPortal requires a signed embed url");
  return React.createElement("iframe", {
    src: url, title, className, onLoad,
    referrerPolicy: "no-referrer",
    sandbox: "allow-scripts allow-same-origin",
    style: { width: "100%", minHeight: 560, border: 0, ...style }
  });
}
