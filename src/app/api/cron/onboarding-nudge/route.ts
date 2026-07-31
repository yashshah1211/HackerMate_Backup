import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { message: "Onboarding nudge cron job has been permanently disabled." },
    { status: 410 }
  );
}

export async function POST() {
  return NextResponse.json(
    { message: "Onboarding nudge cron job has been permanently disabled." },
    { status: 410 }
  );
}
