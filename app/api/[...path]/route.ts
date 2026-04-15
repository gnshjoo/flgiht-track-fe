import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = "https://shjoo.synology.me:7881";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const url = new URL(request.url);
  const target = `${BACKEND_URL}/api/${path.join("/")}${url.search}`;

  try {
    const res = await fetch(target, {
      headers: {
        "User-Agent": "flight-track-fe/1.0",
      },
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Backend unavailable" },
      { status: 502 }
    );
  }
}
