import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "InclusiveCode — LGBTQIA+ Safety Tools for LLM Engineers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PRIDE = ["#FF6B9D", "#FF9B71", "#FECF6A", "#63E6BE", "#74B9FF", "#A29BFE"];

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#09090b",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* The flag as six discrete stripes (D44; the image renderer ignores hard gradient stops), at top */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "6px",
            display: "flex",
          }}
        >
          {PRIDE.map((c) => (
            <div key={c} style={{ flex: 1, background: c }} />
          ))}
        </div>

        {/* Logo / Brand */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            marginBottom: "24px",
          }}
        >
          <span
            style={{
              fontSize: "72px",
              fontWeight: 700,
              color: "#fafafa",
              letterSpacing: "-2px",
            }}
          >
            Inclusive
          </span>
          <span
            style={{
              fontSize: "72px",
              fontWeight: 700,
              letterSpacing: "-2px",
              color: "#a1a1aa",
            }}
          >
            Code
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: "28px",
            color: "#a1a1aa",
            marginBottom: "40px",
            textAlign: "center",
            maxWidth: "800px",
          }}
        >
          LGBTQIA+ Safety Tools for LLM Engineers
        </div>

        {/* Stats row */}
        <div
          style={{
            display: "flex",
            gap: "48px",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontSize: "40px", fontWeight: 700, color: "#fafafa" }}>200</span>
            <span style={{ fontSize: "16px", color: "#a1a1aa" }}>scenarios</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontSize: "40px", fontWeight: 700, color: "#fafafa" }}>43</span>
            <span style={{ fontSize: "16px", color: "#a1a1aa" }}>anti-patterns</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontSize: "40px", fontWeight: 700, color: "#fafafa" }}>5</span>
            <span style={{ fontSize: "16px", color: "#a1a1aa" }}>domains</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontSize: "40px", fontWeight: 700, color: "#fafafa" }}>15</span>
            <span style={{ fontSize: "16px", color: "#a1a1aa" }}>attack templates</span>
          </div>
        </div>

        {/* and at bottom */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "6px",
            display: "flex",
          }}
        >
          {PRIDE.map((c) => (
            <div key={c} style={{ flex: 1, background: c }} />
          ))}
        </div>

        {/* URL */}
        <div
          style={{
            position: "absolute",
            bottom: "24px",
            fontSize: "18px",
            color: "#52525b",
            fontFamily: "monospace",
          }}
        >
          inclusive-ai.vercel.app
        </div>
      </div>
    ),
    { ...size }
  );
}
