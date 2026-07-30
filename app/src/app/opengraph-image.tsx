import { ImageResponse } from "next/og";

export const alt = "PayloadGrid - reliable webhook infrastructure";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const logoDataUri = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJQYXlsb2FkR3JpZCI+CiAgPHJlY3QgeD0iMSIgeT0iMSIgd2lkdGg9IjYyIiBoZWlnaHQ9IjYyIiByeD0iMTQiIGZpbGw9IiMxNzE5MWUiIHN0cm9rZT0iI2RjZTBkYSIgc3Ryb2tlLXdpZHRoPSIyIi8+CiAgPHBhdGggZD0iTTE4IDE3djMwTTMyIDE3djMwTTQ2IDE3djMwTTE3IDE4aDMwTTE3IDMyaDMwTTE3IDQ2aDMwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2OTcwNmYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgPHBhdGggZD0iTTE4IDQ2IDMyIDMyIDQ2IDE4IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+CiAgPGNpcmNsZSBjeD0iMTgiIGN5PSI0NiIgcj0iNCIgZmlsbD0iI2ZmZmZmZiIvPgogIDxyZWN0IHg9IjI3IiB5PSIyNyIgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiByeD0iMyIgZmlsbD0iI2VmNWI0NiIvPgogIDxjaXJjbGUgY3g9IjQ2IiBjeT0iMTgiIHI9IjQiIGZpbGw9IiNmZmZmZmYiLz4KPC9zdmc+";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#fbfcfa", color: "#17191e", padding: "64px 72px", fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 34, fontWeight: 800 }}>
        <img src={logoDataUri} width={58} height={58} alt="" />
        <span>PayloadGrid</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 980 }}>
        <span style={{ color: "#cc3e2d", fontSize: 22, fontWeight: 800, textTransform: "uppercase" }}>Webhook infrastructure</span>
        <div style={{ display: "flex", marginTop: 22, fontSize: 70, lineHeight: 1.02, fontWeight: 800 }}>Reliable delivery without building the infrastructure.</div>
        <div style={{ display: "flex", marginTop: 28, color: "#596168", fontSize: 27 }}>Send, receive, sign, retry, replay, and monitor every webhook.</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px solid #dce0da", paddingTop: 24, color: "#687078", fontSize: 20 }}>
        <span>Inbound + outbound</span><span>Secure by default</span><span>Built for SaaS teams</span>
      </div>
    </div>,
    size
  );
}
