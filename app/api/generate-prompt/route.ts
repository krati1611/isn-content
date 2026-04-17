import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { client, idea, hook, goal, placement, includeHuman, hasReferenceImages, yoaBgColor } = body;

    // When reference images contain people, override generic person rule with fidelity instruction
    const personRule = hasReferenceImages && includeHuman
      ? "EXACT PERSON REPLICATION: The reference image(s) contain real people. You MUST reproduce those exact individuals — preserve their precise facial features, skin tone, hair, clothing, and expression faithfully. Do NOT replace them with generic or different people."
      : includeHuman
        ? "All people must be Nigerian West African, dark skin, natural features, warm and relatable expressions."
        : "DO NOT include any people, focus entirely on the products and environment.";

    // Build an optional colour-tone hint for YOA backgrounds
    const bgColorHint = (client === "yoa" && yoaBgColor)
      ? ` The dominant colour tone of the background/environment should be ${yoaBgColor} — use this as the key environmental colour, keeping it realistic and not artificially saturated.`
      : "";

    const bgSystem = client === "yoa"
      ? `a realistic, natural environment suited to the idea (e.g. out-of-focus office space, sky, or outdoor setting)${bgColorHint}`
      : "a seamless, pure white or off-white photography studio backdrop";

    const bgUser = client === "yoa"
      ? `a realistic and natural environment based on the prompt idea${bgColorHint}`
      : "a seamless pure white or soft off-white photography studio backdrop";

    const emptyUser = client === "yoa"
      ? "clean, uncluttered negative space within the scene's environment (e.g., clear sky or smoothed blurred wall). NO busy patterns or distracting visual clutter in the empty area."
      : "pure empty space. NO busy backgrounds or hard split lines.";

    let layoutSystem = "";
    let layoutUser = "";
    if (placement === "bottom") {
      layoutSystem = `The subject is positioned in the lower portion of the image. The rest of the background is ${bgSystem} designed to allow text overlay above the subject.`;
      layoutUser = `Layout: Place the main subjects at the BOTTOM of the composition. The background must be ${bgUser}, extending upwards into ${emptyUser}`;
    } else if (placement === "top") {
      layoutSystem = `The subject is positioned in the upper portion of the image. The rest of the background is ${bgSystem} designed to allow text overlay below the subject.`;
      layoutUser = `Layout: Place the main subjects at the TOP of the composition. The background must be ${bgUser}, extending downwards into ${emptyUser}`;
    } else if (placement === "left") {
      layoutSystem = `The subject is positioned on the left side of the image. The rest of the background is ${bgSystem} designed to allow text overlay on the right.`;
      layoutUser = `Layout: Place the main subjects on the LEFT side of the composition. The background must be ${bgUser}, extending rightwards into ${emptyUser}`;
    } else if (placement === "right") {
      layoutSystem = `The subject is positioned on the right side of the image. The rest of the background is ${bgSystem} designed to allow text overlay on the left.`;
      layoutUser = `Layout: Place the main subjects on the RIGHT side of the composition. The background must be ${bgUser}, extending leftwards into ${emptyUser}`;
    } else if (placement === "collage") {
      layoutSystem = `The subject is composed of a playful collage of multiple polaroid-style photos scattered and slightly overlapping in the center. The rest of the background is ${bgSystem}.`;
      layoutUser = `Layout: Create a collage composition. Show multiple printed photos with white borders scattered, rotated slightly, and overlapping each other in the center. The background must be ${bgUser}. Leave clean empty space at the top and bottom.`;
    } else if (placement === "list") {
      layoutSystem = `The subjects are arranged in a vertical list formatting down the left side, resembling a product catalog. The right side is left completely empty with ${bgSystem} to allow for prominent text overlay.`;
      layoutUser = `Layout: Arrange the objects in a clean vertical stack down the LEFT side of the image, like a product catalog. The background must be ${bgUser}. Leave the entire RIGHT side as ${emptyUser}`;
    } else {
      layoutSystem = `The subject is centrally positioned against ${bgSystem}.`;
      layoutUser = `Layout: Central subject placement. The background must be ${bgUser} with generous empty space all around. NO busy backgrounds or distracting elements.`;
    }

    const referenceRule = hasReferenceImages
      ? "CRITICAL — Reference images have been provided. You MUST replicate ONLY what is shown in those reference images: exact people (same face, skin tone, clothing, pose), exact products, exact equipment and props. Do NOT invent, add, substitute, or replace anything — not people, not devices, not props. The generated image must be a faithful scene recreation using only the elements present in the references."
      : "";

    let systemMessage = "";
    let userMessage = "";

    if (client === "yoa") {
      systemMessage = `You are a brand visual strategist for YOA Insurance Brokers, a premium Nigerian insurance and risk management company. Your job is to generate highly detailed AI image prompts for Replicate. Output only the final image prompt, nothing else. Never include text, labels, logos or watermarks. ${layoutSystem}${hasReferenceImages ? " " + referenceRule : ""
        }`;

      // YOA brand rules
      userMessage = `Brand: YOA Insurance Brokers
Primary Colours: YOA Dark Green #0F684F, YOA Bright Green #84BD00, YOA Light Green #D4EB8E
Brand Core Values: Dependability, Trust, Stability, Competence, Creativity, Collaboration, Credence.
Brand Identity: Clear, supportive, informative, and human-centered. Balances professionalism with approachability. Reliable risk management and insurance specialists.
Post Idea: ${idea}
Hook: ${hook}
Goal: ${goal}${yoaBgColor ? `
Background Colour: ${yoaBgColor} — build the scene's environment and lighting palette primarily around this colour tone.` : ""}

Create a portrait format base image with these exact rules:
1. ${layoutUser}
2. The scene should utilize a fully realistic environment based on the prompt idea (e.g., an office, an outdoor site, a home). Do not use a stark white studio backdrop.
3. Scene: Subjects immersed naturally into the real-world environment — warm natural light, cinematic depth of field, candid and emotionally authentic feel
4. ${personRule}
5. Scene should feel real and human — not clinical, not staged, not stock photo. Represent professional excellence, security, and Nigerian lifestyle.
6. Lighting: warm natural daylight or soft studio box light, bright and airy
7. Negative space: Ensure the requested empty areas remain completely void of any props, harsh shadows, or vignettes to easily overlay text later
8. No text, no labels, no logos, no watermarks anywhere in the image
9. Orientation portrait 4:5
10. Photorealistic, cinematic, premium corporate and lifestyle brand, editorial feel
11. Reference image_input for people, style or product details if provided${hasReferenceImages ? `
12. STRICT FIDELITY RULE: Use ONLY what is visible in the reference images. Reproduce exact people (face, skin tone, hair, outfit, expression), exact products and exact equipment. Do NOT substitute, add, or invent anything — not a different person, not extra props, not different devices. The output must look like the reference people are placed into a new studio setting.` : ``}`;
    } else {
      systemMessage = `You are a brand visual strategist for ISN Medical, a premium Nigerian medical diagnostics company. Your job is to generate highly detailed AI image prompts for Replicate. Output only the final image prompt, nothing else. Never include text, labels, logos or watermarks. ${layoutSystem}${hasReferenceImages ? " " + referenceRule : ""
        }`;

      userMessage = `Brand: ISN Medical
Primary Colours: ISN Red #E95345, ISN Blue #00A1D7
Post Idea: ${idea}
Hook: ${hook}
Goal: ${goal}

Create a portrait format base image with these exact rules:
1. ${layoutUser}
2. The scene should utilize a seamless studio backdrop (pure white or very soft textured off-white) with soft, realistic contact shadows.
3. Scene: Subjects isolated cleanly against the studio background — warm natural light, candid and emotionally authentic feel
4. ${personRule}
5. Scene should feel real and human — not clinical, not staged, not stock photo
6. Lighting: warm natural daylight or soft studio box light, bright and airy
7. Negative space: Ensure the requested empty areas remain completely void of any props, harsh shadows, or vignettes to easily overlay text later
8. No text, no labels, no logos, no watermarks anywhere in the image
9. Orientation portrait 4:5
10. Photorealistic, cinematic, premium healthcare brand, editorial feel
11. Reference image_input for people, style or product details if provided${hasReferenceImages ? `
12. STRICT FIDELITY RULE: Use ONLY what is visible in the reference images. Reproduce exact people (face, skin tone, hair, outfit, expression), exact products and exact equipment. Do NOT substitute, add, or invent anything — not a different person, not extra props, not different devices. The output must look like the reference people are placed into a new studio setting.` : ``}`;
    }

    // Normally read from .env.local
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    // Call Groq
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userMessage }
        ],
        max_tokens: 1000
      })
    });

    if (!groqRes.ok) throw new Error("Groq API Error: " + await groqRes.text());
    const groqData = await groqRes.json();
    const imagePrompt = groqData.choices[0].message.content;

    return NextResponse.json({ prompt: imagePrompt });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
