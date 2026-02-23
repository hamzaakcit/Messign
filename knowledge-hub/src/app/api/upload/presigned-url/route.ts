import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileName, fileType, fileSize } = body;

    if (!fileName || !fileType || fileSize == null) {
      return NextResponse.json(
        { error: "fileName, fileType, and fileSize are required" },
        { status: 400 }
      );
    }

    const folderUUID = randomUUID();
    const path = `documents/${folderUUID}/${fileName}`;

    return NextResponse.json({
      url: "/uploads/placeholder",
      path,
    });
  } catch (error) {
    console.error("[api/upload/presigned-url] POST", error);
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}
