"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import "./globals.css";

// ─── Types ───────────────────────────────────────────────────────────────────
type ImageSlot = {
  id: number;          // globally unique across all batches
  batchId: number;     // which submit created this slot
  batchLabel: string;  // human-readable e.g. "Batch 2"
  status: "pending" | "prompting" | "generating" | "done" | "error";
  prompt: string | null;
  imageUrl: string | null;
  error: string | null;
};

type FormSnapshot = {
  client: string;
  idea: string;
  hook: string;
  goal: string;
  placement: string;
  includeHuman: boolean;
  referenceImages: string[];
  useExactReference: boolean;
  yoaBgColor: string | null;
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function Home() {
  const [client, setClient] = useState("isn");
  const [idea, setIdea] = useState("");
  const [hook, setHook] = useState("");
  const [goal, setGoal] = useState("");
  const [placement, setPlacement] = useState("bottom");
  const [includeHuman, setIncludeHuman] = useState(true);
  // Each entry is either a data URI (uploaded) or null (empty slot)
  const [referenceImages, setReferenceImages] = useState<(string | null)[]>([null]);
  const [useExactReference, setUseExactReference] = useState(false);
  const [numImages, setNumImages] = useState(1);
  const [yoaBgColor, setYoaBgColor] = useState<string | null>(null);

  // ── Tweak mode state ──────────────────────────────────────────────────────
  const [tweakMode, setTweakMode] = useState(false);
  const [tweakImage, setTweakImage] = useState<string | null>(null);
  const [tweakInstruction, setTweakInstruction] = useState("");

  // All slots from every batch ever submitted — grows monotonically
  const [slots, setSlots] = useState<ImageSlot[]>([]);
  // How many batches are actively generating right now
  const [activeBatches, setActiveBatches] = useState(0);

  // Global unique slot counter (survives re-renders, never resets)
  const slotCounter = useRef(0);
  // Global batch counter
  const batchCounter = useRef(0);

  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const tweakFileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Dynamic Placeholders ──────────────────────────────────────────────────
  const isnPlaceholders = [
    "e.g. A patient getting results from a friendly nurse…",
    "e.g. A modern lab with high-tech diagnostic equipment…",
    "e.g. A happy family receiving a medical checkup…"
  ];
  const yoaPlaceholders = [
    "e.g. An oil and gas worker showing reliability…",
    "e.g. A business professional securing their company's future…",
    "e.g. A young family feeling protected by comprehensive insurance…"
  ];
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx((prev) => prev + 1);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const currentPlaceholderList = client === "yoa" ? yoaPlaceholders : isnPlaceholders;
  const currentPlaceholder = currentPlaceholderList[placeholderIdx % currentPlaceholderList.length];

  // ── Helpers ───────────────────────────────────────────────────────────────
  const updateSlot = (id: number, patch: Partial<ImageSlot>) => {
    setSlots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  };

  /** Compress + resize an image file client-side before storing as base64. */
  const compressImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onloadend = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const MAX_PX = 1200; // longest dimension cap
          let { width, height } = img;
          if (width > MAX_PX || height > MAX_PX) {
            if (width >= height) {
              height = Math.round((height / width) * MAX_PX);
              width = MAX_PX;
            } else {
              width = Math.round((width / height) * MAX_PX);
              height = MAX_PX;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });

  const handleImageChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const dataUri = await compressImage(file);
        setReferenceImages((prev) => {
          const next = [...prev];
          next[index] = dataUri;
          // Append a new empty slot if this was the last one
          if (index === next.length - 1) {
            next.push(null);
          }
          return next;
        });
      } catch {
        alert("Could not process the selected image. Please try a different file.");
      }
    },
    []
  );

  const handleRemoveImage = useCallback((index: number) => {
    setReferenceImages((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // Always keep at least one empty slot
      if (next.length === 0 || next[next.length - 1] !== null) {
        next.push(null);
      }
      // If no images left, reset the exact reference toggle
      const hasUploaded = next.some((r) => r !== null);
      if (!hasUploaded) setUseExactReference(false);
      return next;
    });
  }, []);

  // ── Client-side canvas composition for exact reference placement ────────────
  const composeExactImage = (dataUri: string, placement: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const CANVAS_W = 1600;
        const CANVAS_H = 2000;
        canvas.width = CANVAS_W;
        canvas.height = CANVAS_H;
        const ctx = canvas.getContext("2d")!;

        // Fill white background (studio backdrop)
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Define the exact target box based on placement (leaving space for text)
        let boxX = 0, boxY = 0, boxW = CANVAS_W, boxH = CANVAS_H;

        if (placement === "left") {
          boxW = CANVAS_W * 0.55;
        } else if (placement === "right") {
          boxW = CANVAS_W * 0.55;
          boxX = CANVAS_W - boxW;
        } else if (placement === "top") {
          boxH = CANVAS_H * 0.55;
        } else if (placement === "bottom") {
          boxH = CANVAS_H * 0.55;
          boxY = CANVAS_H - boxH;
        }

        // Calculate "object-fit: cover" cropping parameters
        const boxRatio = boxW / boxH;
        const imgRatio = img.width / img.height;
        let sx, sy, sWidth, sHeight;

        if (imgRatio > boxRatio) {
          // Image is relatively wider than the target box -> crop horizontally
          sHeight = img.height;
          sWidth = img.height * boxRatio;
          sx = (img.width - sWidth) / 2;
          sy = 0;
        } else {
          // Image is relatively taller than the target box -> crop vertically
          sWidth = img.width;
          sHeight = img.width / boxRatio;
          sx = 0;
          sy = (img.height - sHeight) / 2; // Center crop
        }

        // Draw cropped area into the perfect target box
        ctx.drawImage(img, sx, sy, sWidth, sHeight, boxX, boxY, boxW, boxH);
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      };
      img.src = dataUri;
    });

  // ── Client-side canvas composition for collage placement ──────────────────
  const composeCollageImage = (dataUris: string[]): Promise<string> =>
    new Promise(async (resolve, reject) => {
      try {
        const canvas = document.createElement("canvas");
        const CANVAS_W = 1600;
        const CANVAS_H = 2000;
        canvas.width = CANVAS_W;
        canvas.height = CANVAS_H;
        const ctx = canvas.getContext("2d")!;
        
        // Fill white background (studio backdrop)
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Load all images
        const imgs = await Promise.all(dataUris.map(uri => 
          new Promise<HTMLImageElement>((res, rej) => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = rej;
            img.src = uri;
          })
        ));

        // Define collage bounds: a box in the middle of the canvas
        // The user example has the collage roughly in the center
        const cx = CANVAS_W / 2;
        const cy = CANVAS_H / 2;

        const maxN = Math.min(imgs.length, 6);

        for (let i = 0; i < maxN; i++) {
          const img = imgs[i];
          ctx.save();
          
          let xOffset = 0;
          let yOffset = 0;
          let rot = 0;
          
          if (maxN === 1) {
            rot = -2;
          } else if (maxN === 2) {
            xOffset = i === 0 ? -250 : 250;
            yOffset = i === 0 ? -50 : 50;
            rot = i === 0 ? -5 : 5;
          } else if (maxN === 3) {
            xOffset = i === 0 ? 0 : (i === 1 ? -250 : 250);
            yOffset = i === 0 ? -250 : 150;
            rot = i === 0 ? 2 : (i === 1 ? -6 : 8);
          } else {
            // 4 or more: 2x2 grid roughly scattered
            const row = Math.floor((i % 4) / 2);
            const col = (i % 4) % 2;
            xOffset = col === 0 ? -280 : 280;
            yOffset = row === 0 ? -280 : 280;
            const rotations = [-8, 6, 7, -5, -4, 9];
            rot = rotations[i % rotations.length];
            // Add deterministic pseudo-random jitter
            xOffset += (i * 23) % 80 - 40;
            yOffset += (i * 37) % 80 - 40;
          }

          ctx.translate(cx + xOffset, cy + yOffset);
          ctx.rotate((rot * Math.PI) / 180);

          // "Polaroid" dimensions
          const polaroidW = 600;
          const polaroidH = 700;
          
          // Draw shadow
          ctx.shadowColor = "rgba(0,0,0,0.2)";
          ctx.shadowBlur = 30;
          ctx.shadowOffsetY = 15;

          // Draw white border
          ctx.fillStyle = "#ffffff";
          // x, y from center of polaroid
          const px = -polaroidW / 2;
          const py = -polaroidH / 2;
          
          // Little stroke for polaroid edge
          ctx.strokeStyle = "#e2e8f0";
          ctx.lineWidth = 1;
          ctx.fillRect(px, py, polaroidW, polaroidH);
          ctx.strokeRect(px, py, polaroidW, polaroidH);
          
          ctx.shadowColor = "transparent"; // reset shadow for image

          // Draw image inside (cropped)
          const margin = 24;
          const imgBoxW = polaroidW - margin * 2;
          const imgBoxH = polaroidH - margin * 2 - 80; // Extra bottom margin for polaroid look
          
          // Image crop
          const boxRatio = imgBoxW / imgBoxH;
          const imgRatio = img.width / img.height;
          let sx, sy, sWidth, sHeight;

          if (imgRatio > boxRatio) {
            sHeight = img.height;
            sWidth = img.height * boxRatio;
            sx = (img.width - sWidth) / 2;
            sy = 0;
          } else {
            sWidth = img.width;
            sHeight = img.width / boxRatio;
            sx = 0;
            sy = (img.height - sHeight) / 2;
          }

          ctx.drawImage(img, sx, sy, sWidth, sHeight, px + margin, py + margin, imgBoxW, imgBoxH);
          
          ctx.restore();
        }

        resolve(canvas.toDataURL("image/jpeg", 0.9));
      } catch (err) {
        reject(err);
      }
    });

  // ── Client-side canvas composition for list placement ─────────────────────
  const composeListImage = (dataUris: string[]): Promise<string> =>
    new Promise(async (resolve, reject) => {
      try {
        const canvas = document.createElement("canvas");
        const CANVAS_W = 1600;
        const CANVAS_H = 2000;
        canvas.width = CANVAS_W;
        canvas.height = CANVAS_H;
        const ctx = canvas.getContext("2d")!;
        
        // Light grey background (matches the requested aesthetic)
        ctx.fillStyle = "#f4f4f5";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        const imgs = await Promise.all(dataUris.map(uri => 
          new Promise<HTMLImageElement>((res, rej) => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = rej;
            img.src = uri;
          })
        ));

        const maxN = Math.min(imgs.length, 5); // stack up to 5 items vertically
        const startY = 240; // Leave space at the top for header/logos
        const availableHeight = CANVAS_H - startY - 80;
        const rowHeight = Math.floor(availableHeight / maxN);
        const colWidth = Math.floor(CANVAS_W * 0.45); // Left 45% for images
        
        for (let i = 0; i < maxN; i++) {
          const img = imgs[i];
          const marginY = Math.min(40, rowHeight * 0.1); // dynamic margin
          const marginX = 80;
          
          const rowX = marginX;
          const rowY = startY + i * rowHeight + marginY;
          const rowW = CANVAS_W - marginX * 2;
          const rowH = rowHeight - marginY * 2;

          // Draw the rounded box with a dashed border for the text/image section
          ctx.save();
          
          // White background for the individual list item
          ctx.fillStyle = "#ffffff";
          ctx.shadowColor = "rgba(0,0,0,0.03)";
          ctx.shadowBlur = 10;
          ctx.shadowOffsetY = 4;

          const radius = 12;
          ctx.beginPath();
          ctx.moveTo(rowX + radius, rowY);
          ctx.arcTo(rowX + rowW, rowY, rowX + rowW, rowY + rowH, radius);
          ctx.arcTo(rowX + rowW, rowY + rowH, rowX, rowY + rowH, radius);
          ctx.arcTo(rowX, rowY + rowH, rowX, rowY, radius);
          ctx.arcTo(rowX, rowY, rowX + rowW, rowY, radius);
          ctx.closePath();
          ctx.fill();
          
          ctx.shadowColor = "transparent";
          
          // Blue dashed border like the reference image
          ctx.strokeStyle = "#82A9C9"; // Muted light blue
          ctx.lineWidth = 2;
          ctx.setLineDash([12, 10]);
          ctx.stroke();
          ctx.restore();

          // Image box bounds inside the row
          const imgMarginX = 60;
          const imgMarginY = 30;
          const boxX = rowX + imgMarginX;
          const boxY = rowY + imgMarginY;
          const boxW = colWidth - imgMarginX * 2;
          const boxH = rowH - imgMarginY * 2;

          const boxRatio = boxW / boxH;
          const imgRatio = img.width / img.height;
          let drawW, drawH, drawX, drawY;

          // Fit image entirely inside its box (object-fit: contain)
          if (imgRatio > boxRatio) {
            drawW = boxW;
            drawH = boxW / imgRatio;
            drawX = boxX;
            drawY = boxY + (boxH - drawH) / 2;
          } else {
            drawH = boxH;
            drawW = boxH * imgRatio;
            drawX = boxX + (boxW - drawW) / 2;
            drawY = boxY;
          }

          // Optional subtle product shadow
          ctx.save();
          ctx.shadowColor = "rgba(0,0,0,0.15)";
          ctx.shadowBlur = 20;
          ctx.shadowOffsetY = 15;
          ctx.drawImage(img, 0, 0, img.width, img.height, drawX, drawY, drawW, drawH);
          ctx.restore();
        }

        resolve(canvas.toDataURL("image/jpeg", 0.9));
      } catch (err) {
        reject(err);
      }
    });


  // ── YOA Frame Overlay ───────────────────────────────────────────────────────
  const applyYoaFrame = (sourceUrl: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const w = img.width;
        const h = img.height;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        
        ctx.drawImage(img, 0, 0, w, h);

        const thickness = Math.max(6, Math.round(w * 0.008));
        const margin = thickness / 2; // For the stroke to touch the very edge exactly
        
        const gradient = ctx.createLinearGradient(0, 0, w, 0);
        gradient.addColorStop(0, "#0F684F");
        gradient.addColorStop(1, "#84BD00");

        ctx.strokeStyle = gradient;
        ctx.lineWidth = thickness;
        
        const x = margin;
        const y = margin;
        const boxW = w - thickness;
        const boxH = h - thickness;

        const cornerGapW = w * 0.35; // Gap width for logo in bottom right
        const cornerGapH = h * 0.15; // Gap height for logo in bottom right
        
        ctx.beginPath();
        // Start from top-left corner
        ctx.moveTo(x, y);
        // Left edge down to bottom-left
        ctx.lineTo(x, y + boxH);
        // Bottom edge towards right, stopping before the bottom-right gap
        ctx.lineTo(x + boxW - cornerGapW, y + boxH);
        ctx.stroke();

        ctx.beginPath();
        // Start from right edge, above the bottom-right gap
        ctx.moveTo(x + boxW, y + boxH - cornerGapH);
        // Right edge up to top-right
        ctx.lineTo(x + boxW, y);
        // Top edge left towards top-left
        ctx.lineTo(x, y);
        ctx.stroke();

        resolve(canvas.toDataURL("image/jpeg", 0.95));
      };
      img.src = sourceUrl;
    });

  // ── Pipeline for a single image slot (uses snapshotted form values) ───────
  const generateOne = async (id: number, snap: FormSnapshot, directImageUrl?: string | string[]) => {
    try {
      // ── Exact-reference shortcut: skip AI, use the image directly ─────────
      if (snap.useExactReference && directImageUrl) {
        updateSlot(id, { status: "generating" });
        let composedDataUri: string;
        if (Array.isArray(directImageUrl)) {
          if (snap.placement === "list") {
            composedDataUri = await composeListImage(directImageUrl);
          } else {
            composedDataUri = await composeCollageImage(directImageUrl);
          }
        } else {
          composedDataUri = await composeExactImage(directImageUrl, snap.placement);
        }
        if (snap.client === "yoa") {
          try {
            composedDataUri = await applyYoaFrame(composedDataUri);
          } catch (e) {
            console.error("YOA Frame overlay failed:", e);
          }
        }
        updateSlot(id, {
          imageUrl: composedDataUri,
          prompt: `(Exact reference placed at ${snap.placement} — no AI generation)`,
          status: "done"
        });
        return;
      }

      // ── Normal AI pipeline ────────────────────────────────────────────────
      // Step 1 – prompt
      updateSlot(id, { status: "prompting" });
      const res1 = await fetch("/api/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: snap.client,
          idea: snap.idea,
          hook: snap.hook,
          goal: snap.goal,
          placement: snap.placement,
          includeHuman: snap.includeHuman,
          hasReferenceImages: snap.referenceImages.length > 0,
          yoaBgColor: snap.yoaBgColor,
        }),
      });
      const data1 = await res1.json();
      if (!res1.ok) throw new Error(data1.error || "Failed to generate prompt");

      updateSlot(id, { prompt: data1.prompt, status: "generating" });

      // Step 2 – image (Start Generation)
      const res2 = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagePrompt: data1.prompt,
          referenceImages: snap.referenceImages,
        }),
      });
      const data2 = await res2.json();
      if (!res2.ok) throw new Error(data2.error || "Failed to start image generation");

      let apiStatus = data2.status;
      let finalImageUrl = null;
      const predictionId = data2.predictionId;

      if (!predictionId) {
         throw new Error("No prediction ID returned from server.");
      }

      // Step 3 - Poll for completion
      while (apiStatus === "starting" || apiStatus === "processing") {
         await new Promise(resolve => setTimeout(resolve, 3000));
         const pollRes = await fetch(`/api/generate-image/${predictionId}`);
         const pollData = await pollRes.json();
         
         if (!pollRes.ok) throw new Error(pollData.error || "Failed to poll image status");
         
         apiStatus = pollData.status;
         
         if (apiStatus === "succeeded") {
             finalImageUrl = pollData.imageUrl;
         } else if (apiStatus === "failed") {
             throw new Error(pollData.error || "Generation failed on Replicate.");
         }
      }

      if (!finalImageUrl) {
        throw new Error("Generation finished but no image returned");
      }

      if (snap.client === "yoa") {
        try {
          finalImageUrl = await applyYoaFrame(finalImageUrl);
        } catch (e) {
          console.error("YOA Frame overlay failed:", e);
        }
      }

      updateSlot(id, { imageUrl: finalImageUrl, status: "done" });
    } catch (err: any) {
      updateSlot(id, { error: err.message, status: "error" });
    }
  };

  // ── Tweak pipeline: send image + instruction to FLUX Kontext, then poll ───
  const generateTweakOne = async (id: number, imageDataUri: string, instruction: string, applyYoa: boolean) => {
    try {
      updateSlot(id, { status: "generating", prompt: instruction });

      // Step 1 — Start the Kontext edit
      const res = await fetch("/api/tweak-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUri, instruction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start tweak");

      const predictionId = data.predictionId;
      if (!predictionId) throw new Error("No prediction ID returned from tweak server.");

      // Step 2 — Poll for completion (same route as normal generate)
      let apiStatus = data.status;
      let finalImageUrl: string | null = null;

      while (apiStatus === "starting" || apiStatus === "processing") {
        await new Promise((r) => setTimeout(r, 3000));
        const pollRes = await fetch(`/api/generate-image/${predictionId}`);
        const pollData = await pollRes.json();
        if (!pollRes.ok) throw new Error(pollData.error || "Failed to poll tweak status");
        apiStatus = pollData.status;
        if (apiStatus === "succeeded") finalImageUrl = pollData.imageUrl;
        else if (apiStatus === "failed") throw new Error(pollData.error || "Tweak generation failed.");
      }

      if (!finalImageUrl) throw new Error("Tweak finished but no image returned.");

      // Step 3 — Apply YOA frame if client = YOA
      if (applyYoa) {
        try { finalImageUrl = await applyYoaFrame(finalImageUrl); }
        catch (e) { console.error("YOA Frame overlay failed on tweak:", e); }
      }

      updateSlot(id, { imageUrl: finalImageUrl, status: "done" });
    } catch (err: any) {
      updateSlot(id, { error: err.message, status: "error" });
    }
  };

  // ── Form submit: append a new batch of slots and kick off N pipelines ─────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // ── Tweak mode: single slot, single pipeline ─────────────────────────────
    if (tweakMode) {
      if (!tweakImage) return alert("Please upload an image to tweak.");
      if (!tweakInstruction.trim()) return alert("Please describe what you want to change.");

      batchCounter.current += 1;
      const thisBatchId = batchCounter.current;
      const thisBatchLabel = `Tweak ${thisBatchId}`;
      const id = slotCounter.current++;
      const newSlot: ImageSlot = { id, batchId: thisBatchId, batchLabel: thisBatchLabel, status: "pending", prompt: null, imageUrl: null, error: null };
      setSlots((prev) => [newSlot, ...prev]);
      setActiveBatches((n) => n + 1);
      await generateTweakOne(id, tweakImage, tweakInstruction, client === "yoa");
      setActiveBatches((n) => n - 1);
      return;
    }

    // Snapshot the form values at this moment in time
    const snap: FormSnapshot = {
      client,
      idea,
      hook,
      goal,
      placement,
      includeHuman,
      referenceImages: referenceImages.filter((r): r is string => r !== null),
      useExactReference,
      yoaBgColor: client === "yoa" ? yoaBgColor : null,
    };

    // ── Enforce exact reference for array-based layouts if there are reference images ──
    if ((snap.placement === "collage" || snap.placement === "list") && snap.referenceImages.length > 0) {
      snap.useExactReference = true;
    }

    // ── Exact-reference mode: either one output slot per uploaded reference image, or single combined output ──
    if (snap.useExactReference && snap.referenceImages.length > 0) {
      batchCounter.current += 1;
      const thisBatchId = batchCounter.current;
      const thisBatchLabel = `Batch ${thisBatchId}`;

      if (snap.placement === "collage" || snap.placement === "list") {
        const id = slotCounter.current++;
        const newSlot: ImageSlot = { id, batchId: thisBatchId, batchLabel: thisBatchLabel, status: "pending", prompt: null, imageUrl: null, error: null };
        setSlots((prev) => [newSlot, ...prev]);
        setActiveBatches((n) => n + 1);
        await Promise.allSettled([generateOne(newSlot.id, snap, snap.referenceImages)]);
        setActiveBatches((n) => n - 1);
      } else {
        const newSlots: ImageSlot[] = snap.referenceImages.map(() => {
          const id = slotCounter.current++;
          return { id, batchId: thisBatchId, batchLabel: thisBatchLabel, status: "pending", prompt: null, imageUrl: null, error: null };
        });

        setSlots((prev) => [...newSlots, ...prev]);
        setActiveBatches((n) => n + 1);
        await Promise.allSettled(newSlots.map((s, i) => generateOne(s.id, snap, snap.referenceImages[i])));
        setActiveBatches((n) => n - 1);
      }
      return;
    }

    // Assign a unique batch id and label
    batchCounter.current += 1;
    const thisBatchId = batchCounter.current;
    const thisBatchLabel = batchCounter.current === 1 ? "Batch 1" : `Batch ${thisBatchId}`;

    // Create new slots with globally-unique IDs
    const newSlots: ImageSlot[] = Array.from({ length: numImages }, () => {
      const id = slotCounter.current++;
      return {
        id,
        batchId: thisBatchId,
        batchLabel: thisBatchLabel,
        status: "pending",
        prompt: null,
        imageUrl: null,
        error: null,
      };
    });

    // Prepend this batch so newest is at the top
    setSlots((prev) => [...newSlots, ...prev]);
    setActiveBatches((n) => n + 1);

    await Promise.allSettled(newSlots.map((s) => generateOne(s.id, snap)));

    setActiveBatches((n) => n - 1);
  };

  // ── Derived counts ────────────────────────────────────────────────────────
  const doneCount = slots.filter((s) => s.status === "done").length;
  const hasResults = slots.length > 0;

  return (
    <>
      {/* ── Global styles injected inline for portability ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; }

        .page-wrap {
          font-family: 'Outfit', -apple-system, sans-serif;
          min-height: 100vh;
          background: #0D1117;
          padding: 2rem 1rem 4rem;
        }

        /* ── Form card ── */
        .form-card {
          max-width: 580px;
          margin: 0 auto 3rem;
          background: #161B22;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 20px;
          padding: 2.5rem;
          box-shadow: 0 12px 40px rgba(0,0,0,0.4);
        }

        .form-title {
          text-align: center;
          font-size: 1.6rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin: 0 0 2rem;
          background: linear-gradient(90deg, #2ecc98, #00A1D7);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .field { display: flex; flex-direction: column; gap: 0.45rem; }
        .field label { font-size: 0.82rem; font-weight: 600; color: #64748b; letter-spacing: 0.05em; text-transform: uppercase; }
        .field textarea, .field input[type=text], .field select, .field input[type=email] {
          background: #0D1117;
          border: 1.5px solid #2D3748;
          border-radius: 10px;
          color: #E2E8F0;
          padding: 0.75rem 1rem;
          font-size: 0.95rem;
          font-family: inherit;
          transition: all 0.2s;
          resize: vertical;
          outline: none;
        }
        .field textarea:focus, .field input:focus, .field select:focus {
          border-color: #2ecc98;
          box-shadow: 0 0 0 4px rgba(46, 204, 152, 0.12);
        }
        .field select option { background: #161B22; color: #E2E8F0; }

        .field-row { display: flex; gap: 1.2rem; }
        .field-row .field { flex: 1; }

        .checkbox-row {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-size: 0.9rem;
          color: #94A3B8;
          cursor: pointer;
          user-select: none;
        }
        .checkbox-row input[type=checkbox] {
          width: 18px; height: 18px;
          accent-color: #2ecc98;
          cursor: pointer;
        }

        /* num-images pill picker */
        .num-picker { display: flex; gap: 0.5rem; }
        .num-pill {
          flex: 1;
          padding: 0.45rem;
          border-radius: 8px;
          border: 1.5px solid #2D3748;
          background: transparent;
          color: #64748b;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        .num-pill:hover { border-color: #2ecc98; color: #2ecc98; background: rgba(46,204,152,0.06); }
        .num-pill.active {
          border-color: #2ecc98;
          background: rgba(46,204,152,0.12);
          color: #2ecc98;
        }

        /* file upload */
        .file-label {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          background: #0D1117;
          border: 1.5px dashed #2D3748;
          border-radius: 10px;
          padding: 0.7rem 1rem;
          cursor: pointer;
          font-size: 0.9rem;
          color: #64748b;
          transition: all 0.2s;
        }
        .file-label:hover { border-color: #2ecc98; color: #2ecc98; background: rgba(46,204,152,0.04); }
        .ref-preview {
          width: 48px; height: 48px;
          border-radius: 8px;
          object-fit: cover;
          border: 1.5px solid rgba(46, 204, 152, 0.3);
        }

        /* submit button */
        .submit-btn {
          width: 100%;
          padding: 1rem;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg, #0F684F, #84BD00);
          color: #fff;
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: 0.01em;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
          margin-top: 0.5rem;
          box-shadow: 0 8px 20px rgba(132, 189, 0, 0.3);
        }
        .submit-btn:hover:not(:disabled) { opacity: 0.95; transform: translateY(-2px); box-shadow: 0 12px 25px rgba(132, 189, 0, 0.45); }
        .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }

        /* progress bar under button */
        .progress-bar-wrap {
          height: 4px;
          background: #2D3748;
          border-radius: 2px;
          overflow: hidden;
          margin-top: 0.5rem;
        }
        .progress-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #0F684F, #84BD00);
          border-radius: 2px;
          transition: width 0.5s ease;
        }

        /* ── Results grid ── */
        .results-section { max-width: 1200px; margin: 0 auto; }
        .results-heading {
          text-align: center;
          font-size: 1.1rem;
          color: #64748b;
          margin-bottom: 1.5rem;
        }
        .results-heading strong { color: #CBD5E1; }

        .image-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 1.5rem;
        }

        /* ── Image card ── */
        .img-card {
          background: #161B22;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px;
          overflow: hidden;
          position: relative;
          box-shadow: 0 8px 30px rgba(0,0,0,0.4);
          animation: cardAppear 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes cardAppear {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        .img-badge {
          position: absolute;
          top: 10px; left: 10px;
          background: rgba(13,17,23,0.75);
          backdrop-filter: blur(8px);
          border-radius: 6px;
          font-size: 0.7rem;
          font-weight: 700;
          color: #CBD5E1;
          padding: 3px 8px;
          letter-spacing: 0.05em;
          z-index: 2;
          box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        }

        /* shimmer skeleton */
        .shimmer {
          width: 100%;
          aspect-ratio: 4/5;
          background: linear-gradient(90deg, #1a2130 25%, #212d3d 50%, #1a2130 75%);
          background-size: 200% 100%;
          animation: shimmer 1.4s infinite;
        }
        @keyframes shimmer {
          from { background-position: 200% 0; }
          to   { background-position: -200% 0; }
        }

        .img-status {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          background: rgba(13,17,23,0.8);
          backdrop-filter: blur(12px);
          padding: 0.65rem 1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8rem;
          color: #94A3B8;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .status-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .status-dot.pending   { background: #475569; }
        .status-dot.prompting { background: #3B82F6; animation: pulse 1s infinite; }
        .status-dot.generating { background: #F59E0B; animation: pulse 1s infinite; }
        .status-dot.done      { background: #10B981; }
        .status-dot.error     { background: #EF4444; }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.7); }
        }

        /* done image reveal */
        .img-reveal {
          width: 100%;
          aspect-ratio: 4/5;
          object-fit: cover;
          display: block;
          animation: fadeIn 0.6s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* download button */
        .dl-btn {
          display: block;
          margin: 0.75rem auto 0.9rem;
          padding: 0.5rem 1.1rem;
          background: rgba(46, 204, 152, 0.08);
          border: 1.5px solid rgba(46, 204, 152, 0.2);
          border-radius: 8px;
          color: #2ecc98;
          font-size: 0.8rem;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.2s;
          width: calc(100% - 1.5rem);
          text-align: center;
          cursor: pointer;
        }
        .dl-btn:hover { 
          background: rgba(46, 204, 152, 0.15); 
          transform: translateY(-1px);
        }

        /* error card */
        .error-box {
          padding: 1rem;
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 8px;
          color: #FCA5A5;
          font-size: 0.82rem;
          margin: 0.75rem;
        }

        .global-error {
          max-width: 580px;
          margin: -1.5rem auto 1rem;
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 10px;
          padding: 0.8rem 1rem;
          color: #FCA5A5;
          font-size: 0.88rem;
        }

        /* ── Tweak section ── */
        .tweak-toggle {
          display: flex;
          align-items: flex-start;
          gap: 0.6rem;
          padding: 0.75rem 1rem;
          background: #0D1117;
          border: 1.5px solid #2D3748;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
          user-select: none;
        }
        .tweak-toggle:hover { border-color: #2ecc98; }
        .tweak-toggle.active {
          border-color: rgba(46,204,152,0.4);
          background: rgba(46,204,152,0.05);
        }
        .tweak-toggle input[type=checkbox] {
          width: 18px; height: 18px;
          accent-color: #2ecc98;
          cursor: pointer;
          margin-top: 1px;
          flex-shrink: 0;
        }
        .tweak-body {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1rem;
          background: rgba(46,204,152,0.03);
          border: 1.5px solid rgba(46,204,152,0.15);
          border-top: none;
          border-radius: 0 0 12px 12px;
          margin-top: -4px;
        }
        .tweak-upload {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: #0D1117;
          border: 1.5px dashed #2D3748;
          border-radius: 10px;
          padding: 0.75rem 1rem;
          cursor: pointer;
          font-size: 0.9rem;
          color: #64748b;
          transition: all 0.2s;
        }
        .tweak-upload:hover { border-color: #2ecc98; color: #2ecc98; }
        .tweak-preview {
          width: 56px; height: 56px;
          border-radius: 8px;
          object-fit: cover;
          border: 2px solid rgba(46,204,152,0.3);
          flex-shrink: 0;
        }

        .form-stack { display: flex; flex-direction: column; gap: 1.25rem; }

        /* ── YOA Background Palette ── */
        .palette-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.55rem;
          margin-top: 0.35rem;
        }
        .swatch-btn {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          border: 2px solid transparent;
          cursor: pointer;
          transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
          position: relative;
          flex-shrink: 0;
        }
        .swatch-btn:hover { transform: scale(1.15); }
        .swatch-btn.selected {
          border-color: #2ecc98;
          box-shadow: 0 0 0 3px rgba(46,204,152,0.3);
          transform: scale(1.12);
        }
        .swatch-none {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          border: 2px dashed #2D3748;
          cursor: pointer;
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          color: #64748b;
          transition: all 0.15s;
          flex-shrink: 0;
        }
        .swatch-none:hover { border-color: #2ecc98; color: #2ecc98; }
        .swatch-none.selected {
          border-color: #2ecc98;
          color: #2ecc98;
          box-shadow: 0 0 0 3px rgba(46,204,152,0.3);
        }
        .palette-label-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.1rem;
        }
        .palette-color-name {
          font-size: 0.72rem;
          color: #64748b;
          margin-top: 0.2rem;
        }
      `}</style>

      <div className="page-wrap">
        {/* ── Form Card ── */}
        <div className="form-card">
          <h1 className="form-title">Pedicel Content System</h1>

          <form onSubmit={handleSubmit} className="form-stack">
            {/* Client */}
            <div className="field">
              <label>Client</label>
              <select value={client} onChange={(e) => setClient(e.target.value)}>
                <option value="isn">ISN</option>
                <option value="yoa">YOA</option>
              </select>
            </div>

            {/* YOA — Background Colour Palette */}
            {client === "yoa" && (() => {
              const palette = [
                // ── Brand core ─────────────────────────────────────
                { hex: "#0F684F", name: "YOA Dark Green" },
                { hex: "#84BD00", name: "YOA Bright Green" },
                { hex: "#D4EB8E", name: "YOA Light Green" },
                // ── Complementary brand neutrals ───────────────────
                { hex: "#1A2E25", name: "Deep Forest" },
                { hex: "#2D4A38", name: "Rainforest" },
                { hex: "#F5F0E8", name: "Warm Ivory" },
                { hex: "#EAF4E2", name: "Fresh Mint" },
                // ── Environmental / lifestyle tones ─────────────────
                { hex: "#1C3557", name: "Ocean Blue" },
                { hex: "#B5813B", name: "Warm Gold" },
                { hex: "#3B2A1A", name: "Deep Earth" },
                { hex: "#7A9E87", name: "Sage" },
                { hex: "#C8D8E4", name: "Sky Mist" },
              ];
              const selected = palette.find(p => p.hex === yoaBgColor);
              return (
                <div className="field">
                  <div className="palette-label-row">
                    <label style={{ margin: 0 }}>Background Colour Hint</label>
                    {selected && (
                      <span className="palette-color-name">
                        {selected.hex} · {selected.name}
                      </span>
                    )}
                  </div>
                  <div className="palette-grid">
                    <button
                      type="button"
                      title="No preference — AI chooses"
                      className={`swatch-none${yoaBgColor === null ? " selected" : ""}`}
                      onClick={() => setYoaBgColor(null)}
                    >✕</button>
                    {palette.map(({ hex, name }) => (
                      <button
                        key={hex}
                        type="button"
                        title={`${name} ${hex}`}
                        className={`swatch-btn${yoaBgColor === hex ? " selected" : ""}`}
                        style={{ background: hex }}
                        onClick={() => setYoaBgColor(hex)}
                      />
                    ))}
                  </div>
                  <p style={{ margin: "0.35rem 0 0", fontSize: "0.75rem", color: "#475569" }}>
                    Nudges the AI to use this colour as the dominant background / environment tone.
                  </p>
                </div>
              );
            })()}

            {/* Concept */}
            <div className="field">
              <label>Concept Idea</label>
              <textarea
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                required
                rows={3}
                placeholder={currentPlaceholder}
              />
            </div>

            {/* Hook + Goal */}
            <div className="field-row">
              <div className="field">
                <label>Hook</label>
                <input
                  type="text"
                  value={hook}
                  onChange={(e) => setHook(e.target.value)}
                  placeholder="Your hook line (optional)"
                />
              </div>
              <div className="field">
                <label>Goal</label>
                <input
                  type="text"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="e.g. Book a test (optional)"
                />
              </div>
            </div>

            {/* Placement */}
            <div className="field">
              <label>Content Placement</label>
              <select value={placement} onChange={(e) => setPlacement(e.target.value)}>
                <option value="bottom">Bottom Theme (Top is empty)</option>
                <option value="top">Top Theme (Bottom is empty)</option>
                <option value="left">Left Theme (Right is empty)</option>
                <option value="right">Right Theme (Left is empty)</option>
                <option value="collage">Collage (Scattered Polaroids over Center)</option>
                <option value="list">List (Vertical Stack on Left)</option>
                <option value="center">Center / Custom</option>
              </select>
            </div>

            {/* Options row */}
            <div className="field-row" style={{ alignItems: "center" }}>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={includeHuman}
                  onChange={(e) => setIncludeHuman(e.target.checked)}
                />
                Include humans in scene
              </label>
            </div>

            {/* Number of images */}
            <div className="field">
              <label>Number of Images</label>
              <div className="num-picker">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`num-pill${numImages === n ? " active" : ""}`}
                    onClick={() => setNumImages(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Reference images — dynamic list */}
            <div className="field">
              <label>Reference Images (Optional)</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {referenceImages.map((img, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <label
                      className="file-label"
                      htmlFor={`ref-img-input-${idx}`}
                      style={{ flex: 1, margin: 0 }}
                    >
                      {img ? (
                        <>
                          <img src={img} className="ref-preview" alt={`ref-${idx}`} />
                          <span>Image {idx + 1} attached – click to change</span>
                        </>
                      ) : (
                        <>
                          <span style={{ opacity: 0.5 }}>📎</span>
                          <span>
                            {idx === 0 ? "Upload reference image" : `Add image ${idx + 1}`}
                          </span>
                        </>
                      )}
                    </label>
                    {img && (
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(idx)}
                        style={{
                          background: "rgba(233,83,69,0.15)",
                          border: "1.5px solid rgba(233,83,69,0.35)",
                          borderRadius: "8px",
                          color: "#E95345",
                          padding: "0.45rem 0.65rem",
                          cursor: "pointer",
                          fontSize: "0.85rem",
                          flexShrink: 0,
                          lineHeight: 1,
                          transition: "background 0.15s",
                        }}
                        title="Remove this image"
                      >
                        ✕
                      </button>
                    )}
                    <input
                      id={`ref-img-input-${idx}`}
                      ref={(el) => { fileInputRefs.current[idx] = el; }}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageChange(e, idx)}
                      style={{ display: "none" }}
                    />
                  </div>
                ))}
              </div>

              {/* "Use exact reference" toggle — only visible when images are uploaded */}
              {referenceImages.some((r) => r !== null) && (
                <label
                  className="checkbox-row"
                  style={{
                    marginTop: "0.6rem",
                    padding: "0.6rem 0.85rem",
                    background: useExactReference ? "rgba(46, 204, 152, 0.08)" : "#0D1117",
                    border: `1.5px solid ${useExactReference ? "rgba(46, 204, 152, 0.3)" : "#2D3748"}`,
                    borderRadius: "10px",
                    transition: "all 0.2s",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={useExactReference}
                    onChange={(e) => setUseExactReference(e.target.checked)}
                  />
                  <span>
                    <strong style={{ color: useExactReference ? "#2ecc98" : "#94A3B8" }}>Use exact reference image(s)</strong>
                    <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>
                      Skip AI generation — output the uploaded image(s) directly
                    </span>
                  </span>
                </label>
              )}
            </div>

            {/* ── Tweak Mode Section ─────────────────────────────────────────── */}
            <label className={`tweak-toggle${tweakMode ? " active" : ""}`}>
              <input
                type="checkbox"
                checked={tweakMode}
                onChange={(e) => setTweakMode(e.target.checked)}
              />
              <span>
                <strong style={{ color: tweakMode ? "#2ecc98" : "#94A3B8", fontSize: "0.92rem" }}>
                  ✏️ Tweak a reference image
                </strong>
                <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>
                  Edit an existing photo with a plain-English instruction — change background, expression, lighting, or clothing
                </span>
              </span>
            </label>

            {tweakMode && (
              <div className="tweak-body">
                {/* Image upload */}
                <div className="field">
                  <label>Image to Tweak</label>
                  <label className="tweak-upload" htmlFor="tweak-img-input">
                    {tweakImage ? (
                      <>
                        <img src={tweakImage} className="tweak-preview" alt="tweak source" />
                        <span style={{ fontSize: "0.85rem", color: "#94A3B8" }}>Image loaded — click to change</span>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: "1.3rem" }}>🖼️</span>
                        <span>Upload the image you want to edit</span>
                      </>
                    )}
                  </label>
                  <input
                    id="tweak-img-input"
                    ref={tweakFileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try { setTweakImage(await compressImage(file)); }
                      catch { alert("Could not process the image. Try another file."); }
                    }}
                  />
                </div>

                {/* Instruction */}
                <div className="field">
                  <label>Edit Instruction</label>
                  <textarea
                    value={tweakInstruction}
                    onChange={(e) => setTweakInstruction(e.target.value)}
                    rows={3}
                    placeholder={
                      ["Make the person smile warmly",
                       "Change the background to a modern office",
                       "Replace the garden with a busy city street",
                       "Add warm golden hour lighting",
                       "Change the shirt to white professional attire"
                      ][Math.floor(Date.now() / 4000) % 5]
                    }
                  />
                </div>
              </div>
            )}

            {/* Submit — always enabled so you can queue more batches */}
            <button type="submit" className="submit-btn">
              {tweakMode
                ? (activeBatches > 0 ? "✏️ Queue Tweak" : "✏️ Apply Tweak")
                : (activeBatches > 0
                    ? `✨ Queue ${numImages} More Image${numImages > 1 ? "s" : ""}`
                    : `✨ Generate ${numImages} Image${numImages > 1 ? "s" : ""}`)}
            </button>

            {/* Progress bar — shows overall active-slot progress */}
            {activeBatches > 0 && (
              <div className="progress-bar-wrap">
                <div
                  className="progress-bar-fill"
                  style={{
                    width: slots.length
                      ? `${(doneCount / slots.length) * 100}%`
                      : "0%",
                  }}
                />
              </div>
            )}
          </form>
        </div>

        {/* ── Results Grid ── */}
        {hasResults && (
          <div className="results-section">
            <p className="results-heading">
              <strong>{doneCount}</strong> of <strong>{slots.length}</strong> image
              {slots.length > 1 ? "s" : ""} complete
              {activeBatches > 0 && <span style={{color:'#f59e0b', marginLeft:'0.5rem'}}>· {activeBatches} batch{activeBatches > 1 ? 'es' : ''} running</span>}
            </p>

            <div className="image-grid">
              {slots.map((slot, i) => (
                <ImageCard key={slot.id} slot={slot} index={i + 1} />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── ImageCard sub-component ─────────────────────────────────────────────────
function ImageCard({ slot, index }: { slot: ImageSlot; index: number }) {
  const statusLabel: Record<ImageSlot["status"], string> = {
    pending: "Waiting…",
    prompting: "Crafting prompt…",
    generating: "Painting image…",
    done: "Done",
    error: "Failed",
  };

  return (
    <div className="img-card">
      <span className="img-badge">#{index}</span>
      {slot.batchId > 1 && (
        <span style={{
          position: 'absolute', top: 10, right: 10,
          background: 'rgba(0,161,215,0.2)',
          border: '1px solid rgba(0,161,215,0.35)',
          backdropFilter: 'blur(8px)',
          borderRadius: '6px', fontSize: '0.65rem',
          fontWeight: 700, color: '#38bdf8',
          padding: '3px 8px', zIndex: 2,
          letterSpacing: '0.04em',
        }}>{slot.batchLabel}</span>
      )}

      {/* Image area */}
      {slot.status === "done" && slot.imageUrl ? (
        <img src={slot.imageUrl} className="img-reveal" alt={`Generated image ${index}`} />
      ) : slot.status === "error" ? (
        <div style={{ aspectRatio: "4/5", background: "rgba(239,68,68,0.07)" }} />
      ) : (
        <div className="shimmer" />
      )}

      {/* Status bar */}
      <div className="img-status">
        <span className={`status-dot ${slot.status}`} />
        <span>{statusLabel[slot.status]}</span>
      </div>

      {/* Error message */}
      {slot.status === "error" && slot.error && (
        <div className="error-box">⚠️ {slot.error}</div>
      )}

      {/* Download */}
      {slot.status === "done" && slot.imageUrl && (
        <a
          href={slot.imageUrl}
          target="_blank"
          rel="noreferrer"
          download={`isn-template-${index}.png`}
          className="dl-btn"
        >
          ⬇️ Download Image {index}
        </a>
      )}

      {/* Prompt preview on hover (collapsed by default) */}
      {slot.prompt && slot.status === "done" && (
        <details style={{ margin: "0 0.75rem 0.75rem", fontSize: "0.75rem", color: "#64748b" }}>
          <summary style={{ cursor: "pointer", color: "#94A3B8" }}>View prompt</summary>
          <p style={{ marginTop: "0.5rem", lineHeight: 1.5, color: "#64748b" }}>{slot.prompt}</p>
        </details>
      )}
    </div>
  );
}
