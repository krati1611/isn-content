import { NextResponse } from 'next/server';

/**
 * Uploads a base64 data URI to the Replicate Files API and returns a public URL.
 * Replicate's model inputs only accept HTTP URLs, not raw base64 strings.
 */
async function uploadBase64ToReplicate(dataUri: string, token: string): Promise<string> {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid base64 data URI for reference image.");

  const mimeType = match[1];           // e.g. "image/jpeg"
  const base64Data = match[2];
  const buffer = Buffer.from(base64Data, 'base64');
  const blob = new Blob([buffer], { type: mimeType });

  const ext = mimeType.split('/')[1] || 'jpg';
  const formData = new FormData();
  formData.append('content', blob, `reference.${ext}`);

  const uploadRes = await fetch('https://api.replicate.com/v1/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  if (!uploadRes.ok) {
    throw new Error("Failed to upload reference image to Replicate: " + await uploadRes.text());
  }

  const uploadData = await uploadRes.json();
  // Replicate Files API returns { urls: { get: "https://..." } }
  const url = uploadData?.urls?.get;
  if (!url) throw new Error("Replicate file upload returned no URL: " + JSON.stringify(uploadData));
  return url;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imagePrompt, referenceImages, aspectRatio } = body as { imagePrompt: string; referenceImages?: string[], aspectRatio?: string };

    const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN!;

    const replicateInputs: any = {
      prompt: imagePrompt.replace(/\\n/g, ' ').replace(/\\"/g, ''),
      resolution: "2K",
      aspect_ratio: aspectRatio || "4:5",
      output_format: "png"
    };

    // Upload each reference image (base64 data URI → public Replicate URL)
    if (referenceImages && referenceImages.length > 0) {
      const uploadedUrls = await Promise.all(
        referenceImages.map((img) => {
          if (img.startsWith('data:')) {
            return uploadBase64ToReplicate(img, REPLICATE_API_TOKEN);
          }
          return Promise.resolve(img); // already a URL
        })
      );
      replicateInputs.image_input = uploadedUrls;
    } else {
      replicateInputs.image_input = [];
    }

    let repRes = await fetch("https://api.replicate.com/v1/models/google/nano-banana-pro/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ input: replicateInputs })
    });

    if (!repRes.ok) throw new Error("Replicate API Error: " + await repRes.text());

    let repData = await repRes.json();

    // Instead of long-polling here on the server, we return the prediction ID.
    // The client will poll the status. This prevents the browser from dropping
    // the connection when the tab is placed in the background.
    return NextResponse.json({
      status: repData.status,
      predictionId: repData.id
    });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
