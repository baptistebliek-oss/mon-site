import { useState, useEffect } from "react";

const SK = { cats: "ff-cats", qs: "ff-qs", pw: "ff-pw", pseudo: "ff-pseudo", results: "ff-results" };
const DEFAULT_PW = "Pompiers2024";
const C = {
  bg: "#0b0b0b", surf: "#161616", card: "#1e1e1e", border: "#2a2a2a",
  red: "#e53e2a", orange: "#f07020", green: "#22c55e", blue: "#3b82f6",
  text: "#f0ede8", muted: "#7a7570"
};
const CAT_COLORS = ["#e53e2a", "#f07020", "#eab308", "#22c55e", "#3b82f6", "#a855f7"];
const LABELS = ["A", "B", "C", "D"];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtDate = (ts) => new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const timeAgo = (ts) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "À l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
};

const INIT_CATS = [
  { id: "c1", name: "Sécurité incendie", desc: "Prévention, évacuation, procédures", color: "#e53e2a" },
  { id: "c2", name: "Premiers secours", desc: "Gestes qui sauvent, RCP, PLS", color: "#f07020" },
  { id: "c3", name: "Matériel & Équipements", desc: "Extincteurs, EPI, véhicules", color: "#eab308" },
];

const INIT_QS = [
  { id: "q1", catId: "c1", text: "Quelle est la première action à effectuer face à un incendie dans un bâtiment ?", opts: ["Utiliser un extincteur", "Évacuer immédiatement", "Appeler le 18", "Fermer les portes coupe-feu"], correct: 1, expl: "L'évacuation est toujours la priorité absolue pour protéger les vies humaines." },
  { id: "q2", catId: "c1", text: "Quel est le numéro d'urgence des sapeurs-pompiers en France ?", opts: ["15", "17", "18", "112"], correct: 2, expl: "Le 18 est le numéro des sapeurs-pompiers. Le 112 est le numéro européen d'urgence." },
  { id: "q3", catId: "c1", text: "Que signifie le sigle FIFO utilisé en sécurité incendie ?", opts: ["Feu Intérieur, Feu Ouvert", "Former, Informer, Fuir, Obturer", "Feu Isolé, Feu Ordinaire", "Flamme, Incendie, Foyer, Onde"], correct: 1, expl: "FIFO = Former les équipiers, Informer les secours, Fuir le danger, Obturer les issues." },
  { id: "q4", catId: "c2", text: "À quelle fréquence réalise-t-on les compressions thoraciques lors d'un RCP adulte ?", opts: ["60–80/min", "80–100/min", "100–120/min", "120–140/min"], correct: 2, expl: "Les recommandations ERC 2021 : 100 à 120 compressions/min, profondeur 5–6 cm." },
  { id: "q5", catId: "c2", text: "Quelle position adopter pour une victime inconsciente qui respire normalement ?", opts: ["Position dorsale", "Position assise", "PLS", "Demi-assise"], correct: 2, expl: "La PLS (Position Latérale de Sécurité) maintient les voies aériennes libres et évite l'aspiration." },
  { id: "q6", catId: "c3", text: "Quel agent extincteur est adapté pour un feu de classe B (liquides inflammables) ?", opts: ["Eau pulvérisée", "CO₂", "Poudre ABC", "Mousse AFFF"], correct: 3, expl: "La mousse AFFF est la plus efficace sur les feux de liquides inflammables (classe B)." },
  { id: "q7", catId: "c3", text: "Que signifie EPI dans l'équipement du sapeur-pompier ?", opts: ["Équipe de Premiers Intervenants", "Équipement de Protection Individuelle", "Ensemble Pare-Incendie", "Extincteur Portatif Intégré"], correct: 1, expl: "EPI = Équipement de Protection Individuelle : casque, veste, pantalon, gants et bottes." },
];

function FieldLabel({ children }) {
  return <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8, fontFamily: "'Barlow', sans-serif" }}>{children}</label>;
}

function ScoreBadge({ pct }) {
  const color = pct >= 70 ? C.green : pct >= 50 ? C.orange : C.red;
  return <span style={{ fontSize: 13, padding: "3px 10px", color, border: `1px solid ${color}`, borderRadius: 3, fontFamily: "Oswald, sans-serif", fontWeight: 700, letterSpacing: 1 }}>{pct}%</span>;
}

