import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#d1491c",
        }}
      >
        <div
          style={{
            width: 112,
            height: 112,
            borderRadius: 56,
            background: "#fffdf9",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: 66, height: 66, borderRadius: 33, background: "#f7d9c9" }} />
        </div>
      </div>
    ),
    size,
  );
}
