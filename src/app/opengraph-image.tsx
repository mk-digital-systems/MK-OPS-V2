import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { APP_NAME } from "@/lib/constants/brand";

export const alt = `${APP_NAME} — Şantiye ve Saha Yönetim Programı`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const [bold, regular, logo] = await Promise.all([
    readFile(join(process.cwd(), "public/fonts/Roboto-Bold.ttf")),
    readFile(join(process.cwd(), "public/fonts/Roboto-Regular.ttf")),
    readFile(join(process.cwd(), "public/images/logo-mk-ops.png")),
  ]);
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 64,
          padding: "0 80px",
          background: "linear-gradient(135deg, #ffffff 0%, #e0f2fe 100%)",
          fontFamily: "Roboto",
          color: "#0f172a",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} width={300} height={300} alt="" />
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 88, fontWeight: 700, color: "#1d4ed8" }}>{APP_NAME}</div>
          <div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.15 }}>Şantiye ve Saha Yönetim Programı</div>
          <div style={{ fontSize: 30, color: "#334155" }}>Hakediş · İş Planı · Puantaj · Stok · Araç</div>
          <div style={{ marginTop: 16, fontSize: 28, color: "#0369a1" }}>48 saat ücretsiz deneyin · www.mk-ops.tr</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Roboto", data: bold, weight: 700, style: "normal" },
        { name: "Roboto", data: regular, weight: 400, style: "normal" },
      ],
    },
  );
}
