import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const C = {
  bg:"#06060a", surf:"#0e0e14", card:"#13131a", card2:"#18181f",
  border:"#1e1e28", border2:"#26262f", red:"#e8392a", redDim:"#b82e20",
  orange:"#f07320", green:"#16a34a", greenL:"#22c55e",
  blue:"#2563eb", blueL:"#3b82f6", purple:"#7c3aed", purpleL:"#a855f7",
  yellow:"#ca8a04", yellowL:"#eab308",
  text:"#e8e6e1", text2:"#a8a5a0", muted:"#5e5b56", faint:"#1c1c24",
};
const CAT_COLORS = ["#e8392a","#f07320","#eab308","#22c55e","#3b82f6","#a855f7"];
const LABELS = ["A","B","C","D"];
const DOC_TYPES = [
  { key:"source",     label:"Sources",     icon:"🔗", color:C.blueL },
  { key:"fiche_memo", label:"Fiches mémo", icon:"📋", color:C.purpleL },
];

// Examen Blanc : max 40 questions, timer global 60 minutes
const EXAMEN_BLANC_MAX = 40;
const EXAMEN_BLANC_TIMER = 60 * 60; // secondes
const EXAM_COUNTS = [10, 20, 30];
const TIMER_DEFAULT = 30; // secondes par question (modes cat/révision)

const AUTH_ERRORS = {
  "Invalid login credentials":"Email ou mot de passe incorrect.",
  "Email not confirmed":"Confirmez votre email avant de vous connecter.",
  "User already registered":"Un compte existe déjà avec cet email.",
  "Password should be at least 6 characters":"Mot de passe trop court (min. 6 caractères).",
  "Unable to validate email address: invalid format":"Format d'email invalide.",
  "signup is disabled":"Les inscriptions sont désactivées.",
  "Email rate limit exceeded":"Trop de tentatives. Réessayez dans quelques minutes.",
  "New password should be different from the old password":"Le nouveau mot de passe doit être différent de l'ancien.",
};
const tr = msg => AUTH_ERRORS[msg] || msg;

const fmtDate = ts => new Date(ts).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
const timeAgo = ts => {
  const s = Math.floor((Date.now()-new Date(ts).getTime())/1000);
  if(s<60) return "À l'instant";
  if(s<3600) return `il y a ${Math.floor(s/60)} min`;
  if(s<86400) return `il y a ${Math.floor(s/3600)}h`;
  return `il y a ${Math.floor(s/86400)}j`;
};
const fmtTimer = s => {
  const m = Math.floor(s/60);
  const sec = s%60;
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
};
const pct2col = p => p>=70 ? C.greenL : p>=50 ? C.orange : C.red;

// ─── BADGE HELPERS ───────────────────────────────────────────────
const _weeklyExams = r => {
  const week=7*24*3600*1000;
  return r.filter(x=>Date.now()-new Date(x.created_at).getTime()<week).length;
};
const _consecutiveDays = r => {
  if(!r.length) return 0;
  const days=[...new Set(r.map(x=>new Date(x.created_at).toDateString()))].sort((a,b)=>new Date(a)-new Date(b));
  let max=1,cur=1;
  for(let i=1;i<days.length;i++){
    if(Math.round((new Date(days[i])-new Date(days[i-1]))/86400000)<=1){cur++;max=Math.max(max,cur);}else cur=1;
  }
  return max;
};
const _maxCatProgress = r => {
  const bc={};
  r.forEach(x=>{if(!x.cat_id)return;if(!bc[x.cat_id])bc[x.cat_id]=[];bc[x.cat_id].push(x);});
  let max=0;
  Object.values(bc).forEach(rs=>{
    if(rs.length<2)return;
    const s=rs.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
    max=Math.max(max,s[s.length-1].pct-s[0].pct);
  });
  return max;
};
const _hasRebound = r => {
  const bc={};
  r.forEach(x=>{if(!x.cat_id)return;if(!bc[x.cat_id])bc[x.cat_id]=[];bc[x.cat_id].push(x);});
  return Object.values(bc).some(rs=>{
    const s=rs.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
    let fail=false;
    for(const x of s){if(x.pct<50)fail=true;if(fail&&x.pct>=70)return true;}
    return false;
  });
};
const _dailyCount = r => {
  const today=new Date().toDateString();
  return r.filter(x=>new Date(x.created_at).toDateString()===today).length;
};

// ─── GRADES & BADGES ─────────────────────────────────────────────
const BADGES = [
  // GRADES POMPIERS — progression exponentielle
  { id:"g1",  icon:"🟦", name:"JSP",                    grade:true, desc:"1 examen complété",                                                                          color:"#6b7280", check:(s)=>s.total>=1 },
  { id:"g2",  icon:"🔴", name:"Sapeur 2e classe",         grade:true, desc:"3 examens · moy. ≥ 40%",                                                                     color:"#e8392a", check:(s)=>s.total>=3&&s.avg>=40 },
  { id:"g3",  icon:"🔴🔴",name:"Sapeur 1re classe",       grade:true, desc:"10 examens · moy. ≥ 50%",                                                                    color:"#e8392a", check:(s)=>s.total>=10&&s.avg>=50 },
  { id:"g4",  icon:"⚡",  name:"Caporal",                 grade:true, desc:"25 examens · moy. ≥ 55% · 200 bonnes rép.",                                                  color:"#e8392a", check:(s)=>s.total>=25&&s.avg>=55&&s.correct>=200 },
  { id:"g5",  icon:"⚡⚡", name:"Caporal-chef",            grade:true, desc:"50 examens · moy. ≥ 60% · 500 bonnes rép.",                                                  color:"#f07320", check:(s)=>s.total>=50&&s.avg>=60&&s.correct>=500 },
  { id:"g6",  icon:"📍",  name:"Sergent",                 grade:true, desc:"100 examens · moy. ≥ 65% · 1 500 bonnes rép.",                                               color:"#f07320", check:(s)=>s.total>=100&&s.avg>=65&&s.correct>=1500 },
  { id:"g7",  icon:"📍📍", name:"Sergent-chef",            grade:true, desc:"200 examens · moy. ≥ 70% · 3 000 bonnes rép.",                                               color:"#eab308", check:(s)=>s.total>=200&&s.avg>=70&&s.correct>=3000 },
  { id:"g8",  icon:"🏅",  name:"Adjudant",                grade:true, desc:"350 examens · moy. ≥ 73% · 5 500 bonnes rép.",                                               color:"#eab308", check:(s)=>s.total>=350&&s.avg>=73&&s.correct>=5500 },
  { id:"g9",  icon:"🏅⭐", name:"Adjudant-chef",           grade:true, desc:"500 examens · moy. ≥ 76% · 8 000 bonnes rép. · 10 parfaits",                                color:"#94a3b8", check:(s)=>s.total>=500&&s.avg>=76&&s.correct>=8000&&s.perfects>=10 },
  { id:"g10", icon:"⭐",  name:"Lieutenant",              grade:true, desc:"750 examens · moy. ≥ 79% · 12 000 bonnes rép. · 25 parfaits",                               color:"#94a3b8", check:(s)=>s.total>=750&&s.avg>=79&&s.correct>=12000&&s.perfects>=25 },
  { id:"g11", icon:"⭐⭐", name:"Capitaine",               grade:true, desc:"1 000 examens · moy. ≥ 82% · 18 000 bonnes rép. · 50 parfaits",                            color:"#94a3b8", check:(s)=>s.total>=1000&&s.avg>=82&&s.correct>=18000&&s.perfects>=50 },
  { id:"g12", icon:"🌟",  name:"Commandant",              grade:true, desc:"1 500 examens · moy. ≥ 85% · 28 000 bonnes rép. · 100 parfaits",                           color:"#b87333", check:(s)=>s.total>=1500&&s.avg>=85&&s.correct>=28000&&s.perfects>=100 },
  { id:"g13", icon:"🌟🌟", name:"Lieutenant-colonel",     grade:true, desc:"2 500 examens · moy. ≥ 88% · 45 000 bonnes rép. · 200 parfaits",                           color:"#b87333", check:(s)=>s.total>=2500&&s.avg>=88&&s.correct>=45000&&s.perfects>=200 },
  { id:"g14", icon:"👑",  name:"Colonel",                 grade:true, desc:"4 000 examens · moy. ≥ 91% · 70 000 bonnes rép. · 350 parfaits",                           color:"#eab308", check:(s)=>s.total>=4000&&s.avg>=91&&s.correct>=70000&&s.perfects>=350 },
  { id:"g15", icon:"💫💫", name:"Contrôleur général",     grade:true, desc:"6 000 examens · moy. ≥ 95% · 100 000 bonnes rép. · 500 parfaits",                          color:"#eab308", check:(s)=>s.total>=6000&&s.avg>=95&&s.correct>=100000&&s.perfects>=500 },
  { id:"g16", icon:"💎",  name:"Contrôleur gén. d'État",  grade:true, desc:"10 000 examens · moy. ≥ 98% · 150 000 bonnes rép. · 1 000 parfaits",                       color:"#e8392a", check:(s)=>s.total>=10000&&s.avg>=98&&s.correct>=150000&&s.perfects>=1000 },

  // ── BONNES RÉPONSES — 8 niveaux exponentiels ─────────────────
  { id:"r1", icon:"🎯", name:"Tireur",           fam:"rép", tier:1, desc:"50 bonnes réponses",          color:"#6b7280", check:(s)=>s.correct>=50 },
  { id:"r2", icon:"🎯", name:"Précis",            fam:"rép", tier:2, desc:"200 bonnes réponses",         color:"#cd7f32", check:(s)=>s.correct>=200 },
  { id:"r3", icon:"🎯", name:"Sniper",            fam:"rép", tier:3, desc:"500 bonnes réponses",         color:"#94a3b8", check:(s)=>s.correct>=500 },
  { id:"r4", icon:"🎯", name:"Expert",            fam:"rép", tier:4, desc:"1 000 bonnes réponses",       color:"#eab308", check:(s)=>s.correct>=1000 },
  { id:"r5", icon:"🎯", name:"Maître Tireur",     fam:"rép", tier:5, desc:"2 500 bonnes réponses",       color:"#06b6d4", check:(s)=>s.correct>=2500 },
  { id:"r6", icon:"🎯", name:"Légende",           fam:"rép", tier:6, desc:"5 000 bonnes réponses",       color:"#a855f7", check:(s)=>s.correct>=5000 },
  { id:"r7", icon:"🎯", name:"Indestructible",    fam:"rép", tier:7, desc:"10 000 bonnes réponses",      color:"#e8392a", check:(s)=>s.correct>=10000 },
  { id:"r8", icon:"🎯", name:"Mythique",          fam:"rép", tier:8, desc:"25 000 bonnes réponses",      color:"#f07320", check:(s)=>s.correct>=25000 },

  // ── EXAMENS RÉALISÉS — 8 niveaux ────────────────────────────
  { id:"e1", icon:"📋", name:"Recrue",            fam:"exm", tier:1, desc:"5 examens réalisés",          color:"#6b7280", check:(s)=>s.total>=5 },
  { id:"e2", icon:"📋", name:"Engagé",            fam:"exm", tier:2, desc:"15 examens",                  color:"#cd7f32", check:(s)=>s.total>=15 },
  { id:"e3", icon:"📋", name:"Régulier",          fam:"exm", tier:3, desc:"40 examens",                  color:"#94a3b8", check:(s)=>s.total>=40 },
  { id:"e4", icon:"📋", name:"Assidu",            fam:"exm", tier:4, desc:"100 examens",                 color:"#eab308", check:(s)=>s.total>=100 },
  { id:"e5", icon:"📋", name:"Vétéran",           fam:"exm", tier:5, desc:"250 examens",                 color:"#06b6d4", check:(s)=>s.total>=250 },
  { id:"e6", icon:"📋", name:"Aguerri",           fam:"exm", tier:6, desc:"500 examens",                 color:"#a855f7", check:(s)=>s.total>=500 },
  { id:"e7", icon:"📋", name:"Élite",             fam:"exm", tier:7, desc:"1 000 examens",               color:"#e8392a", check:(s)=>s.total>=1000 },
  { id:"e8", icon:"📋", name:"Intouchable",       fam:"exm", tier:8, desc:"2 500 examens",               color:"#f07320", check:(s)=>s.total>=2500 },

  // ── EXAMENS PARFAITS 100% — 7 niveaux ───────────────────────
  { id:"p1", icon:"💯", name:"Première Flamme",   fam:"prf", tier:1, desc:"1 examen à 100%",             color:"#6b7280", check:(s)=>s.perfects>=1 },
  { id:"p2", icon:"💯", name:"Flamme Pure",        fam:"prf", tier:2, desc:"5 examens à 100%",            color:"#cd7f32", check:(s)=>s.perfects>=5 },
  { id:"p3", icon:"💯", name:"Sans Faute",         fam:"prf", tier:3, desc:"15 examens à 100%",           color:"#94a3b8", check:(s)=>s.perfects>=15 },
  { id:"p4", icon:"💯", name:"Perfection",         fam:"prf", tier:4, desc:"40 examens à 100%",           color:"#eab308", check:(s)=>s.perfects>=40 },
  { id:"p5", icon:"💯", name:"Absolu",             fam:"prf", tier:5, desc:"100 examens à 100%",          color:"#06b6d4", check:(s)=>s.perfects>=100 },
  { id:"p6", icon:"💯", name:"Divin",              fam:"prf", tier:6, desc:"300 examens à 100%",          color:"#a855f7", check:(s)=>s.perfects>=300 },
  { id:"p7", icon:"💯", name:"Au-delà du Bien",    fam:"prf", tier:7, desc:"750 examens à 100%",          color:"#e8392a", check:(s)=>s.perfects>=750 },

  // ── EXCELLENCE ≥ 90% — 6 niveaux ────────────────────────────
  { id:"n1", icon:"⭐", name:"Prometteur",         fam:"exc", tier:1, desc:"5 examens à 90%+",            color:"#6b7280", check:(s)=>s.above90>=5 },
  { id:"n2", icon:"⭐", name:"Brillant",           fam:"exc", tier:2, desc:"20 examens à 90%+",           color:"#cd7f32", check:(s)=>s.above90>=20 },
  { id:"n3", icon:"⭐", name:"Distingué",          fam:"exc", tier:3, desc:"60 examens à 90%+",           color:"#94a3b8", check:(s)=>s.above90>=60 },
  { id:"n4", icon:"⭐", name:"Exceptionnel",       fam:"exc", tier:4, desc:"150 examens à 90%+",          color:"#eab308", check:(s)=>s.above90>=150 },
  { id:"n5", icon:"⭐", name:"Élite des Élites",   fam:"exc", tier:5, desc:"400 examens à 90%+",          color:"#06b6d4", check:(s)=>s.above90>=400 },
  { id:"n6", icon:"⭐", name:"Intouchable",        fam:"exc", tier:6, desc:"1 000 examens à 90%+",        color:"#a855f7", check:(s)=>s.above90>=1000 },

  // ── RÉUSSITE ≥ 80% — 5 niveaux ──────────────────────────────
  { id:"q1", icon:"🔥", name:"Solide",             fam:"80p", tier:1, desc:"10 examens à 80%+",           color:"#6b7280", check:(s)=>s.above80>=10 },
  { id:"q2", icon:"🔥", name:"Performant",         fam:"80p", tier:2, desc:"40 examens à 80%+",           color:"#cd7f32", check:(s)=>s.above80>=40 },
  { id:"q3", icon:"🔥", name:"Irréprochable",      fam:"80p", tier:3, desc:"120 examens à 80%+",          color:"#94a3b8", check:(s)=>s.above80>=120 },
  { id:"q4", icon:"🔥", name:"Invaincu",           fam:"80p", tier:4, desc:"350 examens à 80%+",          color:"#eab308", check:(s)=>s.above80>=350 },
  { id:"q5", icon:"🔥", name:"Phénomène",          fam:"80p", tier:5, desc:"800 examens à 80%+",          color:"#06b6d4", check:(s)=>s.above80>=800 },

  // ── ASSIDUITÉ — JOURS CONSÉCUTIFS — 6 niveaux ───────────────
  { id:"d1", icon:"📅", name:"Régulier",           fam:"day", tier:1, desc:"3 jours consécutifs",         color:"#6b7280", check:(s,c,r)=>_consecutiveDays(r)>=3 },
  { id:"d2", icon:"📅", name:"Dévoué",             fam:"day", tier:2, desc:"7 jours consécutifs",         color:"#cd7f32", check:(s,c,r)=>_consecutiveDays(r)>=7 },
  { id:"d3", icon:"📅", name:"Persévérant",        fam:"day", tier:3, desc:"14 jours consécutifs",        color:"#94a3b8", check:(s,c,r)=>_consecutiveDays(r)>=14 },
  { id:"d4", icon:"📅", name:"Intransigeant",      fam:"day", tier:4, desc:"30 jours consécutifs",        color:"#eab308", check:(s,c,r)=>_consecutiveDays(r)>=30 },
  { id:"d5", icon:"📅", name:"Inconditionnel",     fam:"day", tier:5, desc:"60 jours consécutifs",        color:"#06b6d4", check:(s,c,r)=>_consecutiveDays(r)>=60 },
  { id:"d6", icon:"📅", name:"Légionnaire",        fam:"day", tier:6, desc:"100 jours consécutifs",       color:"#a855f7", check:(s,c,r)=>_consecutiveDays(r)>=100 },

  // ── CADENCE HEBDOMADAIRE — 4 niveaux ────────────────────────
  { id:"w1", icon:"⚡", name:"Actif",              fam:"wkl", tier:1, desc:"5 examens en une semaine",    color:"#6b7280", check:(s,c,r)=>_weeklyExams(r)>=5 },
  { id:"w2", icon:"⚡", name:"Intensif",           fam:"wkl", tier:2, desc:"10 examens en une semaine",   color:"#cd7f32", check:(s,c,r)=>_weeklyExams(r)>=10 },
  { id:"w3", icon:"⚡", name:"Turbo",              fam:"wkl", tier:3, desc:"20 examens en une semaine",   color:"#94a3b8", check:(s,c,r)=>_weeklyExams(r)>=20 },
  { id:"w4", icon:"⚡", name:"Machine de Guerre",  fam:"wkl", tier:4, desc:"50 examens en une semaine",   color:"#eab308", check:(s,c,r)=>_weeklyExams(r)>=50 },

  // ── CATÉGORIES MAÎTRISÉES (moy ≥ 80%) — 4 niveaux ──────────
  { id:"m1", icon:"🏆", name:"Spécialiste",        fam:"cat", tier:1, desc:"1 catégorie maîtrisée (moy. ≥ 80%)",       color:"#cd7f32", check:(s,c,r)=>_masteredCats(r)>=1 },
  { id:"m2", icon:"🏆", name:"Polyvalent",         fam:"cat", tier:2, desc:"2 catégories maîtrisées",                   color:"#94a3b8", check:(s,c,r)=>_masteredCats(r)>=2 },
  { id:"m3", icon:"🏆", name:"Encyclopédiste",     fam:"cat", tier:3, desc:"3 catégories maîtrisées",                   color:"#eab308", check:(s,c,r)=>_masteredCats(r)>=3 },
  { id:"m4", icon:"🏆", name:"Omniscient",         fam:"cat", tier:4, desc:"Toutes les catégories maîtrisées",          color:"#e8392a", check:(s,cats,r)=>cats.length>0&&_masteredCats(r)>=cats.length },

  // ── PROGRESSION SUR UNE CATÉGORIE — 4 niveaux ───────────────
  { id:"g_1", icon:"📈", name:"En Progression",    fam:"prg", tier:1, desc:"Progression de +10 pts sur une catégorie", color:"#6b7280", check:(s,c,r)=>_maxCatProgress(r)>=10 },
  { id:"g_2", icon:"📈", name:"Montée en Flèche",  fam:"prg", tier:2, desc:"Progression de +20 pts",                   color:"#cd7f32", check:(s,c,r)=>_maxCatProgress(r)>=20 },
  { id:"g_3", icon:"📈", name:"Ascension",         fam:"prg", tier:3, desc:"Progression de +35 pts",                   color:"#94a3b8", check:(s,c,r)=>_maxCatProgress(r)>=35 },
  { id:"g_4", icon:"📈", name:"Transformation",    fam:"prg", tier:4, desc:"Progression de +50 pts",                   color:"#eab308", check:(s,c,r)=>_maxCatProgress(r)>=50 },

  // ── BADGES SPÉCIAUX ──────────────────────────────────────────
  { id:"x1", icon:"💪", name:"Résilient",          desc:"Réussir ≥70% après un échec <50% dans une catégorie",         color:"#f07320", check:(s,c,r)=>_hasRebound(r) },
  { id:"x2", icon:"📝", name:"As de l'Examen Blanc",desc:"Score parfait sur un Examen Blanc",                          color:"#e8392a", check:(s,c,r)=>r.some(x=>x.cat_name==="Examen Blanc"&&x.pct===100) },
  { id:"x3", icon:"🌙", name:"Journée Marathon",   desc:"3 examens dans la même journée",                              color:"#7c3aed", check:(s,c,r)=>_dailyCount(r)>=3 },
  { id:"x4", icon:"🚒", name:"Toujours Debout",    desc:"10 examens consécutifs tous ≥ 60%",                           color:"#e8392a", check:(s,c,r)=>{const l=r.slice(-10);return l.length===10&&l.every(x=>x.pct>=60);} },
  { id:"x5", icon:"🔭", name:"Visionnaire",        desc:"Moyenne générale ≥ 90% sur 10+ examens",                     color:"#a855f7", check:(s)=>s.avg>=90&&s.total>=10 },
  { id:"x6", icon:"🌐", name:"Explorateur",        desc:"Au moins 1 examen dans chaque catégorie",                    color:"#3b82f6", check:(s,cats)=>cats.length>0&&s.uniqueCats>=cats.length },
];

