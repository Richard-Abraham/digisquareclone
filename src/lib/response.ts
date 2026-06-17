import { NextResponse } from "next/server";

export function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}
export function err(msg: string, status = 400) {
  return NextResponse.json({ success: false, error: msg }, { status });
}
