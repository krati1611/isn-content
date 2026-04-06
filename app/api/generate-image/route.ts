import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imagePrompt, referenceImage } = body;

    const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

    const replicateInputs: any = {
      prompt: imagePrompt.replace(/\\n/g, ' ').replace(/\\"/g, ''),
      resolution: "2K",
      aspect_ratio: "4:5",
      output_format: "png"
    };

    if (referenceImage) {
      replicateInputs.image_input = [referenceImage];
    } else {
      replicateInputs.image_input = [];
    }

    let repRes = await fetch("https://api.replicate.com/v1/models/google/nano-banana-pro/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
        "Prefer": "wait"
      },
      body: JSON.stringify({ input: replicateInputs })
    });

    if (!repRes.ok) throw new Error("Replicate API Error: " + await repRes.text());
    
    let repData = await repRes.json();
    
    // Polling structure in case 'Prefer: wait' times out or generation takes extremely long
    while (repData.status === "starting" || repData.status === "processing") {
      await new Promise(resolve => setTimeout(resolve, 3000));
      repRes = await fetch(repData.urls.get, {
        headers: {
          "Authorization": `Bearer ${REPLICATE_API_TOKEN}`
        }
      });
      if (!repRes.ok) throw new Error("Replicate Poll Error: " + await repRes.text());
      repData = await repRes.json();
    }

    if (repData.status === "failed") {
      throw new Error("Replicate Generation Failed: " + (repData.error || "Unknown"));
    }

    const imageUrl = Array.isArray(repData.output) ? repData.output[0] : repData.output;

    if (!imageUrl) throw new Error("Image missing but generation allegedly finished. Final state: " + repData.status);

    return NextResponse.json({ imageUrl });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