const _masteredCats = (results, threshold=80) => {
  const bc={};
  results.forEach(r=>{if(!r.cat_id)return;if(!bc[r.cat_id])bc[r.cat_id]=[];bc[r.cat_id].push(r);});
  return Object.values(bc).filter(rs=>Math.round(rs.reduce((a,r)=>a+r.pct,0)/rs.length)>=threshold).length;
};

// ─── BADGES DYNAMIQUES PAR CATÉGORIE ────────────────────────────
// Appelée pour chaque catégorie — génère automatiquement les mêmes
// familles de badges que les badges globaux, filtrés sur cat.id
const generateCatBadges = cat => {
  const cr = r => r.filter(x=>x.cat_id===cat.id);
  const col = cat.color;
  return [
    // 🎯 Bonnes réponses (5 niveaux)
    { id:`c_${cat.id}_r1`, icon:"🎯", fam:"c_rép", tier:1, catId:cat.id, name:"Tireur",           desc:`20 bonnes rép. en ${cat.name}`,     color:col, check:(s,c,r)=>cr(r).reduce((a,x)=>a+(x.score||0),0)>=20 },
    { id:`c_${cat.id}_r2`, icon:"🎯", fam:"c_rép", tier:2, catId:cat.id, name:"Précis",            desc:`75 bonnes rép. en ${cat.name}`,     color:col, check:(s,c,r)=>cr(r).reduce((a,x)=>a+(x.score||0),0)>=75 },
    { id:`c_${cat.id}_r3`, icon:"🎯", fam:"c_rép", tier:3, catId:cat.id, name:"Sniper",            desc:`200 bonnes rép. en ${cat.name}`,    color:col, check:(s,c,r)=>cr(r).reduce((a,x)=>a+(x.score||0),0)>=200 },
    { id:`c_${cat.id}_r4`, icon:"🎯", fam:"c_rép", tier:4, catId:cat.id, name:"Expert",            desc:`500 bonnes rép. en ${cat.name}`,    color:col, check:(s,c,r)=>cr(r).reduce((a,x)=>a+(x.score||0),0)>=500 },
    { id:`c_${cat.id}_r5`, icon:"🎯", fam:"c_rép", tier:5, catId:cat.id, name:"Légende",           desc:`1 000 bonnes rép. en ${cat.name}`,  color:col, check:(s,c,r)=>cr(r).reduce((a,x)=>a+(x.score||0),0)>=1000 },
    // 📋 Examens réalisés (5 niveaux)
    { id:`c_${cat.id}_e1`, icon:"📋", fam:"c_exm", tier:1, catId:cat.id, name:"Recrue",            desc:`3 examens en ${cat.name}`,          color:col, check:(s,c,r)=>cr(r).length>=3 },
    { id:`c_${cat.id}_e2`, icon:"📋", fam:"c_exm", tier:2, catId:cat.id, name:"Engagé",            desc:`10 examens en ${cat.name}`,         color:col, check:(s,c,r)=>cr(r).length>=10 },
    { id:`c_${cat.id}_e3`, icon:"📋", fam:"c_exm", tier:3, catId:cat.id, name:"Régulier",          desc:`25 examens en ${cat.name}`,         color:col, check:(s,c,r)=>cr(r).length>=25 },
    { id:`c_${cat.id}_e4`, icon:"📋", fam:"c_exm", tier:4, catId:cat.id, name:"Vétéran",           desc:`60 examens en ${cat.name}`,         color:col, check:(s,c,r)=>cr(r).length>=60 },
    { id:`c_${cat.id}_e5`, icon:"📋", fam:"c_exm", tier:5, catId:cat.id, name:"Élite",             desc:`150 examens en ${cat.name}`,        color:col, check:(s,c,r)=>cr(r).length>=150 },
    // 💯 Parfaits 100% (4 niveaux)
    { id:`c_${cat.id}_p1`, icon:"💯", fam:"c_prf", tier:1, catId:cat.id, name:"1ère Flamme",       desc:`1 examen à 100% en ${cat.name}`,    color:col, check:(s,c,r)=>cr(r).filter(x=>x.pct===100).length>=1 },
    { id:`c_${cat.id}_p2`, icon:"💯", fam:"c_prf", tier:2, catId:cat.id, name:"Sans Faute",        desc:`5 examens à 100% en ${cat.name}`,   color:col, check:(s,c,r)=>cr(r).filter(x=>x.pct===100).length>=5 },
    { id:`c_${cat.id}_p3`, icon:"💯", fam:"c_prf", tier:3, catId:cat.id, name:"Perfection",        desc:`15 examens à 100% en ${cat.name}`,  color:col, check:(s,c,r)=>cr(r).filter(x=>x.pct===100).length>=15 },
    { id:`c_${cat.id}_p4`, icon:"💯", fam:"c_prf", tier:4, catId:cat.id, name:"Absolu",            desc:`40 examens à 100% en ${cat.name}`,  color:col, check:(s,c,r)=>cr(r).filter(x=>x.pct===100).length>=40 },
    // ⭐ Excellence ≥90% (4 niveaux)
    { id:`c_${cat.id}_n1`, icon:"⭐", fam:"c_exc", tier:1, catId:cat.id, name:"Prometteur",        desc:`3 examens à 90%+ en ${cat.name}`,   color:col, check:(s,c,r)=>cr(r).filter(x=>x.pct>=90).length>=3 },
    { id:`c_${cat.id}_n2`, icon:"⭐", fam:"c_exc", tier:2, catId:cat.id, name:"Brillant",          desc:`10 examens à 90%+ en ${cat.name}`,  color:col, check:(s,c,r)=>cr(r).filter(x=>x.pct>=90).length>=10 },
    { id:`c_${cat.id}_n3`, icon:"⭐", fam:"c_exc", tier:3, catId:cat.id, name:"Distingué",         desc:`30 examens à 90%+ en ${cat.name}`,  color:col, check:(s,c,r)=>cr(r).filter(x=>x.pct>=90).length>=30 },
    { id:`c_${cat.id}_n4`, icon:"⭐", fam:"c_exc", tier:4, catId:cat.id, name:"Exceptionnel",      desc:`75 examens à 90%+ en ${cat.name}`,  color:col, check:(s,c,r)=>cr(r).filter(x=>x.pct>=90).length>=75 },
    // 🔥 Réussite ≥80% (3 niveaux)
    { id:`c_${cat.id}_q1`, icon:"🔥", fam:"c_80p", tier:1, catId:cat.id, name:"Solide",            desc:`5 examens à 80%+ en ${cat.name}`,   color:col, check:(s,c,r)=>cr(r).filter(x=>x.pct>=80).length>=5 },
    { id:`c_${cat.id}_q2`, icon:"🔥", fam:"c_80p", tier:2, catId:cat.id, name:"Performant",        desc:`20 examens à 80%+ en ${cat.name}`,  color:col, check:(s,c,r)=>cr(r).filter(x=>x.pct>=80).length>=20 },
    { id:`c_${cat.id}_q3`, icon:"🔥", fam:"c_80p", tier:3, catId:cat.id, name:"Irréprochable",     desc:`50 examens à 80%+ en ${cat.name}`,  color:col, check:(s,c,r)=>cr(r).filter(x=>x.pct>=80).length>=50 },
    // 📈 Progression (3 niveaux)
    { id:`c_${cat.id}_g1`, icon:"📈", fam:"c_prg", tier:1, catId:cat.id, name:"En Progression",    desc:`+15 pts de progression en ${cat.name}`, color:col,
      check:(s,c,r)=>{const rs=cr(r).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));return rs.length>=2&&rs[rs.length-1].pct-rs[0].pct>=15;} },
    { id:`c_${cat.id}_g2`, icon:"📈", fam:"c_prg", tier:2, catId:cat.id, name:"Ascension",         desc:`+30 pts de progression en ${cat.name}`, color:col,
      check:(s,c,r)=>{const rs=cr(r).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));return rs.length>=2&&rs[rs.length-1].pct-rs[0].pct>=30;} },
    { id:`c_${cat.id}_g3`, icon:"📈", fam:"c_prg", tier:3, catId:cat.id, name:"Transformation",    desc:`+50 pts de progression en ${cat.name}`, color:col,
      check:(s,c,r)=>{const rs=cr(r).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));return rs.length>=2&&rs[rs.length-1].pct-rs[0].pct>=50;} },
  ];
};

const getAllBadges = cats => [...BADGES, ...cats.flatMap(c=>generateCatBadges(c))];

const computeStats = results => ({
  total:      results.length,
  correct:    results.reduce((a,r)=>a+(r.score||0),0),
  avg:        results.length ? Math.round(results.reduce((a,r)=>a+r.pct,0)/results.length) : 0,
  perfect:    results.some(r=>r.pct===100),
  perfects:   results.filter(r=>r.pct===100).length,
  above90:    results.filter(r=>r.pct>=90).length,
  above80:    results.filter(r=>r.pct>=80).length,
  uniqueCats: new Set(results.map(r=>r.cat_id).filter(Boolean)).size,
});
const getUnlocked = (results, cats) => {
  const s = computeStats(results);
  return getAllBadges(cats).filter(b=>b.check(s, cats, results));
};

