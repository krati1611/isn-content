"use client";

import { useState } from 'react';
import './globals.css';

export default function Home() {
  const [idea, setIdea] = useState("");
  const [hook, setHook] = useState("");
  const [goal, setGoal] = useState("");
  const [placement, setPlacement] = useState("bottom");
  const [includeHuman, setIncludeHuman] = useState(true);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [resultPrompt, setResultPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setReferenceImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null); setResultImage(null); setResultPrompt(null);
    try {
      const res1 = await fetch("/api/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, hook, goal, placement, includeHuman }),
      });
      const data1 = await res1.json();
      if (!res1.ok) throw new Error(data1.error || "Failed to generate prompt");
      
      setResultPrompt(data1.prompt);

      const res2 = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagePrompt: data1.prompt, referenceImage }),
      });
      const data2 = await res2.json();
      if (!res2.ok) throw new Error(data2.error || "Failed to generate image");

      setResultImage(data2.imageUrl);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{maxWidth: '600px', margin: '2rem auto', padding: '2rem', background: '#13273D', borderRadius: '16px', color: 'white'}}>
      <h1 style={{ textAlign: "center", marginBottom: "2rem" }}>ISN Content Automation</h1>
      <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
        <div>
          <label style={{display: 'block', marginBottom: '0.5rem'}}>Concept Idea</label>
          <textarea value={idea} onChange={e => setIdea(e.target.value)} required rows={3} style={{width: '100%', padding: '0.8rem', borderRadius: '8px'}} />
        </div>
        <div>
          <label style={{display: 'block', marginBottom: '0.5rem'}}>Hook</label>
          <input value={hook} onChange={e => setHook(e.target.value)} required style={{width: '100%', padding: '0.8rem', borderRadius: '8px'}} />
        </div>
        <div>
          <label style={{display: 'block', marginBottom: '0.5rem'}}>Goal</label>
          <input value={goal} onChange={e => setGoal(e.target.value)} required style={{width: '100%', padding: '0.8rem', borderRadius: '8px'}} />
        </div>
        <div>
          <label style={{display: 'block', marginBottom: '0.5rem'}}>Content Placement</label>
          <select value={placement} onChange={e => setPlacement(e.target.value)} style={{width: '100%', padding: '0.8rem', borderRadius: '8px'}}>
            <option value="bottom">Bottom Theme (Top is empty)</option>
            <option value="top">Top Theme (Bottom is empty)</option>
            <option value="left">Left Theme (Right is empty)</option>
            <option value="right">Right Theme (Left is empty)</option>
            <option value="center">Center / Custom</option>
          </select>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
          <input type="checkbox" checked={includeHuman} onChange={e => setIncludeHuman(e.target.checked)} />
          <label>Include humans in scene?</label>
        </div>
        <div>
          <label style={{display: 'block', marginBottom: '0.5rem'}}>Reference Image (Optional)</label>
          <input type="file" accept="image/*" onChange={handleImageChange} style={{color: 'white'}} />
        </div>
        <button type="submit" disabled={loading} style={{padding: '1rem', background: '#E95345', color: 'white', borderRadius: '8px', cursor: 'pointer', border: 'none', fontWeight: 'bold'}}>
          {loading ? (resultPrompt ? "🖼️ Painting Image..." : "✍️ Crafting Prompt...") : "Generate Template"}
        </button>
      </form>
      {error && <div style={{color: '#E95345', marginTop: '1rem'}}>{error}</div>}
      
      {resultPrompt && !resultImage && (
         <div style={{marginTop: '2rem'}}>
           <p style={{background: '#0D1B2A', padding: '1rem', borderRadius: '8px', textAlign: 'left', fontSize: '0.9rem', border: '1px solid #E95345'}}>
             <strong>Prompt Blueprint:</strong> <br/><br/> {resultPrompt}
           </p>
         </div>
      )}

      {resultImage && (
         <div style={{marginTop: '2rem', textAlign: 'center'}}>
           <div style={{background: 'rgba(0, 161, 215, 0.2)', color: '#00A1D7', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', fontWeight: 'bold'}}>
             🎉 Success! Your template image has been generated beautifully.
           </div>
           <h3>Generated Image</h3>
           <img src={resultImage} alt="Generated UI" style={{maxWidth: '100%', borderRadius: '12px', marginBottom: '1rem'}} />
           <div>
             <a href={resultImage} target="_blank" rel="noreferrer" download="isn-template.png" style={{display: 'inline-block', padding: '0.8rem 1.5rem', background: '#00A1D7', color: 'white', textDecoration: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer'}}>
               ⬇️ Download Full Resolution
             </a>
           </div>
           <p style={{marginTop: '1.5rem', background: '#0D1B2A', padding: '1rem', borderRadius: '8px', textAlign: 'left', fontSize: '0.9rem'}}><strong>Prompt:</strong> {resultPrompt}</p>
         </div>
      )}
    </div>
  );
}
