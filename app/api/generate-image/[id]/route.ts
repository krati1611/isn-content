import { NextResponse } from 'next/server';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN!;
    
    // Using predictionId from params.id to poll Replicate for status
    const repRes = await fetch(`https://api.replicate.com/v1/predictions/${params.id}`, {
      headers: { "Authorization": `Bearer ${REPLICATE_API_TOKEN}` }
    });
    
    if (!repRes.ok) throw new Error("Replicate Poll Error: " + await repRes.text());
    
    const repData = await repRes.json();
    
    if (repData.status === "failed") {
      return NextResponse.json({ error: repData.error || "Generation Failed" }, { status: 500 });
    }
    
    if (repData.status === "succeeded") {
      const imageUrl = Array.isArray(repData.output) ? repData.output[0] : repData.output;
      return NextResponse.json({ status: "succeeded", imageUrl });
    }
    
    return NextResponse.json({ status: repData.status });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