// ─── UI ──────────────────────────────────────────────────────────
const FL = ({children}) => (
  <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8,fontFamily:"'Barlow',sans-serif"}}>{children}</label>
);
const Field = ({value,onChange,placeholder,type="text",rows,onKeyDown,autoFocus,disabled}) => {
  const s={width:"100%",background:C.surf,border:`1px solid ${C.border2}`,borderRadius:4,color:C.text,padding:"11px 14px",fontSize:14,fontFamily:"'Barlow',sans-serif",outline:"none",boxSizing:"border-box",opacity:disabled?0.6:1};
  if(rows) return <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows} disabled={disabled} style={{...s,resize:"vertical"}}/>;
  return <input type={type} value={value} onChange={onChange} placeholder={placeholder} onKeyDown={onKeyDown} autoFocus={autoFocus} disabled={disabled} style={s}/>;
};
const Btn = ({onClick,children,color=C.red,disabled,full,ghost,sm,danger}) => {
  const bg=danger?"#3a0e0a":ghost?"transparent":disabled?"#16161c":color;
  const col=danger?C.red:ghost?C.muted:disabled?"#40404a":(color===C.greenL||color===C.green?"#000":"#fff");
  return <button onClick={onClick} disabled={disabled} style={{width:full?"100%":undefined,background:bg,color:col,border:ghost?`1px solid ${C.border2}`:danger?`1px solid #5a1e18`:"none",borderRadius:4,padding:sm?"5px 14px":"11px 24px",cursor:disabled?"default":"pointer",fontWeight:700,fontSize:sm?12:14,fontFamily:"'Barlow',sans-serif",transition:"all 0.15s",boxShadow:(!ghost&&!disabled&&!danger)?`0 2px 12px ${color}33`:"none",display:"inline-flex",alignItems:"center",gap:6}}>{children}</button>;
};
const ScorePill = ({pct,lg}) => {
  const col=pct2col(pct);
  return <span style={{fontSize:lg?26:13,padding:lg?"8px 18px":"3px 10px",color:col,border:`1px solid ${col}44`,borderRadius:4,fontFamily:"Oswald,sans-serif",fontWeight:700,background:col+"14"}}>{pct}%</span>;
};
const Topbar = ({title,back,right}) => (
  <div style={{background:C.surf+"ee",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",height:56,position:"sticky",top:0,zIndex:100,backdropFilter:"blur(12px)"}}>
    <div style={{display:"flex",alignItems:"center",gap:12}}>
      {back&&<button onClick={back} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18,padding:"4px 8px 4px 0"}} onMouseEnter={e=>e.currentTarget.style.color=C.text} onMouseLeave={e=>e.currentTarget.style.color=C.muted}>←</button>}
      <span style={{fontFamily:"Oswald,sans-serif",fontSize:13,letterSpacing:3,textTransform:"uppercase"}}>{title}</span>
    </div>
    <div style={{display:"flex",alignItems:"center",gap:8}}>{right}</div>
  </div>
);
const Wrap = ({children}) => <div style={{fontFamily:"'Barlow',sans-serif",background:C.bg,minHeight:"100vh",color:C.text}}>{children}</div>;
const ErrBox = ({msg}) => msg?<div style={{color:"#fca5a5",fontSize:13,background:"rgba(220,38,38,0.08)",border:"1px solid rgba(220,38,38,0.25)",borderRadius:4,padding:"10px 14px",marginBottom:12,lineHeight:1.5}}>{msg}</div>:null;
const OkBox  = ({msg}) => msg?<div style={{color:"#86efac",fontSize:13,background:"rgba(22,163,74,0.08)",border:"1px solid rgba(22,163,74,0.25)",borderRadius:4,padding:"10px 14px",marginBottom:12}}>{msg}</div>:null;
const StatCard = ({label,value,color=C.text}) => (
  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:"18px 20px",textAlign:"center"}}>
    <div style={{fontFamily:"Oswald,sans-serif",fontSize:32,fontWeight:700,color,lineHeight:1}}>{value}</div>
    <div style={{color:C.text2,fontSize:12,marginTop:6}}>{label}</div>
  </div>
);
// ─── INSIGNE SVG PAR GRADE ───────────────────────────────────────
const GradeInsignia = ({ id, unlocked, size=52 }) => {
  const W=56, H=56, bg="#1c1c26", clipId=`gi-${id}`;

  // Chevron diagonal (/), cx = centre en x à mi-hauteur
  const Diag = ({cx, color, sw=7, bColor}) => {
    const x0=cx-H/2, ext=14;
    return (
      <g>
        {bColor&&<line x1={x0-ext} y1={H+ext} x2={x0+H+ext} y2={-ext} stroke={bColor} strokeWidth={sw+4} strokeLinecap="butt"/>}
        <line x1={x0-ext} y1={H+ext} x2={x0+H+ext} y2={-ext} stroke={color} strokeWidth={sw} strokeLinecap="butt"/>
      </g>
    );
  };

  // Bande horizontale
  const Horiz = ({y, color, h=5}) => (
    <rect x={7} y={y-h/2} width={W-14} height={h} fill={color} rx={0.5}/>
  );

  // Flocon de neige (contrôleur général)
  const Flake = ({cx, cy, r=8, color}) => (
    <g>
      {[0,1,2,3,4,5].map(i=>{
        const a=i*Math.PI/3;
        const ex=cx+Math.cos(a)*r, ey=cy+Math.sin(a)*r;
        const mx=cx+Math.cos(a)*r*0.55, my=cy+Math.sin(a)*r*0.55;
        return (
          <g key={i}>
            <line x1={cx} y1={cy} x2={ex} y2={ey} stroke={color} strokeWidth={1.6} strokeLinecap="round"/>
            <line x1={mx+Math.cos(a+Math.PI/2)*r*0.22} y1={my+Math.sin(a+Math.PI/2)*r*0.22} x2={mx} y2={my} stroke={color} strokeWidth={1.1} strokeLinecap="round"/>
            <line x1={mx+Math.cos(a-Math.PI/2)*r*0.22} y1={my+Math.sin(a-Math.PI/2)*r*0.22} x2={mx} y2={my} stroke={color} strokeWidth={1.1} strokeLinecap="round"/>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={1.8} fill={color}/>
    </g>
  );

  // n chevrons équirépartis
  const nDiag = (n, color, sw, bColor) =>
    Array.from({length:n},(_,i) => <Diag key={i} cx={W*(i+1)/(n+1)} color={color} sw={sw} bColor={bColor}/>);

  // n bandes horizontales équiréparties
  const nHoriz = (n, colFn, h=5) =>
    Array.from({length:n},(_,i) => <Horiz key={i} y={H*(i+1)/(n+1)} color={typeof colFn==="function"?colFn(i,n):colFn} h={h}/>);

  const insignia = () => {
    switch(id){
      case "g1":  // JSP — carré bleu
        return <rect x={11} y={11} width={W-22} height={H-22} fill="#4f7be8" rx={2}/>;
      case "g2":  // Sapeur 2e — fond noir uni, aucune bande
        return null;
      case "g3":  // Sapeur 1re — 1 chevron rouge
        return nDiag(1,"#e8392a",8);
      case "g4":  // Caporal — 2 chevrons rouges
        return nDiag(2,"#e8392a",7);
      case "g5":  // Caporal-chef — 3 chevrons rouges
        return nDiag(3,"#e8392a",6);
      case "g6":  // Sergent — 1 chevron blanc liseré rouge
        return nDiag(1,"#e8e6e1",9,"#e8392a");
      case "g7":  // Sergent-chef — 3 chevrons blancs liserés rouge
        return nDiag(3,"#e8e6e1",7,"#e8392a");
      case "g8":  // Adjudant — 1 bande orange + liseré rouge au centre
        return (
          <g>
            <Horiz y={H/2} color="#f07320" h={10}/>
            <Horiz y={H/2} color="#e8392a" h={2}/>
          </g>
        );
      case "g9":  // Adjudant-chef — 1 bande blanche + liseré rouge au centre
        return (
          <g>
            <Horiz y={H/2} color="#e8e6e1" h={10}/>
            <Horiz y={H/2} color="#e8392a" h={2}/>
          </g>
        );
      case "g10": // Lieutenant — 2 bandes blanches
        return nHoriz(2,"#e8e6e1",5);
      case "g11": // Capitaine — 3 bandes blanches
        return nHoriz(3,"#e8e6e1",5);
      case "g12": // Commandant — 4 bandes blanches
        return nHoriz(4,"#e8e6e1",4);
      case "g13": // Lieutenant-colonel — 5 bandes alternées blanc/or
        return nHoriz(5,(i)=>i%2===0?"#e8e6e1":"#eab308",4);
      case "g14": // Colonel — 5 bandes blanches
        return nHoriz(5,"#e8e6e1",4);
      case "g15": // Contrôleur général — 2 flocons argentés
        return [W*0.32, W*0.68].map((cx,i)=><Flake key={i} cx={cx} cy={H/2} r={9} color="#c0c8d8"/>);
      case "g16": // Contrôleur général d'État — 3 flocons argentés
        return [W*0.2, W*0.5, W*0.8].map((cx,i)=><Flake key={i} cx={cx} cy={H/2} r={8} color="#c0c8d8"/>);
      default: return null;
    }
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={size} height={size} style={{display:"block"}}>
      <defs>
        <clipPath id={clipId}><rect width={W} height={H} rx={3}/></clipPath>
      </defs>
      {/* Fond */}
      <rect width={W} height={H} fill={bg} rx={3}/>
      {/* Bordure externe (liseré métallique) */}
      <rect x={0.5} y={0.5} width={W-1} height={H-1} fill="none" stroke={unlocked?"#3a3a4a":"#1e1e24"} strokeWidth={1} rx={3}/>
      {/* Insigne (clippé) */}
      <g clipPath={`url(#${clipId})`} opacity={unlocked?1:0.28}>
        {insignia()}
      </g>
      {/* Reflet subtil si débloqué */}
      {unlocked&&<rect x={0} y={0} width={W} height={H/2} fill="url(#shine)" rx={3} opacity={0.04}/>}
    </svg>
  );
};

const BadgeCard = ({badge, unlocked}) => (
  <div title={badge.desc} style={{background:unlocked?C.card:C.surf, border:`1px solid ${unlocked?badge.color+"44":C.border}`, borderRadius:6, padding:"10px 8px", textAlign:"center", opacity:unlocked?1:0.35, transition:"all 0.2s", position:"relative", overflow:"hidden", cursor:"default"}}>
    {unlocked&&<div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 50% 0%, ${badge.color}18 0%, transparent 65%)`}}/>}
    {/* Insigne SVG pour les grades, emoji pour les badges thématiques */}
    <div style={{display:"flex",justifyContent:"center",marginBottom:6}}>
      {badge.grade
        ? <GradeInsignia id={badge.id} unlocked={unlocked} size={48}/>
        : <div style={{fontSize:24,filter:unlocked?`drop-shadow(0 0 5px ${badge.color}88)`:"none"}}>{badge.icon}</div>
      }
    </div>
    <div style={{fontSize:9,fontWeight:700,color:unlocked?badge.color:C.muted,fontFamily:"Oswald,sans-serif",letterSpacing:0.8,textTransform:"uppercase",lineHeight:1.3}}>{badge.name}</div>
    {unlocked&&<div style={{width:16,height:2,borderRadius:99,background:badge.color,margin:"5px auto 0",boxShadow:`0 0 5px ${badge.color}`}}/>}
  </div>
);

// ─── FORMULAIRES ─────────────────────────────────────────────────
function QForm({initial,cats,qs,onSave,onCancel,saving,saveErr}) {
  const [q,setQ]=useState(initial);
  const valid=q.text?.trim()&&q.catId&&q.opts?.every(o=>o?.trim());
  return (
    <div style={{maxWidth:700}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
        <button onClick={onCancel} style={{background:C.card,border:`1px solid ${C.border2}`,color:C.text2,cursor:"pointer",width:34,height:34,borderRadius:4,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
        <h2 style={{fontFamily:"Oswald,sans-serif",fontSize:18,letterSpacing:2,textTransform:"uppercase",margin:0}}>{qs.some(x=>x.id===initial?.id)?"Éditer la question":"Nouvelle question"}</h2>
      </div>
      <ErrBox msg={saveErr}/>
      <div style={{display:"flex",flexDirection:"column",gap:20}}>
        <div><FL>Catégorie *</FL>
          <select value={q.catId} onChange={e=>setQ(x=>({...x,catId:e.target.value}))} style={{width:"100%",background:C.surf,border:`1px solid ${C.border2}`,borderRadius:4,color:C.text,padding:"11px 14px",fontSize:14,fontFamily:"'Barlow',sans-serif",outline:"none"}}>
            {cats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div><FL>Intitulé *</FL><Field value={q.text||""} onChange={e=>setQ(x=>({...x,text:e.target.value}))} placeholder="Saisissez votre question..." rows={3}/></div>
        <div>
          <FL>Options — cliquez la lettre pour définir la bonne réponse *</FL>
          {(q.opts||[]).map((opt,i)=>(
            <div key={i} style={{display:"flex",gap:10,marginBottom:10,alignItems:"center"}}>
              <button onClick={()=>setQ(x=>({...x,correct:i}))} style={{width:36,height:36,flexShrink:0,border:`2px solid ${q.correct===i?C.greenL:C.border2}`,borderRadius:4,background:q.correct===i?"#0a2214":"transparent",color:q.correct===i?C.greenL:C.muted,fontFamily:"Oswald,sans-serif",fontWeight:700,fontSize:13,cursor:"pointer",transition:"all 0.15s"}}>{LABELS[i]}</button>
              <input value={opt||""} onChange={e=>{const o=[...q.opts];o[i]=e.target.value;setQ(x=>({...x,opts:o}));}} placeholder={`Réponse ${LABELS[i]}`} style={{flex:1,background:C.surf,border:`1px solid ${q.correct===i?"#1a4a28":C.border2}`,borderRadius:4,color:C.text,padding:"10px 14px",fontSize:14,fontFamily:"'Barlow',sans-serif",outline:"none"}}/>
            </div>
          ))}
        </div>
        <div><FL>Explication (optionnel)</FL><Field value={q.expl||""} onChange={e=>setQ(x=>({...x,expl:e.target.value}))} placeholder="Affichée après la réponse..." rows={2}/></div>
        <div style={{display:"flex",gap:12}}><Btn onClick={()=>valid&&onSave(q)} disabled={!valid||saving} color={C.greenL}>{saving?"Enregistrement...":"✓ Enregistrer"}</Btn><Btn onClick={onCancel} ghost>Annuler</Btn></div>
      </div>
    </div>
  );
}

function CatForm({initial,cats,onSave,onCancel,saving,saveErr}) {
  const [cat,setCat]=useState(initial);
  const valid=cat.name?.trim();
  return (
    <div style={{maxWidth:500}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
        <button onClick={onCancel} style={{background:C.card,border:`1px solid ${C.border2}`,color:C.text2,cursor:"pointer",width:34,height:34,borderRadius:4,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
        <h2 style={{fontFamily:"Oswald,sans-serif",fontSize:18,letterSpacing:2,textTransform:"uppercase",margin:0}}>{cats.some(c=>c.id===initial?.id)?"Éditer":"Nouvelle catégorie"}</h2>
      </div>
      <ErrBox msg={saveErr}/>
      <div style={{display:"flex",flexDirection:"column",gap:18}}>
        <div><FL>Nom *</FL><Field value={cat.name||""} onChange={e=>setCat(x=>({...x,name:e.target.value}))} placeholder="Ex : Sécurité incendie"/></div>
        <div><FL>Description</FL><Field value={cat.desc||""} onChange={e=>setCat(x=>({...x,desc:e.target.value}))} placeholder="Courte description..."/></div>
        <div><FL>Couleur</FL>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {CAT_COLORS.map(col=><div key={col} onClick={()=>setCat(x=>({...x,color:col}))} style={{width:40,height:40,borderRadius:6,background:col,cursor:"pointer",border:cat.color===col?"3px solid #fff":"3px solid transparent",boxSizing:"border-box",transition:"all 0.15s",boxShadow:cat.color===col?`0 0 12px ${col}88`:"none"}}/>)}
          </div>
        </div>
        <div style={{display:"flex",gap:12}}><Btn onClick={()=>valid&&onSave(cat)} disabled={!valid||saving} color={C.greenL}>{saving?"Enregistrement...":"✓ Enregistrer"}</Btn><Btn onClick={onCancel} ghost>Annuler</Btn></div>
      </div>
    </div>
  );
}

function DocForm({initial,cats,docs,onSave,onCancel,saving,saveErr}) {
  const [d,setD]=useState(initial);
  const [file,setFile]=useState(null);
  const [upl,setUpl]=useState(false);
  const fileRef=useRef();
  const valid=d.title?.trim()&&d.catId&&d.type;
  return (
    <div style={{maxWidth:600}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
        <button onClick={onCancel} style={{background:C.card,border:`1px solid ${C.border2}`,color:C.text2,cursor:"pointer",width:34,height:34,borderRadius:4,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
        <h2 style={{fontFamily:"Oswald,sans-serif",fontSize:18,letterSpacing:2,textTransform:"uppercase",margin:0}}>{docs.some(x=>x.id===initial?.id)?"Éditer le document":"Nouveau document"}</h2>
      </div>
      <ErrBox msg={saveErr}/>
      <div style={{display:"flex",flexDirection:"column",gap:18}}>
        <div><FL>Catégorie *</FL>
          <select value={d.catId} onChange={e=>setD(x=>({...x,catId:e.target.value}))} style={{width:"100%",background:C.surf,border:`1px solid ${C.border2}`,borderRadius:4,color:C.text,padding:"11px 14px",fontSize:14,fontFamily:"'Barlow',sans-serif",outline:"none"}}>
            {cats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div><FL>Type *</FL>
          <div style={{display:"flex",gap:10}}>
            {DOC_TYPES.map(t=>(
              <button key={t.key} onClick={()=>setD(x=>({...x,type:t.key}))} style={{flex:1,background:d.type===t.key?t.color+"20":"transparent",color:d.type===t.key?t.color:C.muted,border:`1px solid ${d.type===t.key?t.color:C.border2}`,borderRadius:4,padding:"10px 14px",cursor:"pointer",fontFamily:"'Barlow',sans-serif",fontWeight:700,fontSize:14,transition:"all 0.15s"}}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
        <div><FL>Titre *</FL><Field value={d.title||""} onChange={e=>setD(x=>({...x,title:e.target.value}))} placeholder="Ex : Référentiel national secours"/></div>
        <div><FL>Description (optionnel)</FL><Field value={d.description||""} onChange={e=>setD(x=>({...x,description:e.target.value}))} placeholder="Courte description..." rows={2}/></div>
        <div><FL>Fichier ou lien</FL>
          <div onClick={()=>fileRef.current.click()} style={{border:`2px dashed ${file?C.greenL:C.border2}`,borderRadius:4,padding:"18px",textAlign:"center",cursor:"pointer",marginBottom:12,background:file?"#081e1044":"transparent",transition:"all 0.2s"}}>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={e=>{const f=e.target.files[0];if(f){setFile(f);setD(x=>({...x,url:""}));}}} style={{display:"none"}}/>
            {file?<span style={{color:C.greenL,fontSize:13}}>📄 {file.name}</span>:<span style={{color:C.muted,fontSize:13}}>📁 Cliquer pour uploader un fichier (PDF, image…)</span>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}><div style={{flex:1,height:1,background:C.border}}/><span style={{color:C.muted,fontSize:12}}>ou</span><div style={{flex:1,height:1,background:C.border}}/></div>
          <Field value={d.url||""} onChange={e=>{setD(x=>({...x,url:e.target.value}));setFile(null);}} placeholder="Coller un lien (Google Drive, site web…)"/>
        </div>
        <div style={{display:"flex",gap:12}}><Btn onClick={()=>valid&&onSave(d,file,setUpl)} disabled={!valid||saving||upl} color={C.greenL}>{upl?"Upload en cours...":(saving?"Enregistrement...":"✓ Enregistrer")}</Btn><Btn onClick={onCancel} ghost>Annuler</Btn></div>
      </div>
    </div>
  );
}

// ─── APP ─────────────────────────────────────────────────────────
export default function App() {
  const [page,setPage]           = useState("boot");
  const [user,setUser]           = useState(null);
  const [isAdmin,setIsAdmin]     = useState(false);
  const [pseudo,setPseudo]       = useState("");

  const [cats,setCats]           = useState([]);
  const [qs,setQs]               = useState([]);
  const [docs,setDocs]           = useState([]);
  const [myResults,setMyResults] = useState([]);
  const [allResults,setAllResults] = useState([]);
  const [wrongIds,setWrongIds]   = useState(new Set());

  const [authMode,setAuthMode]   = useState("login");
  const [aEmail,setAEmail]       = useState("");
  const [aPw,setAPw]             = useState("");
  const [aPseudo,setAPseudo]     = useState("");
  const [aErr,setAErr]           = useState("");
  const [aBusy,setABusy]         = useState(false);

  const [adminTab,setAdminTab]       = useState("qs");
  const [editQ,setEditQ]             = useState(null);
  const [editCat,setEditCat]         = useState(null);
  const [editDoc,setEditDoc]         = useState(null);
  const [delConfirm,setDelConfirm]   = useState(null);
  const [saving,setSaving]           = useState(false);
  const [saveErr,setSaveErr]         = useState("");
  const [classFilter,setClassFilter] = useState("all");

  // Recherche admin questions
  const [qSearch,setQSearch]         = useState("");
  const [qCatFilter,setQCatFilter]   = useState("all");
  const [qSort,setQSort]             = useState("date"); // "date" | "cat" | "alpha"

  const [resCat,setResCat]       = useState("all");

  const [newPseudo,setNewPseudo] = useState(""); const [pseudoOk,setPseudoOk] = useState(false);
  const [newPw,setNewPw]         = useState(""); const [newPw2,setNewPw2]     = useState("");
  const [pwOk,setPwOk]           = useState(false); const [pwErr,setPwErr]   = useState("");

  // Exam state
  const [examCat,setExamCat]     = useState(null);
  const [examMode,setExamMode]   = useState("cat");
  const [examList,setExamList]   = useState([]);
  const [examIdx,setExamIdx]     = useState(0);
  const [picked,setPicked]       = useState(null);
  const [shown,setShown]         = useState(false);
  const [log,setLog]             = useState([]);
  const answersRef               = useRef([]);

  // Pre-exam
  const [preExam,setPreExam]     = useState(null);
  const [examCount,setExamCount] = useState(20);
  const [timerOn,setTimerOn]     = useState(false);

  // Timers
  const [timeLeft,setTimeLeft]   = useState(TIMER_DEFAULT);    // par question
  const [globalTime,setGlobalTime] = useState(EXAMEN_BLANC_TIMER); // global examen blanc
  const timerRef                 = useRef(null);
  const globalTimerRef           = useRef(null);

  const [newBadges,setNewBadges] = useState([]);

  // ── BOOT ─────────────────────────────────────────────────────
  useEffect(()=>{
    if(!document.querySelector("#gf-sp")){
      const l=document.createElement("link");l.id="gf-sp";l.rel="stylesheet";
      l.href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Barlow:wght@300;400;500;600;700&display=swap";
      document.head.appendChild(l);
    }
    let handled=false;
    sb.auth.getSession().then(({data:{session}})=>{
      if(session?.user&&!handled){handled=true;onSession(session.user);}
      else if(!session) setPage("auth");
    }).catch(()=>setPage("auth"));
    const {data:{subscription}}=sb.auth.onAuthStateChange(async(event,session)=>{
      if(event==="SIGNED_OUT"){handled=false;setUser(null);setIsAdmin(false);setPseudo("");setPage("auth");}
      else if(event==="SIGNED_IN"&&session?.user&&!handled){handled=true;await onSession(session.user);}
    });
    return ()=>subscription.unsubscribe();
  },[]);

  // Timer par question (modes cat et révision)
  useEffect(()=>{
    if(page!=="exam"||examMode==="all"||!timerOn||shown) return;
    setTimeLeft(TIMER_DEFAULT);
    timerRef.current=setInterval(()=>{
      setTimeLeft(t=>{ if(t<=1){clearInterval(timerRef.current);return 0;} return t-1; });
    },1000);
    return ()=>clearInterval(timerRef.current);
  },[examIdx,page,timerOn,examMode]);

  useEffect(()=>{ if(timerOn&&shown) clearInterval(timerRef.current); },[shown]);
  useEffect(()=>{ if(timerOn&&timeLeft===0&&!shown&&examMode!=="all") doValidate(-1); },[timeLeft]);

  // Timer global Examen Blanc (60 min)
  useEffect(()=>{
    if(page!=="exam"||examMode!=="all") return;
    globalTimerRef.current=setInterval(()=>{
      setGlobalTime(t=>{
        if(t<=1){
          clearInterval(globalTimerRef.current);
          // Forcer fin de l'examen
          finishExam();
          return 0;
        }
        return t-1;
      });
    },1000);
    return ()=>clearInterval(globalTimerRef.current);
  },[page,examMode]);

  // Avertissement quitter
  useEffect(()=>{
    if(page==="exam"){
      const h=e=>{e.preventDefault();e.returnValue="";};
      window.addEventListener("beforeunload",h);
      return ()=>window.removeEventListener("beforeunload",h);
    }
  },[page]);

  // ── SESSION ──────────────────────────────────────────────────
  const onSession = async u=>{
    try{
      setUser(u);
      const {data:prof}=await sb.from("profiles").select("*").eq("id",u.id).single();
      if(prof){setIsAdmin(prof.is_admin);setPseudo(prof.pseudo||u.email.split("@")[0]);}
      else setPseudo(u.email.split("@")[0]);
      await Promise.all([loadData(),loadMyResults(u.id)]);
      setPage("home");
    }catch(e){console.error(e);setPage("auth");}
  };

  const loadData=async()=>{
    const [cR,qR,dR]=await Promise.all([
      sb.from("categories").select("*").order("created_at"),
      sb.from("questions").select("*").order("created_at"),
      sb.from("documents").select("*").order("created_at"),
    ]);
    if(cR.data) setCats(cR.data.map(c=>({id:c.id,name:c.name,desc:c.description,color:c.color})));
    if(qR.data) setQs(qR.data.map(q=>({id:q.id,catId:q.cat_id,text:q.text,opts:q.options,correct:q.correct_index,expl:q.explanation})));
    if(dR.data) setDocs(dR.data.map(d=>({id:d.id,catId:d.cat_id,title:d.title,type:d.type,description:d.description,url:d.url})));
  };

  const loadMyResults=async uid=>{
    const {data}=await sb.from("results").select("*").eq("user_id",uid).order("created_at",{ascending:false});
    if(data) setMyResults(data);
    try{const stored=JSON.parse(localStorage.getItem(`wrong_${uid}`)||"[]");setWrongIds(new Set(stored));}catch{}
  };

  const loadAllResults=async()=>{
    const {data}=await sb.from("results").select("*").order("created_at",{ascending:false}).limit(500);
    if(data) setAllResults(data);
  };

  // ── AUTH ─────────────────────────────────────────────────────
  const doAuth=async()=>{
    setAErr("");setABusy(true);
    try{
      if(authMode==="login"){
        const {error}=await sb.auth.signInWithPassword({email:aEmail,password:aPw});
        if(error) setAErr(tr(error.message));
      } else {
        if(!aPseudo.trim()){setAErr("Veuillez entrer un prénom ou pseudo.");setABusy(false);return;}
        const {data,error}=await sb.auth.signUp({email:aEmail,password:aPw,options:{data:{pseudo:aPseudo.trim()}}});
        if(error) setAErr(tr(error.message));
        else if(!data.session) setAErr("✓ Compte créé ! Connectez-vous maintenant.");
      }
    }catch(e){setAErr(tr(e.message));}
    setABusy(false);
  };
  const doLogout=()=>sb.auth.signOut();

  // ── CRUD ─────────────────────────────────────────────────────
  const saveCat=async data=>{
    setSaving(true);setSaveErr("");
    const payload={name:data.name,description:data.desc||"",color:data.color};
    if(cats.some(c=>c.id===data.id)){
      const {error}=await sb.from("categories").update(payload).eq("id",data.id);
      if(!error){setCats(p=>p.map(c=>c.id===data.id?{...c,...data}:c));setEditCat(null);}
      else setSaveErr(error.message);
    } else {
      const {data:nc,error}=await sb.from("categories").insert(payload).select().single();
      if(!error&&nc){setCats(p=>[...p,{id:nc.id,name:nc.name,desc:nc.description,color:nc.color}]);setEditCat(null);}
      else setSaveErr(error?.message||"Erreur");
    }
    setSaving(false);
  };
  const deleteCat=async id=>{
    const {error}=await sb.from("categories").delete().eq("id",id);
    if(!error){setCats(p=>p.filter(c=>c.id!==id));setQs(p=>p.filter(q=>q.catId!==id));setDocs(p=>p.filter(d=>d.catId!==id));setDelConfirm(null);}
  };
  const saveQ=async data=>{
    setSaving(true);setSaveErr("");
    const payload={cat_id:data.catId,text:data.text,options:data.opts,correct_index:data.correct,explanation:data.expl||""};
    if(qs.some(q=>q.id===data.id)){
      const {error}=await sb.from("questions").update(payload).eq("id",data.id);
      if(!error){setQs(p=>p.map(q=>q.id===data.id?{...q,...data}:q));setEditQ(null);}
      else setSaveErr(error.message);
    } else {
      const {data:nq,error}=await sb.from("questions").insert(payload).select().single();
      if(!error&&nq){setQs(p=>[...p,{id:nq.id,catId:nq.cat_id,text:nq.text,opts:nq.options,correct:nq.correct_index,expl:nq.explanation}]);setEditQ(null);}
      else setSaveErr(error?.message||"Erreur");
    }
    setSaving(false);
  };
  const deleteQ=async id=>{
    const {error}=await sb.from("questions").delete().eq("id",id);
    if(!error){setQs(p=>p.filter(q=>q.id!==id));setDelConfirm(null);}
  };
  const saveDoc=async(data,file,setUploading)=>{
    setSaving(true);setSaveErr("");
    let finalUrl=data.url||"";
    if(file){
      setUploading(true);
      const ext=file.name.split(".").pop();
      const path=`${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const {data:up,error:upErr}=await sb.storage.from("documents").upload(path,file);
      if(upErr){setSaveErr("Erreur upload : "+upErr.message);setSaving(false);setUploading(false);return;}
      const {data:{publicUrl}}=sb.storage.from("documents").getPublicUrl(up.path);
      finalUrl=publicUrl;setUploading(false);
    }
    const payload={cat_id:data.catId,title:data.title,type:data.type,description:data.description||"",url:finalUrl};
    if(docs.some(d=>d.id===data.id)){
      const {error}=await sb.from("documents").update(payload).eq("id",data.id);
      if(!error){setDocs(p=>p.map(d=>d.id===data.id?{...d,...data,url:finalUrl}:d));setEditDoc(null);}
      else setSaveErr(error.message);
    } else {
      const {data:nd,error}=await sb.from("documents").insert(payload).select().single();
      if(!error&&nd){setDocs(p=>[...p,{id:nd.id,catId:nd.cat_id,title:nd.title,type:nd.type,description:nd.description,url:nd.url}]);setEditDoc(null);}
      else setSaveErr(error?.message||"Erreur");
    }
    setSaving(false);
  };
  const deleteDoc=async id=>{
    const {error}=await sb.from("documents").delete().eq("id",id);
    if(!error){setDocs(p=>p.filter(d=>d.id!==id));setDelConfirm(null);}
  };

  // ── EXAM ─────────────────────────────────────────────────────
  const openPreExam=(cat,mode="cat")=>{
    setPreExam({cat,mode});
    setExamCount(mode==="all"?EXAMEN_BLANC_MAX:20);
    setTimerOn(false);
  };

  const startExam=()=>{
    if(!preExam) return;
    const {cat,mode}=preExam;
    let pool=[];
    if(mode==="cat")      pool=qs.filter(q=>q.catId===cat.id);
    else if(mode==="all") pool=[...qs];
    else if(mode==="revision") pool=qs.filter(q=>wrongIds.has(q.id));
    if(!pool.length) return;
    const max = mode==="all" ? EXAMEN_BLANC_MAX : examCount;
    const shuffled=pool.sort(()=>Math.random()-0.5).slice(0,max).map(q=>{
      const indices=[0,1,2,3].sort(()=>Math.random()-0.5);
      return { ...q, opts:indices.map(i=>q.opts[i]), correct:indices.indexOf(q.correct) };
    });
    answersRef.current=[];
    setExamCat(cat);setExamMode(mode);setExamList(shuffled);
    setExamIdx(0);setPicked(null);setShown(false);setLog([]);
    setGlobalTime(EXAMEN_BLANC_TIMER);
    setPreExam(null);
    setPage("exam");
  };

  const finishExam=useCallback(async(forceAnswers)=>{
    clearInterval(globalTimerRef.current);
    clearInterval(timerRef.current);
    const answers=forceAnswers||answersRef.current;
    const sc=answers.filter(x=>x.correct).length;
    const total=examList.length;
    const pct=Math.round((sc/total)*100);
    const newWrong=new Set(wrongIds);
    answers.forEach(a=>{if(!a.correct)newWrong.add(a.qId);else newWrong.delete(a.qId);});
    setWrongIds(newWrong);
    try{localStorage.setItem(`wrong_${user.id}`,JSON.stringify([...newWrong]));}catch{}
    await sb.from("results").insert({
      user_id:user.id,pseudo,
      cat_id:examMode==="all"?null:examCat?.id,
      cat_name:examMode==="all"?"Examen Blanc":examMode==="revision"?"Mode révision":examCat?.name,
      color:examMode==="all"?"#e8392a":examCat?.color,
      score:sc,total,pct
    });
    const oldBadges=getUnlocked(myResults,cats).map(b=>b.id);
    const newRes=[...myResults,{score:sc,total,pct,cat_id:examCat?.id}];
    const newUnlocked=getUnlocked(newRes,cats).filter(b=>!oldBadges.includes(b.id));
    setNewBadges(newUnlocked);
    await loadMyResults(user.id);
    setPage("results");
  },[answersRef,examList,examMode,examCat,wrongIds,user,pseudo,myResults,cats]);

  const doValidate=(forcePick=null)=>{
    const choice=forcePick!==null?forcePick:picked;
    if(choice===null) return;
    const isCorrect=choice===examList[examIdx].correct;
    const entry={correct:isCorrect,picked:choice,qId:examList[examIdx].id};
    answersRef.current=[...answersRef.current,entry];
    setLog([...answersRef.current]);
    setShown(true);
    clearInterval(timerRef.current);
  };

  const nextQ=async()=>{
    if(examIdx+1>=examList.length){
      await finishExam();
    } else {
      setExamIdx(i=>i+1);setPicked(null);setShown(false);
    }
  };

  // ── SETTINGS ─────────────────────────────────────────────────
  const savePseudo=async()=>{
    if(!newPseudo.trim()) return;
    const {error}=await sb.from("profiles").update({pseudo:newPseudo.trim()}).eq("id",user.id);
    if(!error){setPseudo(newPseudo.trim());setNewPseudo("");setPseudoOk(true);setTimeout(()=>setPseudoOk(false),3000);}
  };
  const savePw=async()=>{
    setPwErr("");
    if(newPw.length<6){setPwErr("Minimum 6 caractères.");return;}
    if(newPw!==newPw2){setPwErr("Les mots de passe ne correspondent pas.");return;}
    const {error}=await sb.auth.updateUser({password:newPw});
    if(!error){setNewPw("");setNewPw2("");setPwOk(true);setTimeout(()=>setPwOk(false),3000);}
    else setPwErr(tr(error.message));
  };

  // ─────────────────────────────────────────────────────────────
  // PAGES
  // ─────────────────────────────────────────────────────────────

  if(page==="boot") return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.bg}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:16,filter:"drop-shadow(0 0 20px rgba(232,57,42,0.6))"}}>🔥</div>
        <div style={{fontFamily:"Oswald,sans-serif",color:C.red,letterSpacing:4,fontSize:14}}>CHARGEMENT...</div>
      </div>
    </div>
  );

  // ── AUTH ───────────────────────────────────────────────────
  if(page==="auth") return (
    <Wrap>
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:`radial-gradient(ellipse at 50% 0%, rgba(232,57,42,0.08) 0%, transparent 60%)`}}>
        <div style={{width:"100%",maxWidth:380}}>
          <div style={{textAlign:"center",marginBottom:40}}>
            <div style={{fontSize:56,marginBottom:20,filter:"drop-shadow(0 0 28px rgba(232,57,42,0.5))"}}>🔥</div>
            <h1 style={{fontFamily:"Oswald,sans-serif",fontSize:"clamp(24px,6vw,44px)",fontWeight:700,letterSpacing:5,textTransform:"uppercase",margin:"0 0 10px",color:C.text}}>SAPEURS-POMPIERS</h1>
            <div style={{fontFamily:"Oswald,sans-serif",color:C.red,letterSpacing:5,textTransform:"uppercase",fontSize:11}}>Plateforme QCM · Formation</div>
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderTop:`3px solid ${C.red}`,borderRadius:8,padding:"36px 32px",boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}>
            <div style={{display:"flex",background:C.surf,borderRadius:6,padding:3,marginBottom:28}}>
              {[["login","Connexion"],["register","Inscription"]].map(([m,l])=>(
                <button key={m} onClick={()=>{setAuthMode(m);setAErr("");}} style={{flex:1,background:authMode===m?C.red:"transparent",color:authMode===m?"#fff":C.muted,border:"none",borderRadius:4,padding:"10px",cursor:"pointer",fontFamily:"'Barlow',sans-serif",fontWeight:700,fontSize:13,transition:"all 0.2s"}}>{l}</button>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              {authMode==="register"&&<div><FL>Prénom / Pseudo</FL><Field value={aPseudo} onChange={e=>setAPseudo(e.target.value)} placeholder="Jean Dupont" autoFocus/></div>}
              <div><FL>Email</FL><Field type="email" value={aEmail} onChange={e=>setAEmail(e.target.value)} placeholder="jean@exemple.fr" autoFocus={authMode==="login"}/></div>
              <div><FL>Mot de passe</FL><Field type="password" value={aPw} onChange={e=>setAPw(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&doAuth()}/></div>
              {aErr&&<div style={{color:aErr.startsWith("✓")?"#86efac":"#fca5a5",fontSize:13,lineHeight:1.5,background:aErr.startsWith("✓")?"rgba(22,163,74,0.08)":"rgba(220,38,38,0.08)",border:`1px solid ${aErr.startsWith("✓")?"rgba(22,163,74,0.25)":"rgba(220,38,38,0.25)"}`,borderRadius:4,padding:"10px 12px"}}>{aErr}</div>}
              <Btn onClick={doAuth} disabled={aBusy||!aEmail||!aPw} full>{aBusy?"...":authMode==="login"?"SE CONNECTER →":"CRÉER MON COMPTE →"}</Btn>
            </div>
          </div>
        </div>
      </div>
    </Wrap>
  );

  // ── PRE-EXAM ───────────────────────────────────────────────
  if(preExam){
    const {cat,mode}=preExam;
    const pool=mode==="cat"?qs.filter(q=>q.catId===cat?.id):mode==="revision"?qs.filter(q=>wrongIds.has(q.id)):qs;
    const maxQ=mode==="all"?Math.min(pool.length,EXAMEN_BLANC_MAX):pool.length;
    const accentColor=mode==="all"?C.red:mode==="revision"?C.orange:cat?.color||C.red;
    return (
      <Wrap>
        <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderTop:`3px solid ${accentColor}`,borderRadius:8,padding:"36px 32px",width:"100%",maxWidth:440,boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}>
            <div style={{marginBottom:28}}>
              <div style={{fontFamily:"Oswald,sans-serif",fontSize:22,letterSpacing:2,textTransform:"uppercase",marginBottom:8,color:accentColor}}>
                {mode==="all"?"📋 Examen Blanc":mode==="revision"?"🔄 Mode révision":cat?.name}
              </div>
              <div style={{color:C.muted,fontSize:14}}>
                {mode==="all"?`${maxQ} questions · Durée max 60 minutes`:`${pool.length} question${pool.length!==1?"s":""} disponible${pool.length!==1?"s":""}`}
              </div>
            </div>

            {mode==="all"?(
              // Examen Blanc : fixé à 40 questions max, timer global 60 min
              <div style={{background:C.surf,border:`1px solid ${C.border2}`,borderRadius:6,padding:"16px 20px",marginBottom:24}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:24}}>⏱</span>
                  <div>
                    <div style={{fontWeight:700,fontSize:15,color:C.text}}>60 minutes au total</div>
                    <div style={{color:C.muted,fontSize:12,marginTop:2}}>{maxQ} questions · Chronomètre global automatique</div>
                  </div>
                </div>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:20,marginBottom:24}}>
                <div>
                  <FL>Nombre de questions</FL>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {EXAM_COUNTS.filter(n=>n<=pool.length).map(n=>(
                      <button key={n} onClick={()=>setExamCount(n)} style={{flex:1,minWidth:60,background:examCount===n?accentColor:"transparent",color:examCount===n?"#fff":C.muted,border:`1px solid ${examCount===n?accentColor:C.border2}`,borderRadius:4,padding:"9px",cursor:"pointer",fontFamily:"Oswald,sans-serif",fontWeight:700,fontSize:15,transition:"all 0.15s"}}>{n}</button>
                    ))}
                    {pool.length>0&&<button onClick={()=>setExamCount(pool.length)} style={{flex:1,minWidth:60,background:examCount===pool.length?accentColor:"transparent",color:examCount===pool.length?"#fff":C.muted,border:`1px solid ${examCount===pool.length?accentColor:C.border2}`,borderRadius:4,padding:"9px",cursor:"pointer",fontFamily:"Oswald,sans-serif",fontWeight:700,fontSize:13,transition:"all 0.15s"}}>Tout ({pool.length})</button>}
                  </div>
                </div>
                <div>
                  <FL>Chronomètre par question (optionnel)</FL>
                  <button onClick={()=>setTimerOn(t=>!t)} style={{width:"100%",background:timerOn?"#1a120822":"transparent",color:timerOn?C.yellowL:C.muted,border:`1px solid ${timerOn?C.yellowL:C.border2}`,borderRadius:4,padding:"11px 16px",cursor:"pointer",fontFamily:"'Barlow',sans-serif",fontWeight:700,fontSize:14,transition:"all 0.15s",textAlign:"left",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <span>⏱ {TIMER_DEFAULT}s par question</span>
                    <span style={{fontSize:11,background:timerOn?C.yellowL:C.faint,color:timerOn?"#000":C.muted,padding:"2px 10px",borderRadius:20}}>{timerOn?"ACTIVÉ":"DÉSACTIVÉ"}</span>
                  </button>
                </div>
              </div>
            )}

            <div style={{display:"flex",gap:10}}>
              <Btn onClick={startExam} disabled={maxQ===0} full color={accentColor}>DÉMARRER →</Btn>
              <Btn onClick={()=>setPreExam(null)} ghost>Annuler</Btn>
            </div>
            {maxQ===0&&<div style={{color:C.orange,fontSize:13,textAlign:"center",marginTop:12}}>⚠ Aucune question disponible.</div>}
          </div>
        </div>
      </Wrap>
    );
  }

  // ── HOME ───────────────────────────────────────────────────
  if(page==="home"){
    const stats=computeStats(myResults);
    const badges=getUnlocked(myResults,cats);
    return (
      <Wrap>
        <Topbar
          title={<><span style={{fontSize:16,marginRight:8}}>🔥</span>Sapeurs-Pompiers QCM</>}
          right={<>
            <span style={{color:C.muted,fontSize:13,display:"flex",alignItems:"center",gap:6}}>
              <span style={{background:C.faint,width:26,height:26,borderRadius:"50%",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11}}>👤</span>
              <strong style={{color:C.text}}>{pseudo}</strong>
            </span>
            {myResults.length>0&&<Btn onClick={()=>setPage("history")} ghost sm>📊 Mon bilan</Btn>}
            <Btn onClick={()=>{setResCat("all");setPage("resources");}} ghost sm>📚 Ressources</Btn>
            {isAdmin&&<Btn onClick={()=>{setAdminTab("qs");setPage("admin");}} sm color={C.red}>⚙ Admin</Btn>}
            <button onClick={doLogout} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:11,fontFamily:"'Barlow',sans-serif",padding:"4px 8px"}} onMouseEnter={e=>e.currentTarget.style.color=C.text2} onMouseLeave={e=>e.currentTarget.style.color=C.muted}>Déco.</button>
          </>}
        />
        <div style={{background:`linear-gradient(150deg, rgba(232,57,42,0.12) 0%, rgba(6,6,10,0) 45%)`,borderBottom:`1px solid ${C.border}`,padding:"52px 24px 44px"}}>
          <div style={{maxWidth:700,margin:"0 auto",textAlign:"center"}}>
            <h1 style={{fontFamily:"Oswald,sans-serif",fontSize:"clamp(24px,5vw,48px)",fontWeight:700,letterSpacing:3,textTransform:"uppercase",margin:"0 0 12px"}}>Bonjour, {pseudo} 👋</h1>
            <p style={{color:C.text2,fontSize:15,fontWeight:300,maxWidth:420,margin:"0 auto",lineHeight:1.8}}>Testez et renforcez vos connaissances.</p>
            {stats.total>0&&(
              <div style={{display:"inline-flex",alignItems:"center",gap:20,marginTop:24,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 24px"}}>
                <div style={{textAlign:"center"}}><div style={{fontFamily:"Oswald,sans-serif",fontSize:22,fontWeight:700}}>{stats.total}</div><div style={{color:C.muted,fontSize:11}}>examens</div></div>
                <div style={{width:1,height:30,background:C.border}}/>
                <div style={{textAlign:"center"}}><div style={{fontFamily:"Oswald,sans-serif",fontSize:22,fontWeight:700,color:pct2col(stats.avg)}}>{stats.avg}%</div><div style={{color:C.muted,fontSize:11}}>moyenne</div></div>
                <div style={{width:1,height:30,background:C.border}}/>
                <div style={{textAlign:"center"}}><div style={{fontFamily:"Oswald,sans-serif",fontSize:22,fontWeight:700,color:C.yellowL}}>{badges.length}</div><div style={{color:C.muted,fontSize:11}}>badges</div></div>
              </div>
            )}
          </div>
        </div>

        <div style={{maxWidth:960,margin:"0 auto",padding:"40px 24px"}}>
          {/* Modes spéciaux */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,marginBottom:36}}>
            <div onClick={()=>openPreExam(null,"all")} style={{background:`linear-gradient(135deg, rgba(232,57,42,0.15), rgba(232,57,42,0.05))`,border:`1px solid ${C.red}44`,borderRadius:6,padding:"18px 20px",cursor:"pointer",transition:"all 0.2s",display:"flex",alignItems:"center",gap:14}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.red;e.currentTarget.style.transform="translateY(-2px)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.red+"44";e.currentTarget.style.transform="none";}}>
              <span style={{fontSize:28}}>📋</span>
              <div>
                <div style={{fontFamily:"Oswald,sans-serif",fontSize:15,letterSpacing:1,color:C.red}}>EXAMEN BLANC</div>
                <div style={{color:C.muted,fontSize:12,marginTop:2}}>40 questions · 60 min</div>
              </div>
            </div>
            {wrongIds.size>0&&(
              <div onClick={()=>openPreExam(null,"revision")} style={{background:`linear-gradient(135deg, rgba(240,115,32,0.15), rgba(240,115,32,0.05))`,border:`1px solid ${C.orange}44`,borderRadius:6,padding:"18px 20px",cursor:"pointer",transition:"all 0.2s",display:"flex",alignItems:"center",gap:14}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.orange;e.currentTarget.style.transform="translateY(-2px)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.orange+"44";e.currentTarget.style.transform="none";}}>
                <span style={{fontSize:28}}>🔄</span>
                <div>
                  <div style={{fontFamily:"Oswald,sans-serif",fontSize:15,letterSpacing:1,color:C.orange}}>MES ERREURS</div>
                  <div style={{color:C.muted,fontSize:12,marginTop:2}}>{wrongIds.size} question{wrongIds.size>1?"s":""} à revoir</div>
                </div>
              </div>
            )}
          </div>

          {/* Catégories */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
            <span style={{fontFamily:"Oswald,sans-serif",fontSize:11,letterSpacing:4,textTransform:"uppercase",color:C.muted}}>Catégories</span>
            <span style={{color:C.muted,fontSize:12}}>{cats.length} disponible{cats.length!==1?"s":""}</span>
          </div>
          {cats.length===0?(
            <div style={{textAlign:"center",color:C.muted,padding:"80px 0"}}><div style={{fontSize:44,marginBottom:14}}>📋</div>{isAdmin?"Aucune catégorie — créez-en une dans l'admin.":"Aucune catégorie disponible."}</div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14,marginBottom:44}}>
              {cats.map(cat=>{
                const count=qs.filter(q=>q.catId===cat.id).length;
                const catRes=myResults.filter(r=>r.cat_id===cat.id);
                const best=catRes.length?Math.max(...catRes.map(r=>r.pct)):null;
                const avg2=catRes.length?Math.round(catRes.reduce((a,r)=>a+r.pct,0)/catRes.length):null;
                const ok=count>0;
                return (
                  <div key={cat.id} onClick={()=>ok&&openPreExam(cat,"cat")}
                    style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${cat.color}`,borderRadius:6,padding:"20px",cursor:ok?"pointer":"default",opacity:ok?1:0.45,transition:"all 0.2s"}}
                    onMouseEnter={e=>{if(ok){e.currentTarget.style.background=C.card2;e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow=`0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px ${cat.color}44`;}}}
                    onMouseLeave={e=>{e.currentTarget.style.background=C.card;e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
                    <div style={{fontFamily:"Oswald,sans-serif",fontSize:17,fontWeight:600,marginBottom:6}}>{cat.name}</div>
                    <div style={{color:C.text2,fontSize:13,fontWeight:300,marginBottom:16,lineHeight:1.6,minHeight:36}}>{cat.desc}</div>
                    {avg2!==null&&<div style={{background:C.bg,borderRadius:4,height:4,marginBottom:12,overflow:"hidden"}}><div style={{height:"100%",width:`${avg2}%`,background:pct2col(avg2),borderRadius:4,transition:"width 0.6s"}}/></div>}
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span style={{fontSize:12,color:cat.color,fontWeight:600,background:cat.color+"18",border:`1px solid ${cat.color}44`,borderRadius:20,padding:"2px 10px"}}>{count} question{count!==1?"s":""}</span>
                      {best!==null?<ScorePill pct={best}/>:ok?<span style={{fontSize:10,color:C.muted,letterSpacing:2}}>COMMENCER ▶</span>:null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Badges */}
          {myResults.length>0&&(()=>{
            const allB       = getAllBadges(cats);
            const unlocked   = getUnlocked(myResults,cats);
            const unlockedIds= new Set(unlocked.map(b=>b.id));
            const grades     = BADGES.filter(b=>b.grade);
            const currentGradeIdx = grades.reduce((acc,b,i)=>unlockedIds.has(b.id)?i:acc,-1);
            const currentGrade= grades[currentGradeIdx];
            const nextGrade  = grades[currentGradeIdx+1];
            const FAM_META = {
              rép:  { label:"🎯 Bonnes réponses",  color:"#eab308" },
              exm:  { label:"📋 Examens réalisés", color:"#3b82f6" },
              prf:  { label:"💯 Parfaits 100%",    color:"#22c55e" },
              exc:  { label:"⭐ Excellence 90%+",  color:"#06b6d4" },
              "80p":{ label:"🔥 Réussite 80%+",    color:"#f07320" },
              day:  { label:"📅 Assiduité",        color:"#a855f7" },
              wkl:  { label:"⚡ Cadence hebdo",    color:"#94a3b8" },
              cat:  { label:"🏆 Catégories",       color:"#cd7f32" },
              prg:  { label:"📈 Progression",      color:"#94a3b8" },
            };
            const CAT_FAMS = ["c_rép","c_exm","c_prf","c_exc","c_80p","c_prg"];
            const CAT_FAM_LABELS = {c_rép:"🎯 Rép.",c_exm:"📋 Examens",c_prf:"💯 Parfaits",c_exc:"⭐ 90%+",c_80p:"🔥 80%+",c_prg:"📈 Progrès"};
            const CAT_FAM_COLORS = {c_rép:"#eab308",c_exm:"#3b82f6",c_prf:"#22c55e",c_exc:"#06b6d4",c_80p:"#f07320",c_prg:"#94a3b8"};

            return (
              <div>
                {/* Grade actuel */}
                {currentGrade&&(
                  <div style={{background:`linear-gradient(135deg,${currentGrade.color}18,${currentGrade.color}06)`,border:`1px solid ${currentGrade.color}44`,borderRadius:8,padding:"18px 22px",marginBottom:28,display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
                    <GradeInsignia id={currentGrade.id} unlocked={true} size={72}/>
                    <div style={{flex:1,minWidth:200}}>
                      <div style={{fontFamily:"Oswald,sans-serif",fontSize:11,letterSpacing:3,color:currentGrade.color,textTransform:"uppercase",marginBottom:4}}>Grade actuel</div>
                      <div style={{fontFamily:"Oswald,sans-serif",fontSize:22,fontWeight:700,color:C.text}}>{currentGrade.name}</div>
                      {nextGrade&&<div style={{color:C.muted,fontSize:12,marginTop:4}}>Prochain : <strong style={{color:C.text2}}>{nextGrade.name}</strong> — {nextGrade.desc}</div>}
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontFamily:"Oswald,sans-serif",fontSize:28,fontWeight:700,color:currentGrade.color}}>{unlocked.length}<span style={{fontSize:14,color:C.muted}}>/{allB.length}</span></div>
                      <div style={{color:C.muted,fontSize:11}}>badges débloqués</div>
                    </div>
                  </div>
                )}

                {/* Grades */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <span style={{fontFamily:"Oswald,sans-serif",fontSize:11,letterSpacing:4,textTransform:"uppercase",color:C.muted}}>Grades</span>
                  <span style={{color:C.muted,fontSize:12}}>{grades.filter(b=>unlockedIds.has(b.id)).length}/{grades.length}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(88px,1fr))",gap:8,marginBottom:32}}>
                  {grades.map(b=><BadgeCard key={b.id} badge={b} unlocked={unlockedIds.has(b.id)}/>)}
                </div>

                {/* Badges globaux par famille */}
                <div style={{fontFamily:"Oswald,sans-serif",fontSize:11,letterSpacing:4,textTransform:"uppercase",color:C.muted,marginBottom:20}}>Badges globaux</div>
                {Object.keys(FAM_META).map(fk=>{
                  const fam=BADGES.filter(b=>b.fam===fk).sort((a,b2)=>a.tier-b2.tier);
                  if(!fam.length) return null;
                  const meta=FAM_META[fk];
                  const nU=fam.filter(b=>unlockedIds.has(b.id)).length;
                  const nxt=fam.find(b=>!unlockedIds.has(b.id));
                  return (
                    <div key={fk} style={{marginBottom:20}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                        <span style={{fontFamily:"Oswald,sans-serif",fontSize:11,letterSpacing:3,textTransform:"uppercase",color:meta.color}}>{meta.label}</span>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          {nxt&&<span style={{color:C.muted,fontSize:11}}>Suivant : <strong style={{color:C.text2}}>{nxt.desc}</strong></span>}
                          <span style={{color:C.muted,fontSize:11}}>{nU}/{fam.length}</span>
                        </div>
                      </div>
                      <div style={{background:C.border,borderRadius:99,height:3,marginBottom:10,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${fam.length?nU/fam.length*100:0}%`,background:meta.color,borderRadius:99,transition:"width 0.5s"}}/>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:`repeat(${fam.length},1fr)`,gap:6}}>
                        {fam.map(b=><BadgeCard key={b.id} badge={b} unlocked={unlockedIds.has(b.id)}/>)}
                      </div>
                    </div>
                  );
                })}

                {/* Badges spéciaux */}
                {(()=>{
                  const sp=BADGES.filter(b=>!b.grade&&!b.fam);
                  return (
                    <div style={{marginBottom:32}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                        <span style={{fontFamily:"Oswald,sans-serif",fontSize:11,letterSpacing:4,textTransform:"uppercase",color:C.muted}}>Badges spéciaux</span>
                        <span style={{color:C.muted,fontSize:12}}>{sp.filter(b=>unlockedIds.has(b.id)).length}/{sp.length}</span>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(88px,1fr))",gap:8}}>
                        {sp.map(b=><BadgeCard key={b.id} badge={b} unlocked={unlockedIds.has(b.id)}/>)}
                      </div>
                    </div>
                  );
                })()}

                {/* ── BADGES PAR CATÉGORIE (auto-générés) ── */}
                {cats.length>0&&(
                  <div style={{paddingTop:8,borderTop:`1px solid ${C.border}`}}>
                    <div style={{fontFamily:"Oswald,sans-serif",fontSize:11,letterSpacing:4,textTransform:"uppercase",color:C.muted,marginBottom:20,marginTop:8}}>
                      Badges par catégorie
                    </div>
                    {cats.map(cat=>{
                      const catB=generateCatBadges(cat);
                      const nCatU=catB.filter(b=>unlockedIds.has(b.id)).length;
                      return (
                        <div key={cat.id} style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${cat.color}`,borderRadius:6,padding:"16px 18px",marginBottom:14}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                            <div style={{display:"flex",alignItems:"center",gap:10}}>
                              <div style={{width:9,height:9,borderRadius:"50%",background:cat.color,boxShadow:`0 0 7px ${cat.color}`}}/>
                              <span style={{fontFamily:"Oswald,sans-serif",fontSize:14,fontWeight:700,letterSpacing:1}}>{cat.name}</span>
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:10}}>
                              <div style={{width:72,background:C.border,borderRadius:99,height:4,overflow:"hidden"}}>
                                <div style={{height:"100%",width:`${catB.length?nCatU/catB.length*100:0}%`,background:cat.color,borderRadius:99,transition:"width 0.5s"}}/>
                              </div>
                              <span style={{color:C.muted,fontSize:11}}>{nCatU}/{catB.length}</span>
                            </div>
                          </div>
                          {CAT_FAMS.map(fk=>{
                            const fam=catB.filter(b=>b.fam===fk).sort((a,b2)=>a.tier-b2.tier);
                            const nU=fam.filter(b=>unlockedIds.has(b.id)).length;
                            const nxt=fam.find(b=>!unlockedIds.has(b.id));
                            return (
                              <div key={fk} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                                <span style={{color:CAT_FAM_COLORS[fk],fontSize:11,minWidth:86,fontFamily:"'Barlow',sans-serif",fontWeight:700}}>{CAT_FAM_LABELS[fk]}</span>
                                <div style={{display:"grid",gridTemplateColumns:`repeat(${fam.length},1fr)`,gap:5,flex:1,maxWidth:fam.length*58}}>
                                  {fam.map(b=><BadgeCard key={b.id} badge={b} unlocked={unlockedIds.has(b.id)}/>)}
                                </div>
                                {nxt&&<span style={{color:C.muted,fontSize:10,flex:1,lineHeight:1.3}}>{nxt.desc}</span>}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </Wrap>
    );
  }

  // ── RESOURCES ──────────────────────────────────────────────
  if(page==="resources"){
    const filtered=resCat==="all"?docs:docs.filter(d=>d.catId===resCat);
    return (
      <Wrap>
        <Topbar title="📚 Ressources documentaires" back={()=>setPage("home")} right={<span style={{color:C.muted,fontSize:13}}>👤 {pseudo}</span>}/>
        <div style={{background:C.surf,borderBottom:`1px solid ${C.border}`,padding:"12px 24px",display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>setResCat("all")} style={{background:resCat==="all"?C.text:"transparent",color:resCat==="all"?C.bg:C.muted,border:`1px solid ${resCat==="all"?C.text:C.border2}`,borderRadius:20,padding:"5px 16px",cursor:"pointer",fontSize:13,fontFamily:"'Barlow',sans-serif",fontWeight:700,transition:"all 0.15s"}}>Toutes</button>
          {cats.map(cat=>(
            <button key={cat.id} onClick={()=>setResCat(cat.id)} style={{background:resCat===cat.id?cat.color:"transparent",color:resCat===cat.id?"#fff":C.muted,border:`1px solid ${resCat===cat.id?cat.color:C.border2}`,borderRadius:20,padding:"5px 16px",cursor:"pointer",fontSize:13,fontFamily:"'Barlow',sans-serif",fontWeight:600,transition:"all 0.15s"}}>{cat.name}</button>
          ))}
        </div>
        <div style={{maxWidth:960,margin:"0 auto",padding:"40px 24px"}}>
          {filtered.length===0?(
            <div style={{textAlign:"center",color:C.muted,padding:"80px 0"}}><div style={{fontSize:44,marginBottom:14}}>📂</div>{isAdmin?"Ajoutez des documents depuis l'admin.":"Aucun document disponible."}</div>
          ):(
            DOC_TYPES.map(type=>{
              const typeDocs=filtered.filter(d=>d.type===type.key);
              if(!typeDocs.length) return null;
              return (
                <div key={type.key} style={{marginBottom:44}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
                    <div style={{width:3,height:20,background:type.color,borderRadius:2}}/>
                    <span style={{fontFamily:"Oswald,sans-serif",fontSize:13,letterSpacing:3,textTransform:"uppercase",color:type.color}}>{type.icon} {type.label}</span>
                    <div style={{flex:1,height:1,background:C.border}}/>
                    <span style={{color:C.muted,fontSize:12}}>{typeDocs.length}</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
                    {typeDocs.map(doc=>{
                      const cat=cats.find(c=>c.id===doc.catId);
                      const isPdf=doc.url?.toLowerCase().includes(".pdf");
                      return (
                        <div key={doc.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:"20px",display:"flex",flexDirection:"column",gap:12,transition:"all 0.2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=type.color+"66";e.currentTarget.style.transform="translateY(-2px)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.transform="none";}}>
                          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                            <span style={{fontSize:11,color:type.color,background:type.color+"18",border:`1px solid ${type.color}33`,borderRadius:20,padding:"2px 10px",fontWeight:700}}>{type.icon} {type.label}</span>
                            {cat&&<span style={{fontSize:11,color:cat.color,background:cat.color+"18",border:`1px solid ${cat.color}33`,borderRadius:20,padding:"2px 10px",fontWeight:600}}>{cat.name}</span>}
                          </div>
                          <div style={{fontFamily:"Oswald,sans-serif",fontSize:16,fontWeight:500,lineHeight:1.4,flex:1}}>{doc.title}</div>
                          {doc.description&&<div style={{color:C.text2,fontSize:13,lineHeight:1.6}}>{doc.description}</div>}
                          {doc.url?(
                            <a href={doc.url} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:8,background:type.color,color:"#fff",border:"none",borderRadius:4,padding:"9px 16px",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"'Barlow',sans-serif",textDecoration:"none",boxShadow:`0 2px 8px ${type.color}44`}}>
                              {isPdf?"📄 Ouvrir le PDF":"🔗 Ouvrir le lien"}
                            </a>
                          ):<span style={{color:C.muted,fontSize:12,fontStyle:"italic"}}>Aucun lien</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Wrap>
    );
  }

  // ── HISTORY ────────────────────────────────────────────────
  if(page==="history"){
    const stats=computeStats(myResults);
    const badges=getUnlocked(myResults,cats);
    return (
      <Wrap>
        <Topbar title="📊 Mon bilan" back={()=>setPage("home")} right={<span style={{color:C.muted,fontSize:13}}>👤 {pseudo}</span>}/>
        <div style={{maxWidth:820,margin:"0 auto",padding:"40px 24px"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:12}}>
            <StatCard label="Examens complétés"  value={stats.total}      color={C.blueL}/>
            <StatCard label="Score moyen général" value={`${stats.avg}%`} color={pct2col(stats.avg)}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:32}}>
            <StatCard label="Bonnes réponses totales" value={stats.correct}                   color={C.greenL}/>
            <StatCard label="Badges débloqués"        value={`${badges.length}/${BADGES.length}`} color={C.yellowL}/>
          </div>
          <div style={{fontFamily:"Oswald,sans-serif",fontSize:11,letterSpacing:3,textTransform:"uppercase",color:C.muted,marginBottom:16}}>Progression par catégorie</div>
          <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:32}}>
            {cats.map(cat=>{
              const r2=[...myResults.filter(r=>r.cat_id===cat.id)].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
              if(!r2.length) return (
                <div key={cat.id} style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${cat.color}44`,borderRadius:4,padding:"12px 18px",opacity:0.45}}>
                  <span style={{fontSize:13,color:C.muted}}>{cat.name} — aucun examen</span>
                </div>
              );
              const avg2=Math.round(r2.reduce((a,r)=>a+r.pct,0)/r2.length);
              const n=r2.length;
              const W=560,H=130,pL=38,pR=16,pT=18,pB=28;
              const pW=W-pL-pR, pH=H-pT-pB;
              const xOf=i=>pL+(n<=1?pW/2:(i/(n-1))*pW);
              const yOf=v=>pT+pH-(v/100)*pH;
              const pathD=r2.map((r,i)=>`${i===0?"M":"L"}${xOf(i).toFixed(1)},${yOf(r.pct).toFixed(1)}`).join(" ");
              const areaD=`${pathD} L${xOf(n-1).toFixed(1)},${(pT+pH).toFixed(1)} L${xOf(0).toFixed(1)},${(pT+pH).toFixed(1)} Z`;
              const best=Math.max(...r2.map(r=>r.pct));
              const worst=Math.min(...r2.map(r=>r.pct));
              const trend=n>=2?r2[n-1].pct-r2[0].pct:0;
              return (
                <div key={cat.id} style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${cat.color}`,borderRadius:6,padding:"16px 20px"}}>
                  {/* En-tête */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
                    <div style={{fontFamily:"Oswald,sans-serif",fontSize:15,fontWeight:600}}>{cat.name}</div>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      {n>=2&&(
                        <span style={{fontSize:12,color:trend>0?C.greenL:trend<0?C.red:C.muted,fontWeight:700,display:"flex",alignItems:"center",gap:3}}>
                          {trend>0?"↑":trend<0?"↓":"→"} {Math.abs(trend)}pts
                        </span>
                      )}
                      <ScorePill pct={avg2}/>
                      <span style={{color:C.muted,fontSize:11}}>{n} tentative{n>1?"s":""}</span>
                    </div>
                  </div>

                  {/* Graphique SVG */}
                  <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block",overflow:"visible"}}>
                    {/* Zone de fond */}
                    <rect x={pL} y={pT} width={pW} height={pH} fill={C.bg} rx={2}/>

                    {/* Lignes de grille horizontales */}
                    {[0,25,50,75,100].map(v=>(
                      <g key={v}>
                        <line x1={pL} y1={yOf(v)} x2={pL+pW} y2={yOf(v)} stroke={v===0||v===100?C.border2:C.border} strokeWidth={v===50?1.5:1} strokeDasharray={v===0||v===100?"none":"4,4"}/>
                        <text x={pL-6} y={yOf(v)+3.5} fontSize={9} fill={C.muted} textAnchor="end" fontFamily="Barlow,sans-serif">{v}%</text>
                      </g>
                    ))}

                    {/* Ligne seuil 70% */}
                    <line x1={pL} y1={yOf(70)} x2={pL+pW} y2={yOf(70)} stroke={C.greenL} strokeWidth={1} strokeDasharray="6,3" strokeOpacity={0.5}/>
                    <text x={pL+pW+4} y={yOf(70)+3.5} fontSize={8} fill={C.greenL} fillOpacity={0.7} fontFamily="Barlow,sans-serif">70%</text>

                    {/* Aire sous la courbe */}
                    <defs>
                      <linearGradient id={`grad-${cat.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={cat.color} stopOpacity="0.25"/>
                        <stop offset="100%" stopColor={cat.color} stopOpacity="0.02"/>
                      </linearGradient>
                    </defs>
                    <path d={areaD} fill={`url(#grad-${cat.id})`}/>

                    {/* Courbe principale */}
                    <path d={pathD} fill="none" stroke={cat.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"/>

                    {/* Points */}
                    {r2.map((r,i)=>{
                      const cx=xOf(i), cy=yOf(r.pct);
                      const col=pct2col(r.pct);
                      const showLabel=n<=12;
                      return (
                        <g key={i}>
                          {/* Halo */}
                          <circle cx={cx} cy={cy} r={7} fill={col} fillOpacity={0.15}/>
                          {/* Point */}
                          <circle cx={cx} cy={cy} r={4} fill={col} stroke={C.card} strokeWidth={2}/>
                          {/* Label score */}
                          {showLabel&&(
                            <text x={cx} y={cy-11} fontSize={9} fill={col} textAnchor="middle" fontFamily="Oswald,sans-serif" fontWeight="700">{r.pct}%</text>
                          )}
                        </g>
                      );
                    })}

                    {/* Labels X (numéros tentatives) */}
                    {r2.map((r,i)=>(
                      n<=10&&<text key={i} x={xOf(i)} y={H-4} fontSize={8.5} fill={C.muted} textAnchor="middle" fontFamily="Barlow,sans-serif">#{i+1}</text>
                    ))}
                  </svg>

                  {/* Mini stats sous le graphique */}
                  <div style={{display:"flex",gap:16,marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                    <div style={{fontSize:12,color:C.muted}}>Meilleur : <strong style={{color:C.greenL}}>{best}%</strong></div>
                    <div style={{fontSize:12,color:C.muted}}>Plus bas : <strong style={{color:worst>=70?C.greenL:worst>=50?C.orange:C.red}}>{worst}%</strong></div>
                    {n>=2&&<div style={{fontSize:12,color:C.muted}}>Tendance : <strong style={{color:trend>0?C.greenL:trend<0?C.red:C.muted}}>{trend>0?"+":""}{trend}pts</strong></div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{fontFamily:"Oswald,sans-serif",fontSize:11,letterSpacing:3,textTransform:"uppercase",color:C.muted,marginBottom:16}}>Grades & Badges</div>
          {(()=>{
            const unlocked=getUnlocked(myResults,cats);
            const unlockedIds=new Set(unlocked.map(b=>b.id));
            const grades=BADGES.filter(b=>b.grade);
            const thematic=BADGES.filter(b=>!b.grade);
            const stats=computeStats(myResults);
            const currentGradeIdx=grades.reduce((acc,b,i)=>unlockedIds.has(b.id)?i:acc,-1);
            const currentGrade=grades[currentGradeIdx];
            const nextGrade=grades[currentGradeIdx+1];
            return (
              <div style={{marginBottom:32}}>
                {currentGrade&&(
                  <div style={{background:`linear-gradient(135deg,${currentGrade.color}18,${currentGrade.color}06)`,border:`1px solid ${currentGrade.color}44`,borderRadius:8,padding:"16px 20px",marginBottom:20,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                    <GradeInsignia id={currentGrade.id} unlocked={true} size={64}/>
                    <div style={{flex:1,minWidth:160}}>
                      <div style={{fontFamily:"Oswald,sans-serif",fontSize:10,letterSpacing:3,color:currentGrade.color,textTransform:"uppercase",marginBottom:3}}>Grade actuel</div>
                      <div style={{fontFamily:"Oswald,sans-serif",fontSize:20,fontWeight:700}}>{currentGrade.name}</div>
                      {nextGrade&&<div style={{color:C.muted,fontSize:12,marginTop:3}}>Suivant : <strong style={{color:C.text2}}>{nextGrade.name}</strong></div>}
                    </div>
                  </div>
                )}
                <div style={{fontFamily:"Oswald,sans-serif",fontSize:10,letterSpacing:3,textTransform:"uppercase",color:C.muted,marginBottom:10}}>Grades ({grades.filter(b=>unlockedIds.has(b.id)).length}/{grades.length})</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(85px,1fr))",gap:7,marginBottom:20}}>
                  {grades.map(b=><BadgeCard key={b.id} badge={b} unlocked={unlockedIds.has(b.id)} stats={stats}/>)}
                </div>
                <div style={{fontFamily:"Oswald,sans-serif",fontSize:10,letterSpacing:3,textTransform:"uppercase",color:C.muted,marginBottom:10}}>Badges spéciaux ({thematic.filter(b=>unlockedIds.has(b.id)).length}/{thematic.length})</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(85px,1fr))",gap:7}}>
                  {thematic.map(b=><BadgeCard key={b.id} badge={b} unlocked={unlockedIds.has(b.id)}/>)}
                </div>
              </div>
            );
          })()}
          <div style={{fontFamily:"Oswald,sans-serif",fontSize:11,letterSpacing:3,textTransform:"uppercase",color:C.muted,marginBottom:16}}>Historique détaillé</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {myResults.map(r=>(
              <div key={r.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:4,padding:"12px 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:r.color||C.red,flexShrink:0}}/>
                  <div><div style={{fontSize:13,fontWeight:600}}>{r.cat_name}</div><div style={{color:C.muted,fontSize:11}}>{fmtDate(r.created_at)}</div></div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <span style={{color:C.muted,fontSize:12}}>{r.score}/{r.total}</span>
                  <ScorePill pct={r.pct}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Wrap>
    );
  }

  // ── EXAM ───────────────────────────────────────────────────
  if(page==="exam"){
    const q=examList[examIdx];
    const isCorrect=picked===q.correct;

    // Stats en temps réel
    const doneCount   = log.length;
    const correctCount = log.filter(x=>x.correct).length;
    const livePct     = doneCount>0 ? Math.round((correctCount/doneCount)*100) : null;
    const progressPct = ((examIdx)/examList.length)*100;

    // Timer par question
    const timerPct = timerOn&&examMode!=="all" ? (timeLeft/TIMER_DEFAULT)*100 : 100;
    const timerCol = timeLeft>15?C.greenL:timeLeft>5?C.orange:C.red;

    // Timer global (Examen Blanc)
    const globalPct = examMode==="all" ? (globalTime/EXAMEN_BLANC_TIMER)*100 : 100;
    const globalCol = globalTime>600?C.greenL:globalTime>120?C.orange:C.red;

    return (
      <Wrap>
        {/* Barre progression questions */}
        <div style={{height:4,background:C.border}}>
          <div style={{height:"100%",background:C.red,width:`${progressPct}%`,transition:"width 0.4s ease"}}/>
        </div>
        {/* Barre timer par question */}
        {timerOn&&examMode!=="all"&&(
          <div style={{height:3,background:C.border}}>
            <div style={{height:"100%",background:timerCol,width:`${timerPct}%`,transition:"width 1s linear"}}/>
          </div>
        )}

        {/* Header exam */}
        <div style={{background:C.surf,borderBottom:`1px solid ${C.border}`,padding:"0 24px",height:52,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:examMode==="all"?C.red:examMode==="revision"?C.orange:examCat?.color||C.purple}}/>
            <span style={{color:C.text2,fontSize:13,fontFamily:"Oswald,sans-serif",letterSpacing:1}}>
              {examMode==="all"?"EXAMEN BLANC":examMode==="revision"?"MODE RÉVISION":examCat?.name?.toUpperCase()}
            </span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            {/* Timer par question */}
            {timerOn&&examMode!=="all"&&<span style={{fontFamily:"Oswald,sans-serif",fontSize:16,color:timerCol,fontWeight:700,minWidth:28,textAlign:"center"}}>{timeLeft}s</span>}
            {/* Timer global Examen Blanc */}
            {examMode==="all"&&(
              <div style={{display:"flex",alignItems:"center",gap:8,background:C.card,border:`1px solid ${globalCol}44`,borderRadius:4,padding:"5px 12px"}}>
                <span style={{fontSize:14}}>⏱</span>
                <span style={{fontFamily:"Oswald,sans-serif",fontSize:15,color:globalCol,fontWeight:700}}>{fmtTimer(globalTime)}</span>
              </div>
            )}
            <span style={{fontFamily:"Oswald,sans-serif",color:C.muted,fontSize:14,letterSpacing:1}}>{examIdx+1} / {examList.length}</span>
          </div>
        </div>

        {/* ── BARRE DE PROGRESSION EN TEMPS RÉEL ── */}
        {doneCount>0&&(
          <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:"10px 24px",display:"flex",alignItems:"center",gap:16}}>
            {/* Barre visuelle */}
            <div style={{flex:1,background:C.bg,borderRadius:99,height:8,overflow:"hidden",position:"relative"}}>
              {/* Bonnes réponses (vert) */}
              <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${(correctCount/examList.length)*100}%`,background:C.greenL,borderRadius:99,transition:"width 0.4s"}}/>
              {/* Mauvaises réponses (rouge) */}
              <div style={{position:"absolute",left:`${(correctCount/examList.length)*100}%`,top:0,height:"100%",width:`${((doneCount-correctCount)/examList.length)*100}%`,background:C.red,borderRadius:99,transition:"width 0.4s"}}/>
            </div>
            {/* Stats texte */}
            <div style={{display:"flex",alignItems:"center",gap:14,flexShrink:0}}>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:C.greenL}}/>
                <span style={{fontFamily:"Oswald,sans-serif",fontSize:14,fontWeight:700,color:C.greenL}}>{correctCount}</span>
                <span style={{color:C.muted,fontSize:12}}>/ {doneCount}</span>
              </div>
              {livePct!==null&&(
                <div style={{background:pct2col(livePct)+"18",border:`1px solid ${pct2col(livePct)}44`,borderRadius:4,padding:"3px 10px"}}>
                  <span style={{fontFamily:"Oswald,sans-serif",fontSize:14,fontWeight:700,color:pct2col(livePct)}}>{livePct}%</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{maxWidth:680,margin:"0 auto",padding:"36px 24px"}}>
          <div style={{fontFamily:"Oswald,sans-serif",fontSize:"clamp(18px,3vw,24px)",fontWeight:500,lineHeight:1.55,marginBottom:32}}>{q.text}</div>

          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:24}}>
            {q.opts.map((opt,i)=>{
              let bg=C.card,brd=`1px solid ${C.border}`,clr=C.text,shadow2="none";
              if(!shown&&picked===i){bg="#14162e";brd=`1px solid ${C.blueL}`;shadow2=`0 0 0 2px ${C.blueL}22`;}
              if(shown){
                if(i===q.correct){bg="#081e10";brd=`1px solid ${C.greenL}`;clr=C.greenL;shadow2=`0 0 0 1px ${C.greenL}22`;}
                else if(i===picked&&i!==q.correct){bg="#1e0808";brd=`1px solid ${C.red}`;clr=C.text2;}
              }
              return (
                <div key={i} onClick={()=>!shown&&setPicked(i)}
                  style={{background:bg,border:brd,borderRadius:6,padding:"14px 18px",cursor:shown?"default":"pointer",display:"flex",alignItems:"center",gap:14,color:clr,transition:"all 0.15s",boxShadow:shadow2}}>
                  <span style={{fontFamily:"Oswald,sans-serif",fontSize:13,fontWeight:700,minWidth:24,color:shown&&i===q.correct?C.greenL:shown&&i===picked&&i!==q.correct?C.red:"#404050"}}>{LABELS[i]}</span>
                  <span style={{fontSize:15,flex:1,lineHeight:1.5}}>{opt}</span>
                  {shown&&i===q.correct&&<span style={{color:C.greenL,fontWeight:700,fontSize:16}}>✓</span>}
                  {shown&&i===picked&&i!==q.correct&&<span style={{color:C.red,fontWeight:700,fontSize:16}}>✗</span>}
                </div>
              );
            })}
          </div>

          {shown&&q.expl&&(
            <div style={{background:isCorrect?"#071a0e":"#1a0707",border:`1px solid ${isCorrect?"#1c4228":"#4a1818"}`,borderRadius:6,padding:"14px 18px",marginBottom:24}}>
              <div style={{color:isCorrect?C.greenL:C.orange,fontSize:13,fontWeight:700,marginBottom:6}}>{isCorrect?"✓ Bonne réponse !":"✗ Mauvaise réponse"}</div>
              <div style={{color:C.text2,fontSize:14,lineHeight:1.65}}>{q.expl}</div>
            </div>
          )}

          {!shown
            ?<Btn onClick={()=>doValidate()} disabled={picked===null} full>{picked===null?"Choisissez une réponse":"VALIDER MA RÉPONSE ✓"}</Btn>
            :<Btn onClick={nextQ} full>{examIdx+1>=examList.length?"VOIR LES RÉSULTATS →":"QUESTION SUIVANTE →"}</Btn>
          }
        </div>
      </Wrap>
    );
  }

  // ── RESULTS ────────────────────────────────────────────────
  if(page==="results"){
    const sc=log.filter(x=>x.correct).length;
    const total=examList.length;
    const pct=Math.round((sc/total)*100);
    const passed=pct>=70;
    const emoji=pct>=95?"🏆":pct>=80?"✅":pct>=60?"⚠️":"❌";
    return (
      <Wrap>
        <div style={{maxWidth:680,margin:"0 auto",padding:"52px 24px",textAlign:"center"}}>
          <div style={{fontSize:56,marginBottom:14}}>{emoji}</div>
          <div style={{fontFamily:"Oswald,sans-serif",fontSize:"clamp(56px,14vw,96px)",fontWeight:700,color:pct2col(pct),lineHeight:1}}>{pct}%</div>
          <div style={{color:C.text2,fontSize:17,marginTop:10}}>{sc} / {total} bonnes réponses</div>
          <div style={{fontFamily:"Oswald,sans-serif",fontSize:15,letterSpacing:4,textTransform:"uppercase",color:pct2col(pct),marginTop:12}}>
            {pct>=95?"Exceptionnel !":pct>=80?"Excellent !":pct>=70?"Réussi":pct>=50?"À améliorer":"Insuffisant"}
          </div>
          <div style={{background:C.border,borderRadius:99,height:6,margin:"28px auto",maxWidth:260,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${pct}%`,background:pct2col(pct),borderRadius:99,transition:"width 1s ease"}}/>
          </div>

          {newBadges.length>0&&(
            <div style={{background:C.card,border:`1px solid ${C.yellowL}44`,borderRadius:8,padding:"20px",marginBottom:28}}>
              <div style={{fontFamily:"Oswald,sans-serif",color:C.yellowL,fontSize:13,letterSpacing:2,marginBottom:14}}>🏅 NOUVEAU{newBadges.length>1?"X":""} BADGE{newBadges.length>1?"S":""} DÉBLOQUÉ{newBadges.length>1?"S":""} !</div>
              <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
                {newBadges.map(b=>(
                  <div key={b.id} style={{textAlign:"center",padding:"10px 14px",background:b.color+"18",border:`1px solid ${b.color}66`,borderRadius:6}}>
                    <div style={{fontSize:28}}>{b.icon}</div>
                    <div style={{fontFamily:"Oswald,sans-serif",fontSize:11,color:b.color,letterSpacing:1,marginTop:4}}>{b.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{textAlign:"left",marginBottom:32}}>
            {examList.map((q,i)=>{
              const ok=log[i]?.correct;
              const cat=cats.find(c=>c.id===q.catId);
              return (
                <div key={q.id} style={{display:"flex",gap:12,padding:"12px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{color:ok?C.greenL:C.red,flexShrink:0,fontWeight:700,marginTop:2,fontSize:16}}>{ok?"✓":"✗"}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,color:ok?C.text:C.text2,lineHeight:1.5}}>{q.text}</div>
                    {!ok&&<div style={{fontSize:12,color:C.muted,marginTop:3}}>Bonne réponse : <strong style={{color:C.text}}>{q.opts[q.correct]}</strong></div>}
                    {cat&&<span style={{fontSize:10,color:cat.color,marginTop:4,display:"inline-block"}}>{cat.name}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
            {examMode==="all"?<Btn onClick={()=>openPreExam(null,"all")}>🔄 Nouvel examen blanc</Btn>:examCat?<Btn onClick={()=>openPreExam(examCat,examMode)}>🔄 Recommencer</Btn>:null}
            <Btn onClick={()=>setPage("history")} ghost>📊 Mon bilan</Btn>
            <Btn onClick={()=>setPage("home")} ghost>← Accueil</Btn>
          </div>
        </div>
      </Wrap>
    );
  }

  // ── ADMIN ──────────────────────────────────────────────────
  if(page==="admin"){
    const enterTab=async tab=>{setAdminTab(tab);setEditQ(null);setEditCat(null);setEditDoc(null);setSaveErr("");if(tab==="classement")await loadAllResults();};
    const filteredResults=classFilter==="all"?allResults:allResults.filter(r=>r.cat_id===classFilter);
    const pseudos=[...new Set(filteredResults.map(r=>r.pseudo))];
    const leaderboard=pseudos.map(p=>{
      const pr=filteredResults.filter(r=>r.pseudo===p);
      return {pseudo:p,count:pr.length,avg:Math.round(pr.reduce((a,r)=>a+r.pct,0)/pr.length),best:Math.max(...pr.map(r=>r.pct)),last:pr[0]?.created_at};
    }).sort((a,b)=>b.avg-a.avg);

    return (
      <Wrap>
        <div style={{background:C.surf,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",height:56}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:16}}>🔥</span>
            <span style={{fontFamily:"Oswald,sans-serif",fontSize:13,letterSpacing:3,textTransform:"uppercase"}}>Administration</span>
            <span style={{background:C.red,color:"#fff",fontSize:10,fontWeight:700,padding:"2px 9px",borderRadius:20}}>ADMIN</span>
          </div>
          <button onClick={()=>setPage("home")} style={{background:"transparent",color:C.muted,border:"none",cursor:"pointer",fontSize:13,fontFamily:"'Barlow',sans-serif"}} onMouseEnter={e=>e.currentTarget.style.color=C.text2} onMouseLeave={e=>e.currentTarget.style.color=C.muted}>← Retour au site</button>
        </div>
        <div style={{background:C.surf,borderBottom:`1px solid ${C.border}`,display:"flex",padding:"0 20px",overflowX:"auto"}}>
          {[["qs","📋 Questions"],["cats","🗂 Catégories"],["documents","📚 Documents"],["classement","🏆 Classement"],["settings","⚙ Paramètres"]].map(([k,l])=>(
            <button key={k} onClick={()=>enterTab(k)} style={{background:"none",border:"none",borderBottom:`2px solid ${adminTab===k?C.red:"transparent"}`,color:adminTab===k?C.text:C.muted,padding:"14px 16px",cursor:"pointer",fontFamily:"'Barlow',sans-serif",fontWeight:700,fontSize:14,whiteSpace:"nowrap",transition:"all 0.15s"}}>{l}</button>
          ))}
        </div>
        <div style={{maxWidth:960,margin:"0 auto",padding:"32px 24px"}}>

          {adminTab==="qs"&&!editQ&&(()=>{
            // Filtrage + tri
            const term = qSearch.toLowerCase().trim();
            const filtered = qs
              .filter(q=>{
                const catOk = qCatFilter==="all" || q.catId===qCatFilter;
                const textOk = !term || q.text.toLowerCase().includes(term) || q.opts.some(o=>o.toLowerCase().includes(term));
                return catOk && textOk;
              })
              .sort((a,b)=>{
                if(qSort==="alpha") return a.text.localeCompare(b.text,"fr");
                if(qSort==="cat"){
                  const ca=cats.find(c=>c.id===a.catId)?.name||"";
                  const cb=cats.find(c=>c.id===b.catId)?.name||"";
                  return ca.localeCompare(cb,"fr");
                }
                return 0; // "date" = ordre de la DB
              });
            return (<>
              {/* Header */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <h2 style={{fontFamily:"Oswald,sans-serif",fontSize:16,letterSpacing:2,textTransform:"uppercase",margin:0}}>Questions</h2>
                  <span style={{background:C.faint,color:C.muted,fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20}}>{filtered.length}/{qs.length}</span>
                </div>
                <Btn onClick={()=>{setSaveErr("");setEditQ({catId:cats[0]?.id||"",text:"",opts:["","","",""],correct:0,expl:""});}} disabled={cats.length===0} sm>+ Ajouter</Btn>
              </div>

              {/* Barre de recherche + filtres */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:"16px 18px",marginBottom:18,display:"flex",flexDirection:"column",gap:12}}>
                {/* Recherche texte */}
                <div style={{position:"relative"}}>
                  <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:15,pointerEvents:"none"}}>🔍</span>
                  <input
                    value={qSearch} onChange={e=>setQSearch(e.target.value)}
                    placeholder="Rechercher dans les questions ou les réponses..."
                    style={{width:"100%",background:C.surf,border:`1px solid ${C.border2}`,borderRadius:4,color:C.text,padding:"10px 14px 10px 38px",fontSize:14,fontFamily:"'Barlow',sans-serif",outline:"none",boxSizing:"border-box"}}
                  />
                  {qSearch&&<button onClick={()=>setQSearch("")} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16,lineHeight:1}}>✕</button>}
                </div>

                {/* Filtres */}
                <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                  {/* Filtre catégorie */}
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",flex:1}}>
                    <button onClick={()=>setQCatFilter("all")} style={{background:qCatFilter==="all"?C.text:"transparent",color:qCatFilter==="all"?C.bg:C.muted,border:`1px solid ${qCatFilter==="all"?C.text:C.border2}`,borderRadius:20,padding:"4px 14px",cursor:"pointer",fontSize:12,fontFamily:"'Barlow',sans-serif",fontWeight:700,transition:"all 0.15s"}}>
                      Toutes catégories
                    </button>
                    {cats.map(cat=>(
                      <button key={cat.id} onClick={()=>setQCatFilter(qCatFilter===cat.id?"all":cat.id)} style={{background:qCatFilter===cat.id?cat.color:"transparent",color:qCatFilter===cat.id?"#fff":C.muted,border:`1px solid ${qCatFilter===cat.id?cat.color:C.border2}`,borderRadius:20,padding:"4px 14px",cursor:"pointer",fontSize:12,fontFamily:"'Barlow',sans-serif",fontWeight:600,transition:"all 0.15s"}}>
                        {cat.name}
                      </button>
                    ))}
                  </div>

                  {/* Tri */}
                  <div style={{display:"flex",background:C.surf,borderRadius:4,border:`1px solid ${C.border2}`,overflow:"hidden",flexShrink:0}}>
                    {[["date","📅 Date"],["alpha","🔤 A→Z"],["cat","🗂 Catégorie"]].map(([k,l])=>(
                      <button key={k} onClick={()=>setQSort(k)} style={{background:qSort===k?C.border2:"transparent",color:qSort===k?C.text:C.muted,border:"none",borderRight:`1px solid ${C.border}`,padding:"5px 12px",cursor:"pointer",fontSize:11,fontFamily:"'Barlow',sans-serif",fontWeight:700,transition:"all 0.15s",whiteSpace:"nowrap"}}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Résumé filtre */}
                {(term||qCatFilter!=="all")&&(
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <span style={{color:C.muted,fontSize:12}}>
                      {filtered.length} résultat{filtered.length!==1?"s":""} trouvé{filtered.length!==1?"s":""}
                      {term&&<span> pour <strong style={{color:C.text}}>"{qSearch}"</strong></span>}
                      {qCatFilter!=="all"&&<span> dans <strong style={{color:cats.find(c=>c.id===qCatFilter)?.color}}>{cats.find(c=>c.id===qCatFilter)?.name}</strong></span>}
                    </span>
                    <button onClick={()=>{setQSearch("");setQCatFilter("all");}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:12,fontFamily:"'Barlow',sans-serif",textDecoration:"underline"}}>
                      Effacer les filtres
                    </button>
                  </div>
                )}
              </div>

              {cats.length===0&&<div style={{color:C.orange,fontSize:13,background:"#1a120822",border:`1px solid ${C.orange}44`,borderRadius:4,padding:"10px 14px",marginBottom:14}}>⚠ Créez d'abord une catégorie.</div>}

              {filtered.length===0?(
                <div style={{textAlign:"center",color:C.muted,padding:"50px 0"}}>
                  <div style={{fontSize:36,marginBottom:12}}>🔍</div>
                  <div style={{fontSize:15,marginBottom:6}}>{qs.length===0?"Aucune question.":"Aucun résultat pour cette recherche."}</div>
                  {qs.length>0&&<div style={{fontSize:13}}>Essayez d'autres mots-clés ou changez les filtres.</div>}
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {filtered.map((q,idx)=>{
                    const cat=cats.find(c=>c.id===q.catId);
                    return (
                      <div key={q.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:4,padding:"12px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,transition:"border-color 0.15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.border2} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                        <div style={{display:"flex",alignItems:"center",gap:12,flex:1,minWidth:0}}>
                          <span style={{color:C.muted,fontSize:11,fontFamily:"Oswald,sans-serif",fontWeight:700,flexShrink:0,minWidth:24,textAlign:"right"}}>{idx+1}</span>
                          <div style={{flex:1,minWidth:0}}>
                            {/* Surlignage du terme recherché */}
                            <div style={{fontSize:14,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3}}>
                              {term ? q.text.split(new RegExp(`(${qSearch})`, "gi")).map((part,i)=>
                                part.toLowerCase()===term
                                  ? <mark key={i} style={{background:C.yellowL+"44",color:C.text,borderRadius:2,padding:"0 2px"}}>{part}</mark>
                                  : part
                              ) : q.text}
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              {cat&&<span style={{fontSize:11,color:cat.color,fontWeight:600,background:cat.color+"18",borderRadius:20,padding:"1px 8px"}}>{cat.name}</span>}
                              <span style={{fontSize:11,color:C.muted}}>{q.opts.length} réponses</span>
                            </div>
                          </div>
                        </div>
                        <div style={{display:"flex",gap:8,flexShrink:0}}>
                          <button onClick={()=>{setSaveErr("");setEditQ({...q});}} style={{background:C.card2,border:`1px solid ${C.border2}`,color:C.text2,borderRadius:4,padding:"5px 12px",cursor:"pointer",fontSize:12,fontFamily:"'Barlow',sans-serif",fontWeight:600}}>✏ Éditer</button>
                          <button onClick={()=>setDelConfirm({type:"q",id:q.id})} style={{background:"#1e080822",border:"1px solid #4a181844",color:"#e05050",borderRadius:4,padding:"5px 10px",cursor:"pointer",fontSize:12}}>🗑</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>);
          })()}
          {adminTab==="qs"&&editQ&&<QForm initial={editQ} cats={cats} qs={qs} onSave={saveQ} onCancel={()=>setEditQ(null)} saving={saving} saveErr={saveErr}/>}

          {adminTab==="cats"&&!editCat&&(<>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}><h2 style={{fontFamily:"Oswald,sans-serif",fontSize:16,letterSpacing:2,textTransform:"uppercase",margin:0}}>Catégories</h2><span style={{background:C.faint,color:C.muted,fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20}}>{cats.length}</span></div>
              <Btn onClick={()=>{setSaveErr("");setEditCat({name:"",desc:"",color:"#e8392a"});}} sm>+ Ajouter</Btn>
            </div>
            {cats.length===0?<div style={{textAlign:"center",color:C.muted,padding:"60px 0"}}>Aucune catégorie.</div>:(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {cats.map(cat=>{
                  const count=qs.filter(q=>q.catId===cat.id).length;
                  return (
                    <div key={cat.id} style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${cat.color}`,borderRadius:4,padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div><div style={{fontWeight:700,fontSize:14,marginBottom:3}}>{cat.name}</div><div style={{fontSize:12,color:C.muted}}>{cat.desc} · {count} question{count!==1?"s":""}</div></div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>{setSaveErr("");setEditCat({...cat});}} style={{background:C.card2,border:`1px solid ${C.border2}`,color:C.text2,borderRadius:4,padding:"5px 12px",cursor:"pointer",fontSize:12,fontFamily:"'Barlow',sans-serif",fontWeight:600}}>✏ Éditer</button>
                        <button onClick={()=>setDelConfirm({type:"cat",id:cat.id})} style={{background:"#1e080822",border:"1px solid #4a181844",color:"#e05050",borderRadius:4,padding:"5px 10px",cursor:"pointer",fontSize:12}}>🗑</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>)}
          {adminTab==="cats"&&editCat&&<CatForm initial={editCat} cats={cats} onSave={saveCat} onCancel={()=>setEditCat(null)} saving={saving} saveErr={saveErr}/>}

          {adminTab==="documents"&&!editDoc&&(<>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}><h2 style={{fontFamily:"Oswald,sans-serif",fontSize:16,letterSpacing:2,textTransform:"uppercase",margin:0}}>Documents</h2><span style={{background:C.faint,color:C.muted,fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20}}>{docs.length}</span></div>
              <Btn onClick={()=>{setSaveErr("");setEditDoc({catId:cats[0]?.id||"",title:"",type:"source",description:"",url:""});}} disabled={cats.length===0} sm>+ Ajouter</Btn>
            </div>
            {docs.length===0?<div style={{textAlign:"center",color:C.muted,padding:"60px 0"}}><div style={{fontSize:36,marginBottom:10}}>📂</div>Aucun document.</div>:(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {docs.map(doc=>{
                  const cat=cats.find(c=>c.id===doc.catId);
                  const dtype=DOC_TYPES.find(t=>t.key===doc.type);
                  return (
                    <div key={doc.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:4,padding:"12px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:16}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",gap:8,marginBottom:4}}><span style={{fontSize:11,color:dtype?.color,fontWeight:600}}>{dtype?.icon} {dtype?.label}</span>{cat&&<span style={{fontSize:11,color:cat.color,fontWeight:600}}>· {cat.name}</span>}</div>
                        <div style={{fontSize:14,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{doc.title}</div>
                      </div>
                      <div style={{display:"flex",gap:8,flexShrink:0}}>
                        <button onClick={()=>{setSaveErr("");setEditDoc({...doc});}} style={{background:C.card2,border:`1px solid ${C.border2}`,color:C.text2,borderRadius:4,padding:"5px 12px",cursor:"pointer",fontSize:12,fontFamily:"'Barlow',sans-serif",fontWeight:600}}>✏ Éditer</button>
                        <button onClick={()=>setDelConfirm({type:"doc",id:doc.id})} style={{background:"#1e080822",border:"1px solid #4a181844",color:"#e05050",borderRadius:4,padding:"5px 10px",cursor:"pointer",fontSize:12}}>🗑</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>)}
          {adminTab==="documents"&&editDoc&&<DocForm initial={editDoc} cats={cats} docs={docs} onSave={saveDoc} onCancel={()=>setEditDoc(null)} saving={saving} saveErr={saveErr}/>}

          {adminTab==="classement"&&(
            <div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:10}}>
                <h2 style={{fontFamily:"Oswald,sans-serif",fontSize:16,letterSpacing:2,textTransform:"uppercase",margin:0}}>Classement général</h2>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                  <button onClick={()=>setClassFilter("all")} style={{background:classFilter==="all"?C.red:"transparent",color:classFilter==="all"?"#fff":C.muted,border:`1px solid ${classFilter==="all"?C.red:C.border2}`,borderRadius:4,padding:"5px 12px",cursor:"pointer",fontSize:12,fontFamily:"'Barlow',sans-serif",fontWeight:600}}>Toutes</button>
                  {cats.map(cat=><button key={cat.id} onClick={()=>setClassFilter(cat.id)} style={{background:classFilter===cat.id?cat.color:"transparent",color:classFilter===cat.id?"#fff":C.muted,border:`1px solid ${classFilter===cat.id?cat.color:C.border2}`,borderRadius:4,padding:"5px 12px",cursor:"pointer",fontSize:12,fontFamily:"'Barlow',sans-serif",fontWeight:600}}>{cat.name}</button>)}
                  <button onClick={loadAllResults} style={{background:C.card2,border:`1px solid ${C.border2}`,color:C.muted,borderRadius:4,padding:"5px 10px",cursor:"pointer",fontSize:12}}>🔄</button>
                </div>
              </div>
              {allResults.length>0&&(
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:28}}>
                  {[{l:"Participants",v:[...new Set(allResults.map(r=>r.pseudo))].length,col:C.blueL},{l:"Examens passés",v:allResults.length,col:C.orange},{l:"Moyenne générale",v:Math.round(allResults.reduce((a,r)=>a+r.pct,0)/allResults.length)+"%",col:C.greenL}].map((st,i)=>(
                    <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:"14px",textAlign:"center"}}>
                      <div style={{fontFamily:"Oswald,sans-serif",fontSize:26,fontWeight:700,color:st.col}}>{st.v}</div>
                      <div style={{color:C.muted,fontSize:12,marginTop:4}}>{st.l}</div>
                    </div>
                  ))}
                </div>
              )}
              {leaderboard.length===0?<div style={{textAlign:"center",color:C.muted,padding:"60px 0"}}><div style={{fontSize:34,marginBottom:10}}>🏆</div>Aucun résultat.</div>:(<>
                <div style={{fontFamily:"Oswald,sans-serif",fontSize:11,letterSpacing:3,textTransform:"uppercase",color:C.muted,marginBottom:12}}>Classement par participant</div>
                <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:32}}>
                  {leaderboard.map((entry,rank)=>{
                    const medal=rank===0?"🥇":rank===1?"🥈":rank===2?"🥉":`#${rank+1}`;
                    return (
                      <div key={entry.pseudo} style={{background:C.card,border:`1px solid ${rank===0?"#403818":C.border}`,borderRadius:4,padding:"13px 18px",display:"flex",alignItems:"center",gap:16}}>
                        <span style={{fontFamily:"Oswald,sans-serif",fontSize:rank<3?22:14,minWidth:32,textAlign:"center",color:C.muted}}>{medal}</span>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:700,fontSize:15,marginBottom:6}}>{entry.pseudo}</div>
                          <div style={{background:C.bg,borderRadius:99,height:4,maxWidth:200,overflow:"hidden"}}><div style={{height:"100%",width:`${entry.avg}%`,background:pct2col(entry.avg),borderRadius:99}}/></div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <ScorePill pct={entry.avg}/>
                          <div style={{color:C.muted,fontSize:11,marginTop:4}}>{entry.count} essai{entry.count>1?"s":""} · meilleur {entry.best}%</div>
                          {entry.last&&<div style={{color:C.muted,fontSize:10,marginTop:2}}>{timeAgo(entry.last)}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{fontFamily:"Oswald,sans-serif",fontSize:11,letterSpacing:3,textTransform:"uppercase",color:C.muted,marginBottom:12}}>Toutes les tentatives</div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {filteredResults.map(r=>(
                    <div key={r.id} style={{background:C.surf,border:`1px solid ${C.border}`,borderRadius:4,padding:"8px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:6,height:6,borderRadius:"50%",background:r.color||C.red}}/>
                        <span style={{fontWeight:700,fontSize:13}}>{r.pseudo}</span>
                        <span style={{color:C.muted,fontSize:12}}>→ {r.cat_name}</span>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:12}}>
                        <span style={{color:C.muted,fontSize:11}}>{fmtDate(r.created_at)}</span>
                        <span style={{color:C.muted,fontSize:12}}>{r.score}/{r.total}</span>
                        <ScorePill pct={r.pct}/>
                      </div>
                    </div>
                  ))}
                </div>
              </>)}
            </div>
          )}

          {adminTab==="settings"&&(
            <div style={{maxWidth:480}}>
              <h2 style={{fontFamily:"Oswald,sans-serif",fontSize:16,letterSpacing:2,textTransform:"uppercase",marginBottom:28}}>Paramètres du compte</h2>
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:24,marginBottom:14}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>Changer mon pseudo</div>
                <div style={{color:C.muted,fontSize:12,marginBottom:14}}>Actuel : <strong style={{color:C.text}}>{pseudo}</strong></div>
                <Field value={newPseudo} onChange={e=>{setNewPseudo(e.target.value);setPseudoOk(false);}} placeholder="Nouveau pseudo..."/>
                {pseudoOk&&<OkBox msg="✓ Pseudo mis à jour !"/>}
                <div style={{marginTop:12}}><Btn onClick={savePseudo} disabled={!newPseudo.trim()} color={C.greenL} sm>Enregistrer</Btn></div>
              </div>
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:24,marginBottom:14}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:14}}>Changer mon mot de passe</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <Field type="password" value={newPw} onChange={e=>{setNewPw(e.target.value);setPwOk(false);setPwErr("");}} placeholder="Nouveau mot de passe (min. 6 car.)"/>
                  <Field type="password" value={newPw2} onChange={e=>{setNewPw2(e.target.value);setPwErr("");}} placeholder="Confirmer le mot de passe"/>
                </div>
                {pwErr&&<ErrBox msg={pwErr}/>}
                {pwOk&&<OkBox msg="✓ Mot de passe mis à jour !"/>}
                <div style={{marginTop:12}}><Btn onClick={savePw} disabled={!newPw||!newPw2} color={C.red} sm>Mettre à jour</Btn></div>
              </div>
              <div style={{background:"#141208",border:"1px solid #303010",borderRadius:6,padding:"14px 18px"}}>
                <div style={{color:C.yellowL,fontSize:13,fontWeight:700,marginBottom:6}}>Informations du compte</div>
                <div style={{color:C.muted,fontSize:13}}>Email : <strong style={{color:C.text}}>{user?.email}</strong></div>
                <div style={{color:C.muted,fontSize:13,marginTop:4}}>Statut : <strong style={{color:C.greenL}}>Administrateur ✓</strong></div>
              </div>
            </div>
          )}
        </div>

        {delConfirm&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,padding:24,backdropFilter:"blur(4px)"}}>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderTop:`3px solid ${C.red}`,borderRadius:8,padding:32,maxWidth:380,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.6)"}}>
              <div style={{fontFamily:"Oswald,sans-serif",fontSize:18,marginBottom:10}}>Confirmer la suppression</div>
              <p style={{color:C.text2,fontSize:14,marginBottom:28,lineHeight:1.6}}>
                {delConfirm.type==="cat"?"⚠ Supprimer cette catégorie supprimera aussi toutes ses questions et documents.":delConfirm.type==="doc"?"Ce document sera définitivement supprimé.":"Cette action est irréversible."}
              </p>
              <div style={{display:"flex",gap:10}}>
                <Btn onClick={()=>{if(delConfirm.type==="q")deleteQ(delConfirm.id);else if(delConfirm.type==="doc")deleteDoc(delConfirm.id);else deleteCat(delConfirm.id);}} full danger>Supprimer définitivement</Btn>
                <Btn onClick={()=>setDelConfirm(null)} ghost full>Annuler</Btn>
              </div>
            </div>
          </div>
        )}
      </Wrap>
    );
  }

  return null;
}
