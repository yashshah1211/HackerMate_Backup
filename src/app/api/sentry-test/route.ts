import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function GET() {
  try {
    throw new Error("HackerMate Sentry Verification Smoke Test");
  } catch (error) {
    const eventId = Sentry.captureException(error);
    await Sentry.flush(2000);
    return NextResponse.json({
      success: true,
      message: "Sentry smoke test exception captured and flushed successfully.",
      sentryEventId: eventId,
      timestamp: new Date().toISOString(),
    });
  }
}