function QuestionForm({ initial, cats, onSave, onCancel }) {
  const [q, setQ] = useState(initial);
  const valid = q.text.trim() && q.opts.every(o => o.trim()) && q.catId;
  const inp = (extra = {}) => ({ width: "100%", background: C.surf, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, padding: "10px 12px", fontSize: 14, fontFamily: "'Barlow', sans-serif", outline: "none", boxSizing: "border-box", ...extra });
  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 32 }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 22, padding: 0 }}>←</button>
        <h2 style={{ fontFamily: "Oswald, sans-serif", fontSize: 20, letterSpacing: 2, textTransform: "uppercase", margin: 0, color: C.text }}>{initial.text ? "Éditer la question" : "Nouvelle question"}</h2>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div>
          <FieldLabel>Catégorie *</FieldLabel>
          <select value={q.catId} onChange={e => setQ(x => ({ ...x, catId: e.target.value }))} style={inp()}>
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel>Intitulé de la question *</FieldLabel>
          <textarea value={q.text} onChange={e => setQ(x => ({ ...x, text: e.target.value }))} placeholder="Saisissez la question..." rows={3} style={{ ...inp(), resize: "vertical" }} />
        </div>
        <div>
          <FieldLabel>Options — cliquez la lettre pour marquer la bonne réponse *</FieldLabel>
          {q.opts.map((opt, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center" }}>
              <button onClick={() => setQ(x => ({ ...x, correct: i }))}
                style={{ width: 34, height: 34, flexShrink: 0, border: `2px solid ${q.correct === i ? C.green : C.border}`, borderRadius: 3, background: q.correct === i ? "#0f2a1a" : "transparent", color: q.correct === i ? C.green : C.muted, fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                {LABELS[i]}
              </button>
              <input value={opt} onChange={e => { const o = [...q.opts]; o[i] = e.target.value; setQ(x => ({ ...x, opts: o })); }}
                placeholder={`Réponse ${LABELS[i]}`} style={inp({ border: `1px solid ${q.correct === i ? "#1a4a2a" : C.border}` })} />
            </div>
          ))}
        </div>
        <div>
          <FieldLabel>Explication (optionnel)</FieldLabel>
          <textarea value={q.expl} onChange={e => setQ(x => ({ ...x, expl: e.target.value }))} placeholder="Affichée après la réponse..." rows={2} style={{ ...inp(), resize: "vertical" }} />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={() => valid && onSave(q)} disabled={!valid}
            style={{ background: valid ? C.green : "#252525", color: valid ? "#000" : C.muted, border: "none", borderRadius: 3, padding: "12px 28px", cursor: valid ? "pointer" : "default", fontWeight: 700, fontSize: 14, fontFamily: "'Barlow', sans-serif" }}>
            ✓ Enregistrer
          </button>
          <button onClick={onCancel} style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 3, padding: "12px 24px", cursor: "pointer", fontSize: 14, fontFamily: "'Barlow', sans-serif" }}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

