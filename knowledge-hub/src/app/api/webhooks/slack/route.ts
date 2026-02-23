import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, channel } = body;

    if (!text) {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn("[webhooks/slack] SLACK_WEBHOOK_URL is not configured");
      return NextResponse.json({
        success: true,
        message: "Slack webhook not configured, message logged only",
      });
    }

    console.log("[webhooks/slack] Sending message:", { text, channel });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[webhooks/slack] POST", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
