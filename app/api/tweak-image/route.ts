import { NextResponse } from 'next/server';

/**
 * Uploads a base64 data URI to the Replicate Files API and returns a public URL.
 */
async function uploadBase64ToReplicate(dataUri: string, token: string): Promise<string> {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid base64 data URI for tweak image.');

  const mimeType = match[1];
  const base64Data = match[2];
  const buffer = Buffer.from(base64Data, 'base64');
  const blob = new Blob([buffer], { type: mimeType });

  const ext = mimeType.split('/')[1] || 'jpg';
  const formData = new FormData();
  formData.append('content', blob, `tweak-source.${ext}`);

  const uploadRes = await fetch('https://api.replicate.com/v1/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!uploadRes.ok) {
    throw new Error('Failed to upload tweak image to Replicate: ' + await uploadRes.text());
  }

  const uploadData = await uploadRes.json();
  const url = uploadData?.urls?.get;
  if (!url) throw new Error('Replicate file upload returned no URL: ' + JSON.stringify(uploadData));
  return url;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageDataUri, instruction } = body as { imageDataUri: string; instruction: string };

    if (!imageDataUri) throw new Error('No image provided for tweaking.');
    if (!instruction?.trim()) throw new Error('No edit instruction provided.');

    const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN!;

    // 1 — Upload source image to Replicate so we have a public URL
    const inputImageUrl = await uploadBase64ToReplicate(imageDataUri, REPLICATE_API_TOKEN);

    // 2 — Call FLUX.1 Kontext [pro] — instruction-based image editor
    const repRes = await fetch(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: {
            prompt: instruction.trim(),
            input_image: inputImageUrl,
            output_format: 'png',
          },
        }),
      }
    );

    if (!repRes.ok) throw new Error('Replicate Kontext API Error: ' + await repRes.text());

    const repData = await repRes.json();

    // Return prediction ID — client polls /api/generate-image/[id] as usual
    return NextResponse.json({ status: repData.status, predictionId: repData.id });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