function CategoryForm({ initial, onSave, onCancel }) {
  const [cat, setCat] = useState(initial);
  const valid = cat.name.trim();
  const inp = { width: "100%", background: C.surf, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, padding: "10px 12px", fontSize: 14, fontFamily: "'Barlow', sans-serif", outline: "none", boxSizing: "border-box" };
  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 32 }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 22, padding: 0 }}>←</button>
        <h2 style={{ fontFamily: "Oswald, sans-serif", fontSize: 20, letterSpacing: 2, textTransform: "uppercase", margin: 0, color: C.text }}>{initial.name ? "Éditer la catégorie" : "Nouvelle catégorie"}</h2>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div><FieldLabel>Nom *</FieldLabel><input value={cat.name} onChange={e => setCat(x => ({ ...x, name: e.target.value }))} placeholder="Ex : Sécurité incendie" style={inp} /></div>
        <div><FieldLabel>Description</FieldLabel><input value={cat.desc} onChange={e => setCat(x => ({ ...x, desc: e.target.value }))} placeholder="Courte description..." style={inp} /></div>
        <div>
          <FieldLabel>Couleur d'identification</FieldLabel>
          <div style={{ display: "flex", gap: 10 }}>
            {CAT_COLORS.map(color => (
              <div key={color} onClick={() => setCat(x => ({ ...x, color }))}
                style={{ width: 38, height: 38, borderRadius: 4, background: color, cursor: "pointer", border: cat.color === color ? "3px solid #fff" : "3px solid transparent", boxSizing: "border-box", transition: "all 0.15s" }} />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={() => valid && onSave(cat)} disabled={!valid}
            style={{ background: valid ? C.green : "#252525", color: valid ? "#000" : C.muted, border: "none", borderRadius: 3, padding: "12px 28px", cursor: valid ? "pointer" : "default", fontWeight: 700, fontSize: 14, fontFamily: "'Barlow', sans-serif" }}>
            ✓ Enregistrer
          </button>
          <button onClick={onCancel} style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 3, padding: "12px 24px", cursor: "pointer", fontSize: 14, fontFamily: "'Barlow', sans-serif" }}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState("welcome");
  const [cats, setCats] = useState([]);
  const [qs, setQs] = useState([]);
  const [pw, setPw] = useState(DEFAULT_PW);
  const [allResults, setAllResults] = useState([]);
  const [pseudo, setPseudo] = useState("");
  const [pseudoInput, setPseudoInput] = useState("");
  const [ready, setReady] = useState(false);

  const [loginVal, setLoginVal] = useState("");
  const [loginErr, setLoginErr] = useState(false);
  const [adminTab, setAdminTab] = useState("qs");
  const [editQ, setEditQ] = useState(null);
  const [editCat, setEditCat] = useState(null);
  const [newPwVal, setNewPwVal] = useState("");
  const [pwSaved, setPwSaved] = useState(false);
  const [delConfirm, setDelConfirm] = useState(null);
  const [classFilter, setClassFilter] = useState("all");

  const [examCat, setExamCat] = useState(null);
  const [examList, setExamList] = useState([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(null);
  const [shown, setShown] = useState(false);
  const [log, setLog] = useState([]);

  const myResults = allResults.filter(r => r.pseudo.toLowerCase() === pseudo.toLowerCase());

  useEffect(() => {
    (async () => {
      let c = INIT_CATS, q = INIT_QS, p = DEFAULT_PW, savedPseudo = "", res = [];
      try { const r = await window.storage.get(SK.cats); if (r) c = JSON.parse(r.value); } catch {}
      try { const r = await window.storage.get(SK.qs); if (r) q = JSON.parse(r.value); } catch {}
      try { const r = await window.storage.get(SK.pw); if (r) p = r.value; } catch {}
      try { const r = await window.storage.get(SK.pseudo); if (r) savedPseudo = r.value; } catch {}
      try { const r = await window.storage.get(SK.results, true); if (r) res = JSON.parse(r.value); } catch {}
      setCats(c); setQs(q); setPw(p); setAllResults(res);
      if (savedPseudo) { setPseudo(savedPseudo); setPseudoInput(savedPseudo); setPage("home"); }
      setReady(true);
    })();
    const l = document.createElement("link");
    l.href = "https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Barlow:wght@300;400;500;600&display=swap";
    l.rel = "stylesheet";
    document.head.appendChild(l);
  }, []);

  const persist = async (key, val, shared = false) => { try { await window.storage.set(key, typeof val === "string" ? val : JSON.stringify(val), shared); } catch {} };
  const updateCats = d => { setCats(d); persist(SK.cats, d); };
  const updateQs = d => { setQs(d); persist(SK.qs, d); };
  const updatePw = p => { setPw(p); persist(SK.pw, p); };

  const confirmPseudo = () => {
    const name = pseudoInput.trim();
    if (!name) return;
    setPseudo(name);
    persist(SK.pseudo, name);
    setPage("home");
  };

  const handleLogin = () => {
    if (loginVal === pw) { setPage("admin"); setLoginErr(false); setLoginVal(""); }
    else setLoginErr(true);
  };

  const startExam = (cat) => {
    const list = qs.filter(q => q.catId === cat.id).sort(() => Math.random() - 0.5);
    if (!list.length) return;
    setExamCat(cat); setExamList(list);
    setIdx(0); setPicked(null); setShown(false); setLog([]);
    setPage("exam");
  };

  const validate = () => {
    if (picked === null) return;
    setShown(true);
    setLog(prev => [...prev, { correct: picked === examList[idx].correct }]);
  };

  const nextQ = () => {
    if (idx + 1 >= examList.length) {
      const finalLog = [...log, { correct: picked === examList[idx].correct }];
      const sc = finalLog.filter(x => x.correct).length;
      const result = { id: uid(), pseudo, catId: examCat.id, catName: examCat.name, color: examCat.color, score: sc, total: examList.length, pct: Math.round((sc / examList.length) * 100), ts: Date.now() };
      const updated = [...allResults, result];
      setAllResults(updated);
      persist(SK.results, updated, true);
      setPage("results");
    } else {
      setIdx(i => i + 1); setPicked(null); setShown(false);
    }
  };

  if (!ready) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg, color: C.red, fontFamily: "Oswald, sans-serif", fontSize: 26, letterSpacing: 3 }}>🔥 Chargement...</div>
  );

  // ===== ÉCRAN PSEUDO =====
  if (page === "welcome") return (
    <div style={{ fontFamily: "'Barlow', sans-serif", background: C.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 60, marginBottom: 16, filter: "drop-shadow(0 0 24px rgba(229,62,42,0.5))" }}>🔥</div>
        <h1 style={{ fontFamily: "Oswald, sans-serif", fontSize: "clamp(24px, 6vw, 52px)", fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", margin: 0, color: C.text }}>SAPEURS-POMPIERS</h1>
        <div style={{ fontFamily: "Oswald, sans-serif", color: C.red, letterSpacing: 6, textTransform: "uppercase", fontSize: 13, marginTop: 10, fontWeight: 400 }}>Plateforme d'entraînement · QCM</div>
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderTop: `3px solid ${C.red}`, borderRadius: 4, padding: "40px 36px", width: "100%", maxWidth: 360 }}>
        <p style={{ color: C.muted, fontSize: 14, margin: "0 0 20px", lineHeight: 1.7 }}>Entrez votre prénom ou pseudo pour commencer. Votre progression sera enregistrée et votre historique conservé.</p>
        <FieldLabel>Votre prénom / pseudo</FieldLabel>
        <input value={pseudoInput} onChange={e => setPseudoInput(e.target.value)} onKeyDown={e => e.key === "Enter" && confirmPseudo()}
          placeholder="Ex : Jean, Équipe A, SP12..." autoFocus
          style={{ width: "100%", background: C.surf, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, padding: "12px 14px", fontSize: 16, fontFamily: "'Barlow', sans-serif", outline: "none", boxSizing: "border-box", marginBottom: 16 }}
        />
        <button onClick={confirmPseudo} disabled={!pseudoInput.trim()}
          style={{ width: "100%", background: pseudoInput.trim() ? C.red : "#252525", color: pseudoInput.trim() ? "#fff" : C.muted, border: "none", borderRadius: 3, padding: 14, fontSize: 14, fontWeight: 600, cursor: pseudoInput.trim() ? "pointer" : "default", fontFamily: "'Barlow', sans-serif", letterSpacing: 1 }}>
          COMMENCER →
        </button>
      </div>
      <button onClick={() => setPage("adminLogin")}
        style={{ marginTop: 36, background: "transparent", border: `1px solid #2e2e2e`, color: "#484848", padding: "7px 20px", borderRadius: 3, cursor: "pointer", fontSize: 11, fontFamily: "'Barlow', sans-serif", letterSpacing: 2, textTransform: "uppercase" }}>
        ⚙ Administration
      </button>
    </div>
  );

  // ===== ACCUEIL =====
  if (page === "home") return (
    <div style={{ fontFamily: "'Barlow', sans-serif", background: C.bg, minHeight: "100vh", color: C.text }}>
      <div style={{ background: C.surf, borderBottom: `1px solid ${C.border}`, padding: "0 24px", height: 50, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>🔥</span>
          <span style={{ fontFamily: "Oswald, sans-serif", fontSize: 13, letterSpacing: 3, textTransform: "uppercase" }}>Sapeurs-Pompiers QCM</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: C.muted, fontSize: 13 }}>👤 <strong style={{ color: C.text }}>{pseudo}</strong></span>
          {myResults.length > 0 && (
            <button onClick={() => setPage("history")}
              style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 3, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontFamily: "'Barlow', sans-serif" }}>
              📊 Mon historique
            </button>
          )}
          <button onClick={() => { setPseudoInput(""); setPage("welcome"); }}
            style={{ background: "transparent", border: "none", color: "#444", cursor: "pointer", fontSize: 11, fontFamily: "'Barlow', sans-serif", letterSpacing: 1 }}>
            Changer ↗
          </button>
        </div>
      </div>

      <div style={{ background: "linear-gradient(160deg, #200a04 0%, #0e0e0e 55%)", borderBottom: `1px solid ${C.border}`, padding: "52px 24px 44px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
          <h1 style={{ fontFamily: "Oswald, sans-serif", fontSize: "clamp(22px, 5vw, 48px)", fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", margin: 0 }}>Bonjour, {pseudo} 👋</h1>
          <p style={{ color: C.muted, fontSize: 15, fontWeight: 300, maxWidth: 420, margin: "14px auto 0", lineHeight: 1.8 }}>Choisissez une catégorie pour tester vos connaissances.</p>
          {myResults.length > 0 && (() => {
            const avg = Math.round(myResults.reduce((a, r) => a + r.pct, 0) / myResults.length);
            return (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 14, marginTop: 20, background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: "10px 20px" }}>
                <span style={{ color: C.muted, fontSize: 13 }}>Votre moyenne</span>
                <ScoreBadge pct={avg} />
                <span style={{ color: C.muted, fontSize: 12 }}>sur {myResults.length} examen{myResults.length > 1 ? "s" : ""}</span>
              </div>
            );
          })()}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 28 }}>
          <span style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: C.muted }}>Choisir une catégorie</span>
          <span style={{ color: C.muted, fontSize: 12 }}>{cats.length} disponible{cats.length !== 1 ? "s" : ""}</span>
        </div>
        {cats.length === 0 ? (
          <div style={{ textAlign: "center", color: C.muted, padding: "80px 0" }}><div style={{ fontSize: 40, marginBottom: 14 }}>📋</div>Aucune catégorie disponible.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 18 }}>
            {cats.map(cat => {
              const count = qs.filter(q => q.catId === cat.id).length;
              const catResults = myResults.filter(r => r.catId === cat.id);
              const bestScore = catResults.length ? Math.max(...catResults.map(r => r.pct)) : null;
              const canStart = count > 0;
              return (
                <div key={cat.id} onClick={() => canStart && startExam(cat)}
                  style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${cat.color}`, borderRadius: 4, padding: "22px 20px", cursor: canStart ? "pointer" : "default", opacity: canStart ? 1 : 0.45, transition: "transform 0.15s, background 0.15s" }}
                  onMouseEnter={e => { if (canStart) { e.currentTarget.style.background = "#282828"; e.currentTarget.style.transform = "translateY(-2px)"; } }}
                  onMouseLeave={e => { e.currentTarget.style.background = C.card; e.currentTarget.style.transform = "none"; }}>
                  <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 17, fontWeight: 600, letterSpacing: 0.5, marginBottom: 7 }}>{cat.name}</div>
                  <div style={{ color: C.muted, fontSize: 13, fontWeight: 300, marginBottom: 18, lineHeight: 1.6 }}>{cat.desc}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: cat.color, fontWeight: 600 }}>{count} question{count !== 1 ? "s" : ""}</span>
                    {bestScore !== null ? (
                      <span style={{ fontSize: 11, color: C.muted }}>Meilleur : <strong style={{ color: bestScore >= 70 ? C.green : C.red }}>{bestScore}%</strong></span>
                    ) : canStart ? (
                      <span style={{ fontSize: 10, color: C.muted, letterSpacing: 1.5 }}>COMMENCER ▶</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ textAlign: "center", marginTop: 72, borderTop: `1px solid ${C.border}`, paddingTop: 40 }}>
          <button onClick={() => setPage("adminLogin")}
            style={{ background: "transparent", border: `1px solid #2e2e2e`, color: "#484848", padding: "8px 22px", borderRadius: 3, cursor: "pointer", fontSize: 11, fontFamily: "'Barlow', sans-serif", letterSpacing: 2, textTransform: "uppercase" }}>
            ⚙ Administration
          </button>
        </div>
      </div>
    </div>
  );

  // ===== HISTORIQUE PERSONNEL =====
  if (page === "history") {
    const avg = myResults.length ? Math.round(myResults.reduce((a, r) => a + r.pct, 0) / myResults.length) : 0;
    const best = myResults.length ? Math.max(...myResults.map(r => r.pct)) : 0;
    const sorted = [...myResults].sort((a, b) => b.ts - a.ts);
    return (
      <div style={{ fontFamily: "'Barlow', sans-serif", background: C.bg, minHeight: "100vh", color: C.text }}>
        <div style={{ background: C.surf, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: 52 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setPage("home")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 20, padding: 0 }}>←</button>
            <span style={{ fontFamily: "Oswald, sans-serif", fontSize: 13, letterSpacing: 3, textTransform: "uppercase" }}>Mon historique</span>
          </div>
          <span style={{ color: C.muted, fontSize: 13 }}>👤 {pseudo}</span>
        </div>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 40 }}>
            {[{ label: "Examens passés", val: myResults.length, suf: "", col: C.blue }, { label: "Score moyen", val: avg, suf: "%", col: avg >= 70 ? C.green : avg >= 50 ? C.orange : C.red }, { label: "Meilleur score", val: best, suf: "%", col: best >= 70 ? C.green : best >= 50 ? C.orange : C.red }].map((s, i) => (
              <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: "18px 16px", textAlign: "center" }}>
                <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 32, fontWeight: 700, color: s.col }}>{s.val}{s.suf}</div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: C.muted, marginBottom: 14 }}>Par catégorie</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 36 }}>
            {cats.map(cat => {
              const catRes = myResults.filter(r => r.catId === cat.id);
              if (!catRes.length) return null;
              const catAvg = Math.round(catRes.reduce((a, r) => a + r.pct, 0) / catRes.length);
              return (
                <div key={cat.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${cat.color}`, borderRadius: 3, padding: "12px 16px", display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>{cat.name}</div>
                    <div style={{ background: C.border, borderRadius: 99, height: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${catAvg}%`, background: catAvg >= 70 ? C.green : C.red, borderRadius: 99, transition: "width 0.6s ease" }} />
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <ScoreBadge pct={catAvg} />
                    <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>{catRes.length} tentative{catRes.length > 1 ? "s" : ""}</div>
                  </div>
                </div>
              );
            }).filter(Boolean)}
          </div>

          <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: C.muted, marginBottom: 14 }}>Historique détaillé</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 36 }}>
            {sorted.map(r => (
              <div key={r.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 3, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: r.color || C.red, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{r.catName}</div>
                    <div style={{ color: C.muted, fontSize: 12 }}>{fmtDate(r.ts)}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ color: C.muted, fontSize: 12 }}>{r.score}/{r.total}</span>
                  <ScoreBadge pct={r.pct} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center" }}>
            <button onClick={() => setPage("home")}
              style={{ background: C.red, color: "#fff", border: "none", borderRadius: 3, padding: "12px 28px", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "'Barlow', sans-serif", letterSpacing: 1 }}>
              ← Retour aux catégories
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== LOGIN ADMIN =====
  if (page === "adminLogin") return (
    <div style={{ fontFamily: "'Barlow', sans-serif", background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderTop: `3px solid ${C.red}`, borderRadius: 4, padding: "48px 40px", width: "100%", maxWidth: 340 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 40 }}>🔐</div>
          <h2 style={{ fontFamily: "Oswald, sans-serif", fontSize: 22, fontWeight: 600, letterSpacing: 3, textTransform: "uppercase", color: C.text, margin: "16px 0 6px" }}>Accès Admin</h2>
          <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Zone réservée au créateur</p>
        </div>
        <input type="password" value={loginVal} onChange={e => { setLoginVal(e.target.value); setLoginErr(false); }} onKeyDown={e => e.key === "Enter" && handleLogin()}
          placeholder="Mot de passe"
          style={{ width: "100%", background: C.surf, border: `1px solid ${loginErr ? C.red : C.border}`, borderRadius: 3, color: C.text, padding: "12px 14px", fontSize: 15, fontFamily: "'Barlow', sans-serif", outline: "none", boxSizing: "border-box" }}
        />
        {loginErr && <p style={{ color: C.red, fontSize: 12, margin: "6px 0 0" }}>Mot de passe incorrect.</p>}
        <button onClick={handleLogin}
          style={{ width: "100%", background: C.red, color: "#fff", border: "none", borderRadius: 3, padding: 14, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Barlow', sans-serif", marginTop: 14, letterSpacing: 1 }}>
          CONNEXION
        </button>
        <button onClick={() => setPage(pseudo ? "home" : "welcome")}
          style={{ width: "100%", background: "transparent", color: C.muted, border: "none", padding: "10px", fontSize: 13, cursor: "pointer", fontFamily: "'Barlow', sans-serif", marginTop: 4 }}>
          ← Retour
        </button>
      </div>
    </div>
  );

  // ===== ADMIN PANEL =====
  if (page === "admin") {
    const saveQ = (q) => { updateQs(qs.some(x => x.id === q.id) ? qs.map(x => x.id === q.id ? q : x) : [...qs, q]); setEditQ(null); };
    const delQ = (id) => { updateQs(qs.filter(x => x.id !== id)); setDelConfirm(null); };
    const saveCat = (c) => { updateCats(cats.some(x => x.id === c.id) ? cats.map(x => x.id === c.id ? c : x) : [...cats, c]); setEditCat(null); };
    const delCat = (id) => { updateCats(cats.filter(x => x.id !== id)); updateQs(qs.filter(q => q.catId !== id)); setDelConfirm(null); };

    const filteredResults = classFilter === "all" ? allResults : allResults.filter(r => r.catId === classFilter);
    const pseudos = [...new Set(filteredResults.map(r => r.pseudo))];
    const leaderboard = pseudos.map(p => {
      const pRes = filteredResults.filter(r => r.pseudo === p);
      return { pseudo: p, count: pRes.length, avg: Math.round(pRes.reduce((a, r) => a + r.pct, 0) / pRes.length), best: Math.max(...pRes.map(r => r.pct)), last: Math.max(...pRes.map(r => r.ts)) };
    }).sort((a, b) => b.avg - a.avg);

    return (
      <div style={{ fontFamily: "'Barlow', sans-serif", background: C.bg, minHeight: "100vh", color: C.text }}>
        <div style={{ background: C.surf, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: 52 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>🔥</span>
            <span style={{ fontFamily: "Oswald, sans-serif", fontSize: 13, letterSpacing: 3, textTransform: "uppercase" }}>Administration</span>
            <span style={{ background: C.red, color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 2, marginLeft: 6 }}>ADMIN</span>
          </div>
          <button onClick={() => { setPage(pseudo ? "home" : "welcome"); setEditQ(null); setEditCat(null); }}
            style={{ background: "transparent", color: C.muted, border: "none", cursor: "pointer", fontSize: 13, fontFamily: "'Barlow', sans-serif" }}>← Quitter</button>
        </div>

        <div style={{ background: C.surf, borderBottom: `1px solid ${C.border}`, display: "flex", padding: "0 24px", overflowX: "auto" }}>
          {[["qs", "📋 Questions"], ["cats", "🗂 Catégories"], ["classement", "🏆 Classement"], ["settings", "⚙ Paramètres"]].map(([k, l]) => (
            <button key={k} onClick={() => { setAdminTab(k); setEditQ(null); setEditCat(null); }}
              style={{ background: "none", border: "none", borderBottom: `2px solid ${adminTab === k ? C.red : "transparent"}`, color: adminTab === k ? C.text : C.muted, padding: "14px 16px", cursor: "pointer", fontFamily: "'Barlow', sans-serif", fontWeight: 500, fontSize: 14, transition: "all 0.15s", whiteSpace: "nowrap" }}>
              {l}
            </button>
          ))}
        </div>

        <div style={{ maxWidth: 940, margin: "0 auto", padding: "36px 24px" }}>

          {adminTab === "qs" && !editQ && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                <h2 style={{ fontFamily: "Oswald, sans-serif", fontSize: 18, letterSpacing: 2, textTransform: "uppercase", margin: 0 }}>Questions ({qs.length})</h2>
                <button onClick={() => setEditQ({ id: uid(), catId: cats[0]?.id || "", text: "", opts: ["", "", "", ""], correct: 0, expl: "" })}
                  style={{ background: C.red, color: "#fff", border: "none", borderRadius: 3, padding: "9px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "'Barlow', sans-serif" }}>+ Ajouter</button>
              </div>
              {qs.length === 0 ? <div style={{ textAlign: "center", color: C.muted, padding: "60px 0" }}>Aucune question.</div> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {qs.map(q => {
                    const cat = cats.find(c => c.id === q.catId);
                    return (
                      <div key={q.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 3, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>{q.text}</div>
                          {cat && <span style={{ fontSize: 11, color: cat.color, fontWeight: 600 }}>{cat.name}</span>}
                        </div>
                        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                          <button onClick={() => setEditQ({ ...q })} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 3, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontFamily: "'Barlow', sans-serif" }}>✏ Éditer</button>
                          <button onClick={() => setDelConfirm({ type: "q", id: q.id })} style={{ background: "transparent", border: "1px solid #3a1510", color: "#8a4040", borderRadius: 3, padding: "5px 10px", cursor: "pointer", fontSize: 12 }}>🗑</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {adminTab === "qs" && editQ && <QuestionForm initial={editQ} cats={cats} onSave={saveQ} onCancel={() => setEditQ(null)} />}

          {adminTab === "cats" && !editCat && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                <h2 style={{ fontFamily: "Oswald, sans-serif", fontSize: 18, letterSpacing: 2, textTransform: "uppercase", margin: 0 }}>Catégories ({cats.length})</h2>
                <button onClick={() => setEditCat({ id: uid(), name: "", desc: "", color: "#e53e2a" })}
                  style={{ background: C.red, color: "#fff", border: "none", borderRadius: 3, padding: "9px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "'Barlow', sans-serif" }}>+ Ajouter</button>
              </div>
              {cats.length === 0 ? <div style={{ textAlign: "center", color: C.muted, padding: "60px 0" }}>Aucune catégorie.</div> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {cats.map(cat => {
                    const count = qs.filter(q => q.catId === cat.id).length;
                    return (
                      <div key={cat.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${cat.color}`, borderRadius: 3, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{cat.name}</div>
                          <div style={{ fontSize: 12, color: C.muted }}>{cat.desc} · {count} question{count !== 1 ? "s" : ""}</div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => setEditCat({ ...cat })} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 3, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontFamily: "'Barlow', sans-serif" }}>✏ Éditer</button>
                          <button onClick={() => setDelConfirm({ type: "cat", id: cat.id })} style={{ background: "transparent", border: "1px solid #3a1510", color: "#8a4040", borderRadius: 3, padding: "5px 10px", cursor: "pointer", fontSize: 12 }}>🗑</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {adminTab === "cats" && editCat && <CategoryForm initial={editCat} onSave={saveCat} onCancel={() => setEditCat(null)} />}

          {/* ===== CLASSEMENT ADMIN ===== */}
          {adminTab === "classement" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
                <h2 style={{ fontFamily: "Oswald, sans-serif", fontSize: 18, letterSpacing: 2, textTransform: "uppercase", margin: 0 }}>Classement général</h2>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button onClick={() => setClassFilter("all")}
                    style={{ background: classFilter === "all" ? C.red : "transparent", color: classFilter === "all" ? "#fff" : C.muted, border: `1px solid ${classFilter === "all" ? C.red : C.border}`, borderRadius: 3, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontFamily: "'Barlow', sans-serif" }}>
                    Toutes catégories
                  </button>
                  {cats.map(cat => (
                    <button key={cat.id} onClick={() => setClassFilter(cat.id)}
                      style={{ background: classFilter === cat.id ? cat.color : "transparent", color: classFilter === cat.id ? "#fff" : C.muted, border: `1px solid ${classFilter === cat.id ? cat.color : C.border}`, borderRadius: 3, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontFamily: "'Barlow', sans-serif" }}>
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {allResults.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 32 }}>
                  {[
                    { label: "Participants", val: [...new Set(allResults.map(r => r.pseudo))].length, suf: "", col: C.blue },
                    { label: "Examens passés", val: allResults.length, suf: "", col: C.orange },
                    { label: "Moyenne générale", val: Math.round(allResults.reduce((a, r) => a + r.pct, 0) / allResults.length), suf: "%", col: C.green },
                  ].map((s, i) => (
                    <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: "16px", textAlign: "center" }}>
                      <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 28, fontWeight: 700, color: s.col }}>{s.val}{s.suf}</div>
                      <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {leaderboard.length === 0 ? (
                <div style={{ textAlign: "center", color: C.muted, padding: "60px 0" }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>🏆</div>
                  Aucun résultat enregistré pour le moment.
                </div>
              ) : (
                <>
                  <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: C.muted, marginBottom: 12 }}>Classement par participant</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 36 }}>
                    {leaderboard.map((entry, rank) => {
                      const medal = rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : `#${rank + 1}`;
                      return (
                        <div key={entry.pseudo} style={{ background: C.card, border: `1px solid ${rank === 0 ? "#3a3010" : C.border}`, borderRadius: 3, padding: "14px 18px", display: "flex", alignItems: "center", gap: 16 }}>
                          <span style={{ fontFamily: "Oswald, sans-serif", fontSize: rank < 3 ? 22 : 14, minWidth: 36, color: C.muted, textAlign: "center" }}>{medal}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 5 }}>{entry.pseudo}</div>
                            <div style={{ background: C.border, borderRadius: 99, height: 4, overflow: "hidden", maxWidth: 200 }}>
                              <div style={{ height: "100%", width: `${entry.avg}%`, background: entry.avg >= 70 ? C.green : C.red, borderRadius: 99 }} />
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <ScoreBadge pct={entry.avg} />
                            <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>{entry.count} essai{entry.count > 1 ? "s" : ""} · meilleur {entry.best}%</div>
                            <div style={{ color: "#444", fontSize: 10, marginTop: 2 }}>{timeAgo(entry.last)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: C.muted, marginBottom: 12 }}>Toutes les tentatives</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {[...filteredResults].sort((a, b) => b.ts - a.ts).map(r => (
                      <div key={r.id} style={{ background: C.surf, border: `1px solid ${C.border}`, borderRadius: 3, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: r.color || C.red, flexShrink: 0 }} />
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{r.pseudo}</span>
                          <span style={{ color: C.muted, fontSize: 12 }}>→ {r.catName}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <span style={{ color: C.muted, fontSize: 11 }}>{fmtDate(r.ts)}</span>
                          <span style={{ color: C.muted, fontSize: 12 }}>{r.score}/{r.total}</span>
                          <ScoreBadge pct={r.pct} />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {adminTab === "settings" && (
            <div style={{ maxWidth: 440 }}>
              <h2 style={{ fontFamily: "Oswald, sans-serif", fontSize: 18, letterSpacing: 2, textTransform: "uppercase", marginBottom: 28 }}>Paramètres</h2>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: 24, marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 15 }}>Changer le mot de passe admin</div>
                <input type="password" value={newPwVal} onChange={e => { setNewPwVal(e.target.value); setPwSaved(false); }} placeholder="Nouveau mot de passe (min. 4 car.)"
                  style={{ width: "100%", background: C.surf, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, padding: "10px 12px", fontSize: 14, fontFamily: "'Barlow', sans-serif", outline: "none", boxSizing: "border-box", marginBottom: 12 }}
                />
                {pwSaved && <div style={{ color: C.green, fontSize: 13, marginBottom: 10 }}>✓ Mot de passe mis à jour !</div>}
                <button onClick={() => { if (newPwVal.length >= 4) { updatePw(newPwVal); setNewPwVal(""); setPwSaved(true); } }}
                  style={{ background: C.red, color: "#fff", border: "none", borderRadius: 3, padding: "10px 22px", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "'Barlow', sans-serif" }}>
                  Enregistrer
                </button>
              </div>
              <div style={{ background: "#1a1208", border: "1px solid #3a2810", borderRadius: 4, padding: "14px 16px" }}>
                <div style={{ color: "#d97706", fontSize: 13 }}>⚠ Mot de passe actuel : <strong>{pw}</strong></div>
                <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>Conservez-le précieusement — aucune récupération possible.</div>
              </div>
            </div>
          )}
        </div>

        {delConfirm && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 24 }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderTop: `3px solid ${C.red}`, borderRadius: 4, padding: 32, maxWidth: 360, width: "100%" }}>
              <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 19, marginBottom: 12 }}>Confirmer la suppression</div>
              <p style={{ color: C.muted, fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>
                {delConfirm.type === "cat" ? "⚠ Supprimer cette catégorie supprimera également toutes ses questions associées." : "Cette action est irréversible."}
              </p>
              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={() => delConfirm.type === "q" ? delQ(delConfirm.id) : delCat(delConfirm.id)}
                  style={{ flex: 1, background: C.red, color: "#fff", border: "none", borderRadius: 3, padding: "11px", cursor: "pointer", fontWeight: 600, fontFamily: "'Barlow', sans-serif" }}>Supprimer</button>
                <button onClick={() => setDelConfirm(null)}
                  style={{ flex: 1, background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 3, padding: "11px", cursor: "pointer", fontFamily: "'Barlow', sans-serif" }}>Annuler</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===== EXAMEN =====
  if (page === "exam") {
    const q = examList[idx];
    const isCorrect = picked === q.correct;
    return (
      <div style={{ fontFamily: "'Barlow', sans-serif", background: C.bg, minHeight: "100vh", color: C.text }}>
        <div style={{ height: 3, background: C.border }}>
          <div style={{ height: "100%", background: C.red, width: `${(idx / examList.length) * 100}%`, transition: "width 0.4s ease" }} />
        </div>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "48px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 52 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: examCat?.color }} />
              <span style={{ color: C.muted, fontSize: 13 }}>{examCat?.name}</span>
            </div>
            <span style={{ fontFamily: "Oswald, sans-serif", color: C.muted, fontSize: 14, letterSpacing: 1 }}>{idx + 1} / {examList.length}</span>
          </div>
          <div style={{ fontFamily: "Oswald, sans-serif", fontSize: "clamp(17px, 3.2vw, 23px)", fontWeight: 500, lineHeight: 1.5, marginBottom: 38 }}>{q.text}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 28 }}>
            {q.opts.map((opt, i) => {
              let bg = C.card, brd = `1px solid ${C.border}`, clr = C.text;
              if (!shown && picked === i) { bg = "#16182a"; brd = `1px solid #5060bb`; }
              if (shown) {
                if (i === q.correct) { bg = "#0c2418"; brd = `1px solid ${C.green}`; clr = C.green; }
                else if (i === picked) { bg = "#280c0c"; brd = `1px solid ${C.red}`; clr = C.red; }
              }
              return (
                <div key={i} onClick={() => !shown && setPicked(i)}
                  style={{ background: bg, border: brd, borderRadius: 4, padding: "15px 18px", cursor: shown ? "default" : "pointer", transition: "all 0.12s", display: "flex", alignItems: "center", gap: 14, color: clr }}>
                  <span style={{ fontFamily: "Oswald, sans-serif", fontSize: 13, fontWeight: 700, minWidth: 22, color: shown && i === q.correct ? C.green : shown && i === picked ? C.red : "#4a4a4a" }}>{LABELS[i]}</span>
                  <span style={{ fontSize: 15, flex: 1 }}>{opt}</span>
                  {shown && i === q.correct && <span style={{ color: C.green, fontWeight: 700 }}>✓</span>}
                  {shown && i === picked && i !== q.correct && <span style={{ color: C.red, fontWeight: 700 }}>✗</span>}
                </div>
              );
            })}
          </div>
          {shown && q.expl && (
            <div style={{ background: isCorrect ? "#0a2018" : "#200d08", border: `1px solid ${isCorrect ? "#1e4a2e" : "#4a2010"}`, borderRadius: 4, padding: "15px 18px", marginBottom: 24 }}>
              <div style={{ color: isCorrect ? C.green : C.orange, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{isCorrect ? "✓ Bonne réponse !" : "✗ Mauvaise réponse"}</div>
              <div style={{ color: C.muted, fontSize: 14, lineHeight: 1.65 }}>{q.expl}</div>
            </div>
          )}
          {!shown ? (
            <button onClick={validate} disabled={picked === null}
              style={{ width: "100%", background: picked !== null ? C.red : "#1e1e1e", color: picked !== null ? "#fff" : "#3a3a3a", border: "none", borderRadius: 4, padding: 15, fontSize: 14, fontWeight: 600, cursor: picked !== null ? "pointer" : "default", fontFamily: "'Barlow', sans-serif", letterSpacing: 1.5, transition: "background 0.15s" }}>
              VALIDER
            </button>
          ) : (
            <button onClick={nextQ}
              style={{ width: "100%", background: C.red, color: "#fff", border: "none", borderRadius: 4, padding: 15, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Barlow', sans-serif", letterSpacing: 1.5 }}>
              {idx + 1 >= examList.length ? "VOIR LES RÉSULTATS →" : "SUIVANT →"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ===== RÉSULTATS =====
  if (page === "results") {
    const finalScore = log.filter(x => x.correct).length;
    const total = examList.length;
    const pct = Math.round((finalScore / total) * 100);
    const passed = pct >= 70;
    const emoji = pct >= 90 ? "🏆" : pct >= 70 ? "✅" : pct >= 50 ? "⚠️" : "❌";
    const verdict = pct >= 90 ? "Excellent !" : pct >= 70 ? "Réussi" : pct >= 50 ? "À améliorer" : "Insuffisant";
    return (
      <div style={{ fontFamily: "'Barlow', sans-serif", background: C.bg, minHeight: "100vh", color: C.text }}>
        <div style={{ maxWidth: 620, margin: "0 auto", padding: "60px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 54, marginBottom: 16 }}>{emoji}</div>
          <div style={{ fontFamily: "Oswald, sans-serif", fontSize: "clamp(52px, 14vw, 88px)", fontWeight: 700, color: passed ? C.green : C.red, lineHeight: 1 }}>{pct}%</div>
          <div style={{ color: C.muted, fontSize: 16, marginTop: 10 }}>{finalScore} / {total} bonnes réponses</div>
          <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 16, letterSpacing: 4, textTransform: "uppercase", color: passed ? C.green : C.red, marginTop: 14 }}>{verdict}</div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 6 }}>Résultat enregistré pour <strong style={{ color: C.text }}>{pseudo}</strong></div>
          <div style={{ background: C.border, borderRadius: 99, height: 6, margin: "32px auto", maxWidth: 280, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: passed ? C.green : C.red, borderRadius: 99, transition: "width 0.9s ease" }} />
          </div>
          <div style={{ textAlign: "left", marginBottom: 36 }}>
            {examList.map((q, i) => {
              const ok = log[i]?.correct;
              return (
                <div key={q.id} style={{ display: "flex", gap: 12, padding: "13px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: ok ? C.green : C.red, fontSize: 15, flexShrink: 0, marginTop: 2, fontWeight: 700 }}>{ok ? "✓" : "✗"}</span>
                  <div>
                    <div style={{ fontSize: 13, color: ok ? C.text : "#888", lineHeight: 1.5 }}>{q.text}</div>
                    {!ok && <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Réponse correcte : <strong style={{ color: C.text }}>{q.opts[q.correct]}</strong></div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => startExam(examCat)}
              style={{ background: C.red, color: "#fff", border: "none", borderRadius: 3, padding: "12px 24px", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "'Barlow', sans-serif", letterSpacing: 1 }}>🔄 Recommencer</button>
            <button onClick={() => setPage("history")}
              style={{ background: "transparent", color: C.text, border: `1px solid ${C.border}`, borderRadius: 3, padding: "12px 24px", cursor: "pointer", fontSize: 13, fontFamily: "'Barlow', sans-serif" }}>📊 Mon historique</button>
            <button onClick={() => setPage("home")}
              style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 3, padding: "12px 24px", cursor: "pointer", fontSize: 13, fontFamily: "'Barlow', sans-serif" }}>← Accueil</button>
          </div>
        </div>
      </div>
    );
  }
}