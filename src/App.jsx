
import { useState, useEffect, useRef } from "react";

// ─── Storage ──────────────────────────────────────────────────────────────────
const SK = "cotipp_v6";
const SK_CFG = "cotipp_cfg";
const DEF = { players: [], events: [], answers: {}, paid: {} };
const DEF_CFG = { serviceId:"", templateId:"", publicKey:"", mailsSent:{} };
async function load() {
  try { const r = await window.storage.get(SK, true); return r ? JSON.parse(r.value) : DEF; } catch { return DEF; }
}
async function save(d) { try { await window.storage.set(SK, JSON.stringify(d), true); } catch {} }
async function loadCfg() {
  try { const r = await window.storage.get(SK_CFG, true); return r ? {...DEF_CFG,...JSON.parse(r.value)} : DEF_CFG; } catch { return DEF_CFG; }
}
async function saveCfg(c) { try { await window.storage.set(SK_CFG, JSON.stringify(c), true); } catch {} }

async function sendRankingMail(cfg, player, rank, pot, eventTitle) {
  const { serviceId, templateId, publicKey } = cfg;
  const prizeAmt = i => { if(!pot) return ""; if(i===0) return ` -> CHF ${(pot*.6).toFixed(2)}`; if(i===1) return ` -> CHF ${(pot*.3).toFixed(2)}`; if(i===2) return ` -> CHF ${(pot*.1).toFixed(2)}`; return ""; };
  const medal = i => i===0?"1.":i===1?"2.":i===2?"3.":`${i+1}.`;
  const rankingText = rank.map((p,i)=>`${medal(i)} ${p.name}: ${p.pts} Punkte${prizeAmt(i)}`).join("\n");
  const myIdx = rank.findIndex(p=>p.id===player.id);
  const myPts = rank[myIdx]?.pts ?? 0;
  const prizeText = myIdx>=0 && pot ? (prizeAmt(myIdx).replace(" -> ","")) : "";
  if(!window.emailjs) {
    await new Promise((res,rej)=>{
      const s=document.createElement("script");
      s.src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
      s.onload=res; s.onerror=rej; document.head.appendChild(s);
    });
    window.emailjs.init({ publicKey });
  }
  return window.emailjs.send(serviceId, templateId, {
    to_email: player.email, to_name: player.name,
    event_title: eventTitle, ranking_text: rankingText,
    my_rank: myIdx>=0 ? myIdx+1 : "-", my_pts: myPts, prize_text: prizeText,
  });
}

// ─── Text normalisation ───────────────────────────────────────────────────────
function norm(str) {
  return String(str).toLowerCase().trim()
    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss")
    .replace(/sch/g,"sx").replace(/sh/g,"sx")
    .replace(/\s+/g," ");
}
function textMatch(a, b) { return norm(a) === norm(b); }

// ─── Scoring ──────────────────────────────────────────────────────────────────
function computeScores(events, answers, players) {
  const scores = {};
  for (const ev of events) {
    for (const q of (ev.questions||[])) {
      if (!q.solution && q.solution !== 0) continue;
      for (const p of players) {
        const k = `${p.id}_${q.id}`;
        const ans = answers[k];
        if (!ans && ans !== 0) { scores[k]=0; continue; }
        let ok = false;
        if (q.type==="choice"||q.type==="text") ok = textMatch(ans, q.solution);
        else if (q.type==="number") { const d=Math.abs(parseFloat(ans)-parseFloat(q.solution)); ok=!isNaN(d)&&d<=Number(q.tolerance); }
        scores[k] = ok ? q.points : 0;
      }
    }
  }
  return scores;
}

// ─── Utils ────────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2,10);
const ADMIN_PASS = "CoTipp2025";
const hasSol = q => q.solution!==null && q.solution!==undefined && q.solution!=="";
const totalPts = (pid, scores) => Object.entries(scores).filter(([k])=>k.startsWith(pid+"_")).reduce((s,[,v])=>s+(v||0),0);
const buildRank = (players, scores) => {
  const sorted = [...players].map(p=>({...p,pts:totalPts(p.id,scores)})).sort((a,b)=>b.pts-a.pts);
  let rank=1;
  return sorted.map((p,i)=>{
    if(i>0 && p.pts<sorted[i-1].pts) rank=i+1;
    return {...p, rank};
  });
};
// Calculate pot from paid players per event
const calcPot = (evId, players, paid, entryFee=10) => {
  const paidCount = players.filter(p=>(paid||{})[`${evId}_${p.id}`]).length;
  return paidCount * entryFee;
};
const isOpen = dl => new Date(dl)>Date.now();
const fmtDate = dl => new Date(dl).toLocaleString("de-CH",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
const countSolved = evs => evs.reduce((s,ev)=>s+(ev.questions||[]).filter(hasSol).length,0);
const countTotal  = evs => evs.reduce((s,ev)=>s+(ev.questions||[]).length,0);

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#f0f2f6;--w:#fff;--s1:#f7f8fa;--s2:#eef0f5;
  --b:#dde1ea;--b2:#c8cdd8;
  --blue:#0071e3;--bh:#005bbf;--bl:#e8f0fc;--bm:#c0d6f8;
  --green:#1a9e3f;--gl:#e6f5ec;
  --orange:#c96a00;--ol:#fff3e0;
  --red:#c0392b;--rl:#fdecea;
  --gold:#b8860b;--goldl:#fffae0;
  --silver:#607080;--silverl:#edf0f3;
  --bronze:#8b4513;--bronzel:#fdf0e4;
  --t:#1c1e24;--t2:#4a5568;--t3:#8898aa;
  --sh:0 1px 3px rgba(0,0,0,.08),0 4px 12px rgba(0,0,0,.05);
  --sh2:0 4px 16px rgba(0,0,0,.10),0 1px 4px rgba(0,0,0,.06);
  --r:12px;--r2:18px;--r3:26px;
}
html,body{min-height:100vh;font-family:'Inter',sans-serif;color:var(--t);background:var(--bg);-webkit-font-smoothing:antialiased}
.app{min-height:100vh}
.wrap{max-width:760px;margin:0 auto;padding:28px 16px 64px}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes pop{0%{transform:scale(.7);opacity:0}70%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
.pe{animation:fadeUp .3s ease both}

/* NAV */
.nav{position:sticky;top:0;z-index:100;height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;background:rgba(255,255,255,.97);backdrop-filter:blur(20px);border-bottom:1px solid var(--b);box-shadow:0 1px 0 var(--b)}
.nav-logo{display:flex;flex-direction:column;line-height:1.1}
.nb{font-size:19px;font-weight:800;letter-spacing:-.5px;color:var(--blue)}
.nt{font-size:9px;font-weight:600;color:var(--t3);letter-spacing:.7px;text-transform:uppercase}
.nav-r{display:flex;align-items:center;gap:6px}

/* CARD */
.card{background:var(--w);border:1px solid var(--b);border-radius:var(--r2);padding:22px;margin-bottom:14px;box-shadow:var(--sh)}
.csm{padding:15px 18px}
.ctitle{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.1px;color:var(--t3);margin-bottom:16px}

/* BTN */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:none;border-radius:10px;padding:10px 20px;font-family:'Inter',sans-serif;font-size:13.5px;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap}
.bp{background:var(--blue);color:#fff}.bp:hover{background:var(--bh);box-shadow:0 4px 12px rgba(0,113,227,.28)}
.bs{background:var(--green);color:#fff}.bs:hover{background:#158035}
.bd{background:var(--rl);color:var(--red);border:1px solid #f0c0bc}.bd:hover{background:#fbd8d5}
.bg{background:transparent;color:var(--t2);border:1.5px solid var(--b)}.bg:hover{border-color:var(--blue);color:var(--blue)}
.bo{background:var(--bl);color:var(--blue);border:1.5px solid var(--bm)}.bo:hover{background:var(--bm)}
.bsm{padding:7px 13px;font-size:12px;border-radius:8px}
.btn:disabled{opacity:.4;cursor:not-allowed;box-shadow:none!important}
.bfull{width:100%}

/* INPUT */
.field{margin-bottom:13px}
.field label{display:block;font-size:12px;font-weight:600;color:var(--t2);margin-bottom:5px}
.inp{width:100%;background:var(--s1);border:1.5px solid var(--b);border-radius:10px;padding:10px 13px;color:var(--t);font-family:'Inter',sans-serif;font-size:14px;outline:none;transition:border-color .15s,box-shadow .15s}
.inp:focus{border-color:var(--blue);background:#fff;box-shadow:0 0 0 3px rgba(0,113,227,.09)}
.inp::placeholder{color:var(--t3)}
.inp:disabled{opacity:.5;cursor:not-allowed}
select.inp{cursor:pointer}

/* CHIP */
.chip{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600}
.cblue{background:var(--bl);color:var(--blue);border:1px solid var(--bm)}
.cgreen{background:var(--gl);color:var(--green);border:1px solid #a8d8b8}
.cred{background:var(--rl);color:var(--red);border:1px solid #f0c0bc}
.cadmin{background:#fffae0;color:#8b6914;border:1px solid #f0d060}

/* TABS */
.tabs{display:flex;gap:3px;background:var(--s2);border:1px solid var(--b);border-radius:13px;padding:3px;margin-bottom:20px}
.tab{flex:1;padding:8px 4px;border-radius:10px;border:none;background:transparent;color:var(--t3);font-family:'Inter',sans-serif;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;text-align:center}
.tab.active{background:var(--w);color:var(--t);box-shadow:var(--sh)}

/* Q CARD */
.qc{background:var(--s1);border:1.5px solid var(--b);border-radius:var(--r);padding:16px;margin-bottom:11px;transition:border-color .15s}
.qc.solved{border-color:#a8d8b8;background:var(--gl)}
.qh{display:flex;align-items:flex-start;gap:10px;margin-bottom:13px}
.qn{width:26px;height:26px;border-radius:7px;background:var(--bl);color:var(--blue);font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
.qt{font-size:14.5px;font-weight:600;line-height:1.45;flex:1}
.qp{background:var(--w);border:1px solid var(--b2);border-radius:20px;padding:2px 9px;font-size:11px;font-weight:600;color:var(--t2);white-space:nowrap;flex-shrink:0}

/* CHOICE */
.cg{display:grid;gap:7px}
.cb{width:100%;text-align:left;padding:10px 13px;background:#fff;border:1.5px solid var(--b);border-radius:9px;color:var(--t);font-family:'Inter',sans-serif;font-size:13.5px;font-weight:500;cursor:pointer;transition:all .15s}
.cb:hover:not(:disabled){background:var(--bl);border-color:var(--blue);color:var(--blue)}
.cb.sel{background:var(--bl);border-color:var(--blue);color:var(--blue);font-weight:600}
.cb.cor{background:var(--gl)!important;border-color:#a8d8b8!important;color:var(--green)!important;font-weight:600!important}
.cb.wrg{background:var(--rl)!important;border-color:#f0c0bc!important;color:var(--red)!important}
.cb:disabled{opacity:.55;cursor:not-allowed}

/* BADGES */
.ab{display:inline-flex;align-items:center;gap:5px;background:var(--gl);color:var(--green);border:1px solid #a8d8b8;border-radius:20px;padding:3px 11px;font-size:12px;font-weight:600;margin-top:8px}
.sb{display:inline-flex;align-items:center;gap:4px;border-radius:20px;padding:4px 11px;font-size:12px;font-weight:700;margin-top:6px;animation:pop .35s ease}
.sbw{background:var(--goldl);color:var(--gold);border:1px solid #e8c840}
.sbl{background:var(--rl);color:var(--red);border:1px solid #f0c0bc}

/* SOLUTION INPUT */
.solwrap{display:flex;align-items:center;gap:8px;margin-top:12px;padding-top:12px;border-top:1.5px dashed var(--b2)}
.sollbl{font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;white-space:nowrap}
.solinp{flex:1;background:#fff;border:1.5px solid var(--b);border-radius:9px;padding:8px 12px;font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:600;outline:none;color:var(--t);transition:border-color .15s,box-shadow .15s}
.solinp:focus{border-color:var(--green);box-shadow:0 0 0 3px rgba(26,158,63,.12)}
.solinp.isset{border-color:#a8d8b8;background:var(--gl);color:var(--green)}
.solbtn{padding:8px 14px;border-radius:9px;border:none;font-family:'Inter',sans-serif;font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;white-space:nowrap}
.solsave{background:var(--green);color:#fff}.solsave:hover{background:#158035}
.soldel{background:var(--rl);color:var(--red);border:1px solid #f0c0bc}.soldel:hover{background:#fbd8d5}

/* ANS TABLE */
.atbl{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;margin-bottom:4px}
.atbl th{text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);padding:5px 8px;border-bottom:1.5px solid var(--b)}
.atbl td{padding:7px 8px;border-bottom:1px solid var(--b)}
.atbl tr:last-child td{border-bottom:none}
.cg2{color:var(--green);font-weight:700}.cr{color:var(--red)}.cm{color:var(--t3);font-style:italic}

/* RANKING */
.rrow{display:flex;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid var(--b);cursor:pointer;transition:background .12s;border-radius:8px;padding-left:4px;padding-right:4px}
.rrow:last-child{border-bottom:none}
.rrow:hover{background:var(--s1)}
.rrow.clickable:hover .rname{color:var(--blue);text-decoration:underline}
.rpos{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0}
.rp1{background:var(--goldl);color:var(--gold)}.rp2{background:var(--silverl);color:var(--silver)}.rp3{background:var(--bronzel);color:var(--bronze)}.rpn{background:var(--s2);color:var(--t3);font-size:12px}
.rname{flex:1;font-size:14.5px;font-weight:600}
.rpts{font-size:18px;font-weight:700;font-family:'JetBrains Mono',monospace}
.rp1c{color:var(--gold)}.rp2c{color:var(--silver)}.rp3c{color:var(--bronze)}.rpnc{color:var(--t2)}

/* MY POS */
.mypos{background:linear-gradient(135deg,var(--blue),#004faa);border-radius:var(--r2);padding:20px 22px;margin-bottom:16px;color:#fff}
.mpl{font-size:11px;font-weight:600;opacity:.7;letter-spacing:.6px;text-transform:uppercase}
.mpr{font-size:34px;font-weight:800;line-height:1.1;margin:3px 0}
.mpp{font-size:13px;opacity:.8}

/* PRIZE */
.pcard{background:linear-gradient(135deg,#e8f0fc,#f0f8f0);border:1.5px solid var(--bm);border-radius:var(--r2);padding:22px;margin-bottom:16px}
.prow{display:flex;align-items:center;gap:13px;padding:12px 0;border-bottom:1px solid rgba(0,100,200,.08)}
.prow:last-child{border-bottom:none}
.pico{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:17px}

/* DEADLINE */
.dlbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;background:var(--ol);border:1px solid #ffcc80;border-radius:10px;padding:11px 15px;margin-bottom:14px}
.dlbar.cl{background:var(--rl);border-color:#f0c0bc}
.dllbl{font-size:12px;font-weight:600;color:var(--orange)}.dlbar.cl .dllbl{color:var(--red)}
.countdown{font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:600;color:var(--orange)}.dlbar.cl .countdown{color:var(--red)}

/* PROGRESS */
.prog{height:6px;background:var(--s2);border-radius:99px;overflow:hidden}
.progf{height:100%;background:linear-gradient(90deg,var(--blue),var(--green));border-radius:99px;transition:width .5s ease}

/* PROFILE */
.prof-header{background:linear-gradient(135deg,var(--blue),#004faa);border-radius:var(--r2);padding:24px;color:#fff;margin-bottom:16px}
.prof-name{font-size:26px;font-weight:800;margin-bottom:4px}
.prof-sub{font-size:13px;opacity:.75}
.prof-stats{display:flex;gap:20px;margin-top:16px;flex-wrap:wrap}
.prof-stat{text-align:center}
.prof-stat-n{font-size:22px;font-weight:800;font-family:'JetBrains Mono',monospace}
.prof-stat-l{font-size:10px;opacity:.7;text-transform:uppercase;letter-spacing:.6px}
.pq-row{display:flex;align-items:flex-start;gap:10px;padding:12px 0;border-bottom:1px solid var(--b)}
.pq-row:last-child{border-bottom:none}
.pq-num{width:24px;height:24px;border-radius:6px;background:var(--bl);color:var(--blue);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px}
.pq-body{flex:1}
.pq-text{font-size:13.5px;font-weight:600;margin-bottom:4px}
.pq-detail{font-size:12px;color:var(--t3)}
.pq-pts{font-size:15px;font-weight:700;font-family:'JetBrains Mono',monospace;white-space:nowrap;padding-top:2px}

/* MISC */
.g2{display:grid;grid-template-columns:1fr 1fr;gap:11px}
@media(max-width:520px){.g2{grid-template-columns:1fr}}
.flex{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.fbtw{display:flex;align-items:center;justify-content:space-between;gap:8px}
.mt4{margin-top:4px}.mt8{margin-top:8px}.mt12{margin-top:12px}.mt16{margin-top:16px}
.w100{width:100%}
.tm{color:var(--t3);font-size:13px}
.div{height:1px;background:var(--b);margin:16px 0}
.ibox{background:#fffae0;border:1px solid #f0d060;border-radius:10px;padding:12px 15px;font-size:13px;color:#7a5a00;font-weight:500;line-height:1.5}

/* LOGIN */
.lw{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:linear-gradient(150deg,#ddeafc,#f0f2f6 45%,#e6f3ec)}
.lc{width:100%;max-width:390px;background:#fff;border:1px solid var(--b);border-radius:var(--r3);padding:36px 30px;box-shadow:var(--sh2);animation:fadeUp .35s ease}
.lb{font-size:44px;font-weight:800;letter-spacing:-1.2px;color:var(--blue);text-align:center;line-height:1}
.ls{font-size:12.5px;color:var(--t3);text-align:center;margin:5px 0 26px}
.sep{display:flex;align-items:center;gap:10px;margin:15px 0}
.sep span{flex:1;height:1px;background:var(--b)}
.sep p{font-size:11px;color:var(--t3);font-weight:600}

/* EMPTY */
.empty{text-align:center;padding:36px 20px;color:var(--t3)}
.empty .ei{font-size:42px;margin-bottom:10px}
.empty h3{font-size:16px;font-weight:700;color:var(--t2);margin-bottom:5px}

/* TOAST */
.toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(70px);background:#fff;border:1px solid var(--b);border-radius:13px;padding:12px 20px;font-size:13.5px;font-weight:600;color:var(--t);z-index:9999;transition:transform .28s ease;pointer-events:none;display:flex;align-items:center;gap:8px;box-shadow:0 8px 28px rgba(0,0,0,.12);white-space:nowrap}
.toast.show{transform:translateX(-50%) translateY(0)}
.toast.ok{border-color:#a8d8b8;color:var(--green)}
.toast.err{border-color:#f0c0bc;color:var(--red)}
.footer{text-align:center;padding:24px 16px 18px;font-size:10.5px;color:var(--t3);line-height:1.8}

/* BOTTOM NAV */
.bnav{position:fixed;bottom:0;left:0;right:0;z-index:200;background:rgba(255,255,255,.97);backdrop-filter:blur(20px);border-top:1px solid var(--b);display:flex;align-items:stretch;height:60px;box-shadow:0 -1px 0 var(--b)}
.bnav-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:none;background:transparent;cursor:pointer;transition:all .15s;color:var(--t3);font-family:'Inter',sans-serif;padding:6px 0}
.bnav-item.active{color:var(--blue)}
.bnav-item span:first-child{font-size:20px;line-height:1}
.bnav-item span:last-child{font-size:9.5px;font-weight:600;letter-spacing:.3px}
.app-content{padding-bottom:72px}

/* EVENT CARD (home) */
.ev-card{background:var(--w);border:1px solid var(--b);border-radius:var(--r2);margin-bottom:14px;box-shadow:var(--sh);overflow:hidden;cursor:pointer;transition:box-shadow .15s,transform .1s}
.ev-card:hover{box-shadow:var(--sh2);transform:translateY(-1px)}
.ev-card-top{padding:18px 18px 14px}
.ev-card-title{font-size:17px;font-weight:800;letter-spacing:-.3px;margin-bottom:3px}
.ev-card-meta{font-size:12px;color:var(--t3);margin-bottom:10px}
.ev-card-bot{padding:10px 18px;background:var(--s1);border-top:1px solid var(--b);display:flex;align-items:center;justify-content:space-between;gap:8px}
.ev-status-open{color:var(--green);font-size:12px;font-weight:700}
.ev-status-closed{color:var(--red);font-size:12px;font-weight:700}

/* HOME HEADER */
.home-header{background:linear-gradient(135deg,var(--blue),#004faa);border-radius:var(--r2);padding:20px 22px;margin-bottom:16px;color:#fff}
.home-greeting{font-size:20px;font-weight:800;margin-bottom:2px}
.home-sub{font-size:12px;opacity:.75}
.home-stats{display:flex;gap:20px;margin-top:14px}
.home-stat{text-align:center}
.home-stat-n{font-size:20px;font-weight:800;font-family:'JetBrains Mono',monospace}
.home-stat-l{font-size:9px;opacity:.7;text-transform:uppercase;letter-spacing:.6px}

/* SINGLE EVENT VIEW */
.ev-header{background:var(--w);border:1px solid var(--b);border-radius:var(--r2);padding:18px;margin-bottom:14px;box-shadow:var(--sh)}
.ev-back{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--blue);cursor:pointer;margin-bottom:14px;background:none;border:none;padding:0}
`;

function Countdown({ deadline }) {
  const [t,setT]=useState("");
  useEffect(()=>{
    const tick=()=>{
      const ms=new Date(deadline)-Date.now();
      if(ms<=0){setT("Abgelaufen");return;}
      const d=Math.floor(ms/86400000),h=Math.floor((ms%86400000)/3600000);
      const m=Math.floor((ms%3600000)/60000),s=Math.floor((ms%60000)/1000);
      setT(d>0?`${d}T ${h}h ${m}m`:`${h}h ${m}m ${s}s`);
    };
    tick(); const iv=setInterval(tick,1000); return ()=>clearInterval(iv);
  },[deadline]);
  return <span className="countdown">{t}</span>;
}

function Toast({ msg, type, show }) {
  return <div className={`toast ${type} ${show?"show":""}`}>{type==="ok"?"✓":"✕"} {msg}</div>;
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function CoTipp() {
  const [data, setData] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [session, setSession] = useState(null);
  const [view, setView] = useState("login");  // login|welcome|home|event|ranking|profile|admin
  const [profilePid, setProfilePid] = useState(null);
  const [activeEvId, setActiveEvId] = useState(null);
  const [toast, setToast] = useState({ msg:"", type:"ok", show:false });
  const tRef = useRef();
  const adminViewRef = useRef(null); // holds setAdminView from AdminScreen

  useEffect(()=>{ load().then(setData); loadCfg().then(setCfg); },[]);
  const persist = async next => { setData(next); await save(next); };
  const toast$ = (msg, type="ok") => {
    if(tRef.current) clearTimeout(tRef.current);
    setToast({ msg, type, show:true });
    tRef.current = setTimeout(()=>setToast(v=>({...v,show:false})), 2600);
  };

  if(!data||!cfg) return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Inter,sans-serif",color:"#8898aa",background:"#f0f2f6"}}>Laden…</div>;
  const persistCfg = async next => { setCfg(next); await saveCfg(next); };

  const scores = computeScores(data.events, data.answers, data.players);

  const openProfile = (pid) => { setProfilePid(pid); setView("profile"); };
  const openEvent = (evId) => { setActiveEvId(evId); setView("event"); };
  const goHome = () => setView("home");

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {session && (
          <nav className="nav">
            <div className="nav-logo" onClick={()=>!session?.isAdmin&&goHome()} style={{cursor:session?.isAdmin?"default":"pointer"}}>
              <span className="nb">CoTipp</span>
              <span className="nt">Wett / Spiel App für Sportfans</span>
            </div>
            <div className="nav-r">
              {session.isAdmin && <button className="btn bg bsm" style={{fontSize:17,padding:"5px 11px",lineHeight:1}} title="Einstellungen" onClick={()=>adminViewRef.current&&adminViewRef.current("settings")}>⚙️</button>}
              <button className="btn bg bsm" onClick={()=>{ setSession(null); setView("login"); }}>Abmelden</button>
            </div>
          </nav>
        )}

        <div className={session && !session.isAdmin ? "app-content" : ""}>
          {view==="login"   && <LoginScreen   data={data} persist={persist} setSession={setSession} setView={setView} toast$={toast$} />}
          {view==="welcome" && <WelcomeScreen  data={data} session={session} setView={setView} />}
          {view==="home"    && !session?.isAdmin && <HomeScreen data={data} session={session} scores={scores} openEvent={openEvent} setView={setView} />}
          {view==="event"   && !session?.isAdmin && <EventScreen data={data} session={session} persist={persist} toast$={toast$} setView={setView} scores={scores} activeEvId={activeEvId} goHome={goHome} />}
          {view==="ranking" && <RankingScreen  data={data} session={session} setView={setView} scores={scores} openProfile={openProfile} goHome={goHome} />}
          {view==="profile" && <ProfileScreen  data={data} session={session} setView={setView} scores={scores} profilePid={profilePid} goHome={goHome} />}
          {view==="admin"   && session?.isAdmin && <AdminScreen data={data} persist={persist} toast$={toast$} setView={setView} scores={scores} openProfile={openProfile} cfg={cfg} persistCfg={persistCfg} adminViewRef={adminViewRef} />}
        </div>

        {/* Bottom nav for players */}
        {session && !session.isAdmin && view !== "login" && view !== "welcome" && (
          <nav className="bnav">
            <button className={`bnav-item ${view==="home"||view==="event"?"active":""}`} onClick={goHome}>
              <span>🏠</span><span>Events</span>
            </button>
            <button className={`bnav-item ${view==="ranking"||view==="profile"?"active":""}`} onClick={()=>setView("ranking")}>
              <span>🏅</span><span>Rangliste</span>
            </button>
          </nav>
        )}

        <div className="footer" style={{paddingBottom: session&&!session.isAdmin ? 80 : 24}}>© {new Date().getFullYear()} Colin Aeschbacher — Alle Rechte vorbehalten · CoTipp®</div>
      </div>
      <Toast {...toast} />
    </>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ data, persist, setSession, setView, toast$ }) {
  const [name,setName]=useState(""); const [email,setEmail]=useState("");
  const [pass,setPass]=useState(""); const [isAdmin,setIsAdmin]=useState(false);

  const go = async () => {
    const n = name.trim();
    if(!n) return toast$("Bitte Name eingeben","err");
    if(isAdmin) {
      if(pass!==ADMIN_PASS) return toast$("Falsches Admin-Passwort","err");
      setSession({ pid:"admin", isAdmin:true, name:"Admin" }); setView("admin"); return;
    }
    // Existing player → name only suffices
    let p = data.players.find(x=>x.name.toLowerCase()===n.toLowerCase());
    if(p) {
      setSession({ pid:p.id, isAdmin:false, name:p.name });
      setView("welcome"); toast$(`Willkommen zurück, ${p.name}! 👋`); return;
    }
    // New player → email is optional
    p = { id:uid(), name:n, email:email.trim() };
    await persist({ ...data, players:[...data.players, p] });
    setSession({ pid:p.id, isAdmin:false, name:p.name });
    setView("welcome"); toast$(`Willkommen, ${p.name}! 🎉`);
  };

  // Check if name already exists → hide email field
  const known = !!data.players.find(x=>x.name.toLowerCase()===name.trim().toLowerCase());

  return (
    <div className="lw">
      <div className="lc">
        <div className="lb">CoTipp</div>
        <div className="ls">Wett / Spiel App für Sportfans</div>
        <div className="field">
          <label>Dein Vor- und Nachname</label>
          <input className="inp" placeholder="Max Mustermann" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} />
          <div style={{fontSize:11,color:"var(--t3)",marginTop:5}}>Bitte Vor- und Nachname eingeben, damit du in der Rangliste erkannt wirst.</div>
        </div>
        {!isAdmin && !known && (
          <div className="field">
            <label>E-Mail <span style={{fontWeight:400,color:"var(--green)"}}>optional – empfohlen</span></label>
            <input className="inp" type="email" placeholder="max@example.com" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} />
            <div style={{fontSize:11,color:"var(--green)",marginTop:5,fontWeight:500,lineHeight:1.5}}>
              📧 Mit E-Mail erhältst du nach Spielende automatisch die Schlussrangliste mit deinem Resultat zugesendet.
            </div>
          </div>
        )}
        {!isAdmin && known && name.trim() && (
          <div style={{fontSize:12,color:"var(--green)",marginBottom:12,fontWeight:600}}>✓ Spieler erkannt – direkt einloggen</div>
        )}
        {isAdmin && <div className="field"><label>Admin-Passwort</label>
          <input className="inp" type="password" placeholder="••••••••" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} />
        </div>}
        <button className="btn bp bfull mt8" onClick={go}>{isAdmin?"Als Admin einloggen":known?"Einloggen":"Registrieren & Mitspielen"}</button>
        <div className="sep"><span /><p>oder</p><span /></div>
        <button className="btn bg bfull" onClick={()=>setIsAdmin(v=>!v)}>{isAdmin?"← Zurück als Spieler":"⚙ Admin-Login"}</button>
        <div style={{textAlign:"center",marginTop:22,fontSize:10,color:"var(--t3)",lineHeight:1.8}}>
          © {new Date().getFullYear()} Colin Aeschbacher<br/>Alle Rechte vorbehalten · CoTipp®
        </div>
      </div>
    </div>
  );
}

// ─── WELCOME ──────────────────────────────────────────────────────────────────
function WelcomeScreen({ data, session, setView }) {
  const pot = data.events[0] ? calcPot(data.events[0].id, data.players, data.paid, data.events[0].entryFee||10) : 0;
  const prizes = [
    {ico:"🥇",label:"1. Platz – Gewinner",pct:60,c:"var(--gold)"},
    {ico:"🥈",label:"2. Platz",pct:30,c:"var(--silver)"},
    {ico:"🥉",label:"3. Platz – Einsatz zurück",pct:10,c:"var(--bronze)"},
  ];
  return (
    <div className="wrap pe">
      <div style={{fontSize:24,fontWeight:800,letterSpacing:"-.4px",marginBottom:8}}>👋 Herzlich willkommen, {session.name}!</div>

      <div className="card" style={{marginBottom:18,background:"linear-gradient(135deg,#e8f4ff,#f0ffe8)"}}>
        <div style={{fontSize:15,fontWeight:800,marginBottom:8}}>🤼 Die Wett & Spiel App von COAE</div>
        <div style={{fontSize:13.5,color:"var(--t2)",lineHeight:1.7}}>
          Diese App wurde im Zuge der <strong>Schwingerkarriere von RT69</strong> entwickelt –
          dem Mann, der Sägemehl atmet und Gegner wie Baumstämme umwirft 🪵💪 – und dessen <strong>Brücke</strong> so unerschütterlich ist, dass Gegner schon aufgehört haben zu drücken und einfach warten bis er wieder aufsteht. 🌉👑
        </div>
        <div style={{fontSize:13,color:"var(--t3)",marginTop:10,lineHeight:1.7}}>
          Hier hast du als Fan endlich die Plattform für <strong>Spiel, Wetten und Spass</strong> –
          weil zuschauen alleine langweilig ist. Tippe richtig, kletter die Rangliste hoch
          und beweise, dass du RT69 besser kennst als er sich selbst. 🏆
        </div>
        <div style={{fontSize:12,color:"var(--t3)",marginTop:8,fontStyle:"italic"}}>
          (Keine Garantie auf Richtigkeit der Tipps. Verluste werden kommentarlos akzeptiert.)
        </div>
      </div>

      <div className="tm" style={{marginBottom:14,fontWeight:600}}>🎯 Preisverteilung & Spielregeln</div>
      <div className="pcard">
        <div style={{fontWeight:700,fontSize:15,marginBottom:6}}>🏆 Preisverteilung{pot?` — Pot: CHF ${pot}`:""}</div>
        <div style={{fontSize:12,color:"var(--t3)",marginBottom:14,lineHeight:1.6}}>
          Wer am meisten weiss, kassiert. Wer am wenigsten weiss, zahlt Lehrgeld –
          und darf nächstes Mal wieder mitmachen. So funktioniert Freundschaft. 🤝
        </div>
        {prizes.map(({ico,label,pct,c},i)=>(
          <div key={i} className="prow">
            <div className="pico">{ico}</div>
            <div style={{flex:1,fontWeight:600,fontSize:14}}>{label}</div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:16,fontWeight:700,color:c}}>{pct}%</div>
              {pot>0&&<div style={{fontSize:11,color:"var(--t3)"}}>CHF {(pot*pct/100).toFixed(2)}</div>}
            </div>
          </div>
        ))}
        <div style={{fontSize:11.5,color:"var(--t3)",marginTop:14,lineHeight:1.7,fontStyle:"italic"}}>
          📜 Regel 1: Tippe vor der Deadline – danach ist kein Jammern erlaubt.<br/>
          📜 Regel 2: Wer gewinnt, zahlt die nächste Runde. Steht zwar nirgends, gilt aber trotzdem.<br/>
          📜 Regel 3: RT69 darf selbstverständlich mitmachen. Im Sägemehl unschlagbar – beim Tippen eine Gefahr für niemanden. 🏆🤷
        </div>
      </div>
      <div className="flex">
        <button className="btn bp" onClick={()=>setView("home")}>🎯 Zu den Events</button>
        <button className="btn bg" onClick={()=>setView("ranking")}>🏅 Rangliste</button>
      </div>
    </div>
  );
}

// ─── HOME SCREEN ──────────────────────────────────────────────────────────────
function HomeScreen({ data, session, scores, openEvent, setView }) {
  const rank = buildRank(data.players, scores);
  const myIdx = rank.findIndex(p=>p.id===session.pid);
  const myEntry = rank[myIdx];
  const myPts = totalPts(session.pid, scores);
  const totalPot = data.events.reduce((s,ev)=>s+calcPot(ev.id,data.players,data.paid,ev.entryFee||10),0);
  const pot = data.events[0] ? calcPot(data.events[0].id, data.players, data.paid, data.events[0].entryFee||10) : 0;

  return (
    <div className="wrap pe">
      {/* Greeting header */}
      <div className="home-header">
        <div className="home-greeting">👋 Hallo, {session.name}!</div>
        <div className="home-sub">Wähle ein Event und gib deine Tipps ab</div>
        <div className="home-stats">
          <div className="home-stat">
            <div className="home-stat-n">{myPts}</div>
            <div className="home-stat-l">Punkte</div>
          </div>
          {myIdx>=0&&<div className="home-stat">
            <div className="home-stat-n">#{myEntry.rank}</div>
            <div className="home-stat-l">Rang</div>
          </div>}
          {totalPot>0&&<div className="home-stat">
            <div className="home-stat-n">CHF {totalPot}</div>
            <div className="home-stat-l">Pot</div>
          </div>}
        </div>
      </div>

      {/* Event cards */}
      <div style={{fontSize:16,fontWeight:800,letterSpacing:"-.2px",marginBottom:10,color:"var(--t2)"}}>📋 Laufende & kommende Events</div>
      {!data.events.length && (
        <div className="empty"><div className="ei">📋</div><h3>Noch keine Events</h3><p>Der Admin hat noch kein Event erstellt.</p></div>
      )}
      {data.events.map(ev=>{
        const closed=!isOpen(ev.deadline);
        const qs=ev.questions||[];
        const answered=qs.filter(q=>{ const v=data.answers[`${session.pid}_${q.id}`]; return v!==undefined&&v!==""; }).length;
        const solved=qs.filter(q=>hasSol(q)).length;
        const evPts=qs.reduce((s,q)=>{ const k=`${session.pid}_${q.id}`; return s+(hasSol(q)?(scores[k]??0):0); },0);
        const allAnswered=qs.length>0&&answered===qs.length;
        return (
          <div key={ev.id} className="ev-card" onClick={()=>openEvent(ev.id)}>
            <div className="ev-card-top">
              <div className="ev-card-title">{ev.title}</div>
              <div className="ev-card-meta">
                {closed?"Deadline abgelaufen":"Deadline: "}{!closed&&fmtDate(ev.deadline)}
                {` · Pot: CHF ${calcPot(ev.id,data.players,data.paid,ev.entryFee||10)}`}
              </div>
              {/* Progress bar */}
              {qs.length>0&&(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--t3)",marginBottom:4}}>
                    <span>{answered}/{qs.length} Tipps abgegeben</span>
                    {solved>0&&<span style={{color:"var(--green)",fontWeight:600}}>{evPts} Punkte erzielt</span>}
                  </div>
                  <div className="prog"><div className="progf" style={{width:`${qs.length?(answered/qs.length)*100:0}%`}}/></div>
                </div>
              )}
            </div>
            <div className="ev-card-bot">
              <span className={closed?"ev-status-closed":"ev-status-open"}>
                {closed?"⛔ Geschlossen":"● Offen"}
              </span>
              {!closed&&<span style={{fontSize:12,color:"var(--t3)"}}>⏱ <Countdown deadline={ev.deadline}/></span>}
              {allAnswered&&!closed&&<span className="chip cgreen" style={{fontSize:10}}>✓ Alle Tipps abgegeben</span>}
              <span style={{fontSize:13,color:"var(--blue)",fontWeight:600}}>Öffnen →</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── TEXT INPUT WITH CONFIRM ─────────────────────────────────────────────────
function TextInput({ initial, type, onSave }) {
  const [val, setVal] = useState(initial);
  const [saved, setSaved] = useState(!!initial);
  const save = async () => {
    const v = String(val).trim();
    if(!v) return;
    await onSave(v);
    setSaved(true);
  };
  return (
    <div style={{display:"flex",gap:8,alignItems:"center"}}>
      <input
        className="inp"
        type={type==="number"?"number":"text"}
        placeholder={type==="number"?"Zahl eingeben…":"Antwort eingeben…"}
        value={val}
        onChange={e=>{ setVal(e.target.value); setSaved(false); }}
        onKeyDown={e=>e.key==="Enter"&&save()}
        style={{flex:1}}
      />
      <button
        className={`btn bsm ${saved?"bg":"bp"}`}
        onClick={save}
        style={{flexShrink:0,minWidth:80}}
      >
        {saved?"✓ Gespeichert":"Bestätigen"}
      </button>
    </div>
  );
}

// ─── SINGLE EVENT SCREEN ──────────────────────────────────────────────────────
function EventScreen({ data, session, persist, toast$, setView, scores, activeEvId, goHome }) {
  const ev = data.events.find(e=>e.id===activeEvId);
  if(!ev) return <div className="wrap pe"><div className="empty"><div className="ei">📋</div><h3>Event nicht gefunden</h3></div></div>;

  const closed=!isOpen(ev.deadline);
  const qs=ev.questions||[];
  const answered=qs.filter(q=>{ const v=data.answers[`${session.pid}_${q.id}`]; return v!==undefined&&v!==""; }).length;

  return (
    <div className="wrap pe">
      <button className="ev-back" onClick={goHome}>← Alle Events</button>
      <div className="ev-header">
        <div style={{fontSize:20,fontWeight:800,letterSpacing:"-.3px",marginBottom:4}}>{ev.title}</div>
        <div className="tm" style={{marginBottom:10}}>Pot: CHF {calcPot(ev.id,data.players,data.paid,ev.entryFee||10)} · {qs.length} Fragen</div>
        <div className={`dlbar ${closed?"cl":""}`} style={{marginBottom:0}}>
          <span className="dllbl">{closed?"⛔ Tippeingabe geschlossen":"⏱ Noch Zeit:"}</span>
          {closed?<span className="countdown">—</span>:<Countdown deadline={ev.deadline}/>}
        </div>
        {qs.length>0&&(
          <div style={{marginTop:10}}>
            <div style={{fontSize:11,color:"var(--t3)",marginBottom:4}}>{answered}/{qs.length} beantwortet</div>
            <div className="prog"><div className="progf" style={{width:`${qs.length?(answered/qs.length)*100:0}%`}}/></div>
          </div>
        )}
      </div>

      {qs.map((q,i)=>{
        const key=`${session.pid}_${q.id}`;
        const cur=data.answers[key];
        const solved=hasSol(q);
        const pts=solved?(scores[key]??0):null;
        const correct=solved&&pts>0;
        return (
          <div key={q.id} className="qc">
            <div className="qh">
              <div className="qn">{i+1}</div>
              <div className="qt">{q.text}</div>
              <div className="qp">{q.points} Pt.</div>
            </div>
            {q.type==="choice"&&(
              <div className="cg">
                {q.options.map((opt,oi)=>{
                  let cls=cur===opt?"sel":"";
                  if(solved){ if(opt===q.solution)cls="cor"; else if(opt===cur)cls="wrg"; }
                  return (
                    <button key={oi} disabled={closed||solved} className={`cb ${cls}`}
                      onClick={async()=>{ await persist({...data,answers:{...data.answers,[key]:opt}}); toast$("Tipp gespeichert ✓"); }}>
                      {opt}{solved&&opt===q.solution?" ✓":""}
                    </button>
                  );
                })}
              </div>
            )}
            {(q.type==="text"||q.type==="number")&&!solved&&!closed&&(
              <TextInput
                key={key}
                initial={cur||""}
                type={q.type}
                onSave={async v=>{ await persist({...data,answers:{...data.answers,[key]:v}}); toast$("Tipp gespeichert ✓"); }}
              />
            )}
            {(q.type==="text"||q.type==="number")&&(closed||solved)&&(
              <input className="inp" type={q.type==="number"?"number":"text"}
                value={cur||""} disabled readOnly/>
            )}
            {cur&&!solved&&!closed&&<div className="ab mt8" style={{marginTop:4}}>✓ Gespeichert: <strong>{cur}</strong></div>}
            {solved&&(
              <div className="flex mt8" style={{gap:8,flexWrap:"wrap"}}>
                <span style={{fontSize:12,color:"var(--t3)"}}>Lösung: <strong style={{color:"var(--green)"}}>{q.solution}</strong>{q.type==="number"&&` (±${q.tolerance})`}</span>
                {cur
                  ?<span className={`sb ${correct?"sbw":"sbl"}`}>{correct?`✓ +${pts} Punkte`:`✗ 0 Pt. (dein Tipp: ${cur})`}</span>
                  :<span className="sb sbl">✗ Kein Tipp – 0 Punkte</span>}
              </div>
            )}
          </div>
        );
      })}
      {!qs.length&&<div className="empty"><div className="ei">❓</div><h3>Noch keine Fragen</h3><p>Der Admin hat noch keine Fragen hinzugefügt.</p></div>}
      <button className="btn bo bsm mt8" onClick={()=>setView("ranking")}>🏅 Zur Rangliste</button>
    </div>
  );
}

// ─── RANKING ──────────────────────────────────────────────────────────────────
function RankingScreen({ data, session, setView, scores, openProfile, goHome }) {
  const rank = buildRank(data.players, scores);
  const pot = data.events[0] ? calcPot(data.events[0].id, data.players, data.paid, data.events[0].entryFee||10) : 0;
  const myIdx = rank.findIndex(p=>p.id===session.pid);
  const solved=countSolved(data.events), total=countTotal(data.events);

  const prize = i => {
    if(!pot) return null;
    if(i===0) return `CHF ${(pot*.6).toFixed(2)}`;
    if(i===1) return `CHF ${(pot*.3).toFixed(2)}`;
    if(i===2) return `CHF ${(pot*.1).toFixed(2)}`;
    return null;
  };

  return (
    <div className="wrap pe">
      <div style={{marginBottom:16}}>
        <div style={{fontSize:24,fontWeight:800,letterSpacing:"-.4px"}}>🏆 Rangliste</div>
        <div className="tm mt4">{solved}/{total} Fragen bewertet · Klick auf Spieler für Details</div>
        {total>0&&<div className="prog mt8"><div className="progf" style={{width:`${(solved/total)*100}%`}}/></div>}
      </div>

      {!session.isAdmin && myIdx>=0 && (
        <div className="mypos" style={{cursor:"pointer"}} onClick={()=>openProfile(session.pid)}>
          <div className="mpl">Deine aktuelle Position</div>
          <div className="mpr">Platz {rank[myIdx].rank}</div>
          <div className="mpp">{rank[myIdx].pts} Punkte{prize(rank[myIdx].rank-1)?` · ${prize(rank[myIdx].rank-1)}`:""} · Profil ansehen →</div>
        </div>
      )}

      <div className="card">
        <div className="ctitle">Gesamtrangliste — {rank.length} Spieler</div>
        {rank.length===0&&<div className="empty"><div className="ei">🏅</div><h3>Noch keine Punkte</h3><p>Sobald der Admin Lösungen einträgt, erscheint hier die Rangliste.</p></div>}
        {rank.map((p,i)=>{
          const pc=p.rank===1?"rp1":p.rank===2?"rp2":p.rank===3?"rp3":"rpn";
          const ptc=p.rank===1?"rp1c":p.rank===2?"rp2c":p.rank===3?"rp3c":"rpnc";
          return (
            <div key={p.id} className="rrow clickable" style={{animation:"fadeUp .3s ease both",animationDelay:`${i*40}ms`}}
              onClick={()=>openProfile(p.id)}>
              <div className={`rpos ${pc}`}>{p.rank===1?"🥇":p.rank===2?"🥈":p.rank===3?"🥉":p.rank}</div>
              <div style={{flex:1}}>
                <div className="rname">{p.name}{p.id===session.pid&&<span style={{marginLeft:8,fontSize:11,color:"var(--blue)",fontWeight:600}}>← Du</span>}</div>
                {prize(p.rank-1)&&<div style={{fontSize:12,fontWeight:600,marginTop:2,color:p.rank===1?"var(--gold)":p.rank===2?"var(--silver)":"var(--bronze)"}}>{prize(p.rank-1)}</div>}
              </div>
              <div className={`rpts ${ptc}`}>{p.pts}</div>
              <div style={{fontSize:12,color:"var(--t3)"}}>›</div>
            </div>
          );
        })}
      </div>
      <button className="btn bg bsm" onClick={()=>session.isAdmin?setView("admin"):goHome()}>← Zurück</button>
    </div>
  );
}

// ─── PROFILE ──────────────────────────────────────────────────────────────────
function ProfileScreen({ data, session, setView, scores, profilePid, goHome }) {
  const player = data.players.find(p=>p.id===profilePid);
  if(!player) return <div className="wrap pe"><div className="empty"><div className="ei">👤</div><h3>Spieler nicht gefunden</h3></div></div>;

  const rank = buildRank(data.players, scores);
  const myRankIdx = rank.findIndex(p=>p.id===profilePid);
  const myPts = totalPts(profilePid, scores);
  const pot = data.events[0] ? calcPot(data.events[0].id, data.players, data.paid, data.events[0].entryFee||10) : 0;
  const isMe = session.pid === profilePid;

  const prize = i => {
    if(!pot) return null;
    if(i===0) return `CHF ${(pot*.6).toFixed(2)}`;
    if(i===1) return `CHF ${(pot*.3).toFixed(2)}`;
    if(i===2) return `CHF ${(pot*.1).toFixed(2)}`;
    return null;
  };

  // Count correct answers
  let correct=0, evaluated=0;
  const allQ = data.events.flatMap(ev=>(ev.questions||[]).map(q=>({...q,evTitle:ev.title})));
  allQ.forEach(q=>{ if(hasSol(q)){ evaluated++; const k=`${profilePid}_${q.id}`; if((scores[k]??0)>0) correct++; } });

  return (
    <div className="wrap pe">
      {/* Profile header */}
      <div className="prof-header">
        <div className="prof-name">{isMe?"👤 Mein Profil":player.name}</div>
        <div className="prof-sub">{isMe?player.name:""}</div>
        <div className="prof-stats">
          <div className="prof-stat">
            <div className="prof-stat-n">{myRankIdx>=0?myRankIdx+1:"–"}</div>
            <div className="prof-stat-l">Platz</div>
          </div>
          <div className="prof-stat">
            <div className="prof-stat-n">{myPts}</div>
            <div className="prof-stat-l">Punkte</div>
          </div>
          <div className="prof-stat">
            <div className="prof-stat-n">{evaluated>0?`${correct}/${evaluated}`:"–"}</div>
            <div className="prof-stat-l">Richtig</div>
          </div>
          {pot>0&&myRankIdx>=0&&prize(myRankIdx)&&(
            <div className="prof-stat">
              <div className="prof-stat-n" style={{fontSize:16}}>{prize(myRankIdx)}</div>
              <div className="prof-stat-l">Gewinn</div>
            </div>
          )}
        </div>
      </div>

      {/* Per-event question breakdown */}
      {data.events.map(ev=>{
        const qs = ev.questions||[];
        const evPts = qs.reduce((s,q)=>{ const k=`${profilePid}_${q.id}`; return s+(hasSol(q)?(scores[k]??0):0); },0);
        const evMax = qs.reduce((s,q)=>s+q.points,0);
        const closed = !isOpen(ev.deadline);

        return (
          <div key={ev.id} className="card">
            <div className="fbtw" style={{marginBottom:14}}>
              <div>
                <div style={{fontWeight:700,fontSize:15}}>{ev.title}</div>
                <div className="tm mt4">{evPts} / {evMax} Punkte</div>
              </div>
              {!closed&&<span className="chip cgreen">● Offen</span>}
              {closed&&<span className="chip cred">● Geschlossen</span>}
            </div>

            {!qs.length&&<div className="tm">Keine Fragen</div>}
            {qs.map((q,qi)=>{
              const k = `${profilePid}_${q.id}`;
              const ans = data.answers[k];
              const solved = hasSol(q);
              const pts = solved ? (scores[k]??0) : null;
              const correct = solved && pts>0;

              // Only show if deadline passed OR solution revealed
              const showDetail = closed || solved;

              if(!showDetail) return (
                <div key={q.id} className="pq-row">
                  <div className="pq-num">{qi+1}</div>
                  <div className="pq-body">
                    <div className="pq-text">{q.text}</div>
                    <div className="pq-detail">
                      {ans?<span style={{color:"var(--blue)"}}>Tipp: {ans}</span>:<span className="cm">Kein Tipp</span>}
                      {" · "}<span style={{color:"var(--orange)"}}>Noch nicht bewertet</span>
                    </div>
                  </div>
                  <div className="pq-pts" style={{color:"var(--t3)"}}>{q.points} Pt.</div>
                </div>
              );

              return (
                <div key={q.id} className="pq-row">
                  <div className="pq-num" style={{background:solved?(correct?"var(--gl)":"var(--rl)"):"var(--bl)",color:solved?(correct?"var(--green)":"var(--red)"):"var(--blue)"}}>{qi+1}</div>
                  <div className="pq-body">
                    <div className="pq-text">{q.text}</div>
                    <div className="pq-detail">
                      {ans?<span style={{color:solved?(correct?"var(--green)":"var(--red)"):"var(--t2)"}}>{ans}</span>:<span className="cm">Kein Tipp</span>}
                      {solved&&<span style={{marginLeft:6,color:"var(--t3)"}}>· Lösung: <strong style={{color:"var(--green)"}}>{q.solution}</strong></span>}
                    </div>
                  </div>
                  <div className="pq-pts" style={{color:solved?(correct?"var(--green)":"var(--red)"):"var(--t3)"}}>
                    {solved?(correct?`+${pts}`:"0"):""} {solved?"Pt.":q.points+" Pt."}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      <button className="btn bg bsm" onClick={()=>setView("ranking")}>← Zurück zur Rangliste</button>
      <button className="btn bg bsm" style={{marginLeft:8}} onClick={()=>goHome()}>🏠 Home</button>
    </div>
  );
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────
function AdminScreen({ data, persist, toast$, setView, scores, openProfile, cfg, persistCfg, adminViewRef }) {
  const [adminView, setAdminView] = useState("home"); // home | event | settings
  useEffect(()=>{ if(adminViewRef) adminViewRef.current = setAdminView; },[]); // expose to nav
  const [activeEvId, setActiveEvId] = useState(null);
  const [activeEvTab, setActiveEvTab] = useState("solutions"); // solutions | questions
  const [collapsed, setCollapsed] = useState({});
  const [evForm, setEvForm] = useState({ title:"", deadline:"", entryFee:"10" });
  const [qForm, setQForm] = useState({ eventId:data.events[0]?.id||"", text:"", type:"choice", points:10, options:["","","",""], tolerance:0 });
  const [drafts, setDrafts] = useState({});
  const [mailCfg, setMailCfg] = useState({ serviceId:cfg.serviceId||"", templateId:cfg.templateId||"", publicKey:cfg.publicKey||"" });
  const [mailSending, setMailSending] = useState(false);
  const [globalTab, setGlobalTab] = useState("events"); // for settings: events|players|mail|ranking

  const solved=countSolved(data.events), total=countTotal(data.events);

  const createEvent = async () => {
    if(!evForm.title.trim()||!evForm.deadline) return toast$("Titel und Deadline erforderlich","err");
    const ev={id:uid(),title:evForm.title.trim(),deadline:evForm.deadline,entryFee:Number(evForm.entryFee)||10,questions:[]};
    const next={...data,events:[...data.events,ev]};
    await persist(next); setEvForm({title:"",deadline:"",entryFee:"10"}); toast$("Event erstellt ✓");
    openAdminEvent(ev.id, "questions");
  };

  const deleteEvent = async (evId) => {
    if(!confirm("Event wirklich löschen?")) return;
    await persist({...data,events:data.events.filter(e=>e.id!==evId)}); toast$("Event gelöscht");
  };

  const addQ = async (eventId) => {
    const {text,type,points,options,tolerance}=qForm;
    if(!text.trim()||!eventId) return toast$("Frage und Event erforderlich","err");
    if(type==="choice"&&options.filter(o=>o.trim()).length<2) return toast$("Min. 2 Optionen angeben","err");
    const q={id:uid(),text:text.trim(),type,points:Number(points),options:type==="choice"?options.filter(o=>o.trim()):[],tolerance:type==="number"?Number(tolerance):0,solution:null};
    await persist({...data,events:data.events.map(e=>e.id===eventId?{...e,questions:[...e.questions,q]}:e)});
    setQForm(f=>({...f,text:"",options:["","","",""],tolerance:0})); toast$("Frage hinzugefügt ✓");
  };

  const deleteQ = async (evId,qId) => {
    await persist({...data,events:data.events.map(e=>e.id===evId?{...e,questions:e.questions.filter(q=>q.id!==qId)}:e)});
    toast$("Frage gelöscht");
  };

  const setSol = async (evId,qId,sol) => {
    const next={...data,events:data.events.map(e=>e.id===evId?{...e,questions:e.questions.map(q=>q.id===qId?{...q,solution:sol}:q)}:e)};
    await persist(next);
    // Check if all solved → auto-send mails
    const newScores=computeScores(next.events,next.answers,next.players);
    const newSolved=countSolved(next.events), newTotal=countTotal(next.events);
    if(newTotal>0&&newSolved===newTotal&&cfg.serviceId&&cfg.templateId&&cfg.publicKey) {
      await autoSendMails(next, cfg);
    }
    toast$("Lösung gespeichert ✓");
  };

  const autoSendMails = async (currentData, currentCfg) => {
    const currentScores=computeScores(currentData.events,currentData.answers,currentData.players);
    const rank=buildRank(currentData.players,currentScores);
    const pot=currentData.events[0] ? calcPot(currentData.events[0].id, currentData.players, currentData.paid, currentData.events[0].entryFee||10) : 0;
    const eventTitle=currentData.events.map(e=>e.title).join(", ");
    const newSent={...(currentCfg.mailsSent||{})};
    const playersWithMail=currentData.players.filter(p=>p.email&&!newSent[p.id]);
    for(const p of playersWithMail) {
      try { await sendRankingMail(currentCfg,p,rank,pot,eventTitle); newSent[p.id]=true; } catch{}
    }
    if(playersWithMail.length>0) {
      const newCfg={...currentCfg,mailsSent:newSent};
      await persistCfg(newCfg);
      toast$(`${playersWithMail.length} Mails versendet ✓`);
    }
  };

  const sendMailsManually = async () => {
    if(!cfg.serviceId||!cfg.templateId||!cfg.publicKey) return toast$("Bitte zuerst EmailJS konfigurieren","err");
    setMailSending(true);
    await autoSendMails(data, {...cfg, mailsSent:{}});
    setMailSending(false);
  };

  const rank = buildRank(data.players, scores);
  const pot = data.events[0] ? calcPot(data.events[0].id, data.players, data.paid, data.events[0].entryFee||10) : 0;
  const prize = i => { if(!pot) return null; if(i===0) return `CHF ${(pot*.6).toFixed(2)}`; if(i===1) return `CHF ${(pot*.3).toFixed(2)}`; if(i===2) return `CHF ${(pot*.1).toFixed(2)}`; return null; };

  const openAdminEvent = (evId, tab="solutions") => {
    setActiveEvId(evId);
    setActiveEvTab(tab);
    setAdminView("event");
    setQForm(f=>({...f, eventId:evId}));
  };

  const toggleCollapse = (evId) => setCollapsed(c=>({...c,[evId]:!c[evId]}));

  // ── HOME VIEW ──────────────────────────────────────────────────────────────
  if(adminView==="home") return (
    <div className="wrap pe">
      <div style={{marginBottom:16}}>
        <div style={{fontSize:22,fontWeight:800,letterSpacing:"-.4px"}}>⚙ Admin – Übersicht</div>
        <div className="tm mt4">{solved}/{total} Fragen bewertet · {data.players.length} Spieler</div>
        {total>0&&<div className="prog mt8"><div className="progf" style={{width:`${(solved/total)*100}%`}}/></div>}
      </div>

      {/* Event cards */}
      <div style={{fontSize:15,fontWeight:800,marginBottom:10,color:"var(--t2)"}}>📋 Laufende & kommende Events</div>
      {!data.events.length && (
        <div className="empty"><div className="ei">📅</div><h3>Noch keine Events</h3><p>Erstelle unten ein neues Event.</p></div>
      )}
      {data.events.map(ev=>{
        const qs=ev.questions||[];
        const evSolved=qs.filter(hasSol).length;
        const closed=!isOpen(ev.deadline);
        const isCollapsed=collapsed[ev.id];
        return (
          <div key={ev.id} className="ev-card">
            <div className="ev-card-top" style={{cursor:"pointer"}} onClick={()=>openAdminEvent(ev.id,"questions")}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div className="ev-card-title">{ev.title}</div>
                  <div className="ev-card-meta">
                    Pot: CHF {calcPot(ev.id,data.players,data.paid,ev.entryFee||10)} (CHF {ev.entryFee||10}/Spieler) · {qs.length} Fragen · {evSolved}/{qs.length} bewertet
                  </div>
                </div>
                <span style={{fontSize:14,color:"var(--blue)",fontWeight:600}}>Öffnen →</span>
              </div>
              {qs.length>0&&(
                <div className="prog mt8"><div className="progf" style={{width:`${(evSolved/qs.length)*100}%`}}/></div>
              )}
            </div>
            <div className="ev-card-bot" style={{gap:8,flexWrap:"wrap"}}>
              <span className={closed?"ev-status-closed":"ev-status-open"}>{closed?"⛔ Geschlossen":"● Offen"}</span>
              {!closed&&<span style={{fontSize:12,color:"var(--t3)"}}>⏱ <Countdown deadline={ev.deadline}/></span>}
              <button className="btn bg bsm" style={{marginLeft:"auto",color:"var(--red)"}} onClick={e=>{e.stopPropagation();deleteEvent(ev.id);}}>🗑 Löschen</button>
            </div>
          </div>
        );
      })}

      {/* New event toggle */}
      <div className="tabs" style={{marginTop:20}}>
        <button className={`tab ${globalTab==="events"?"active":""}`} onClick={()=>setGlobalTab(g=>g==="events"?"none":"events")}>➕ Neues Event erstellen</button>
      </div>

      {/* New event form */}
      {globalTab==="events"&&(
        <div className="card">
          <div className="ctitle">Neues Event erstellen</div>
          <div className="field"><label>Event-Titel</label>
            <input className="inp" placeholder="z.B. EM Finale 2026" value={evForm.title} onChange={e=>setEvForm(f=>({...f,title:e.target.value}))}/>
          </div>
          <div className="field"><label>Tipp-Deadline</label>
            <input className="inp" type="datetime-local" value={evForm.deadline} onChange={e=>setEvForm(f=>({...f,deadline:e.target.value}))}/>
          </div>
          <div className="field"><label>Einsatz pro Spieler (CHF)</label>
            <input className="inp" type="number" placeholder="10" value={evForm.entryFee} onChange={e=>setEvForm(f=>({...f,entryFee:e.target.value}))}/>
            <div style={{fontSize:11,color:"var(--t3)",marginTop:5}}>Der Pot wächst automatisch mit jedem bezahlten Spieler.</div>
          </div>
          <button className="btn bp bfull mt8" onClick={createEvent}>+ Event erstellen</button>
        </div>
      )}



    </div>
  );

  // ── SETTINGS VIEW ──────────────────────────────────────────────────────────
  if(adminView==="settings") return (
    <div className="wrap pe">
      <button className="ev-back" onClick={()=>setAdminView("home")}>← Zurück</button>
      <div style={{fontSize:20,fontWeight:800,letterSpacing:"-.3px",marginBottom:20}}>⚙️ Einstellungen</div>
      <div className="card">
        <div className="ctitle">📧 EmailJS Konfiguration</div>
        <div className="ibox" style={{marginBottom:16}}>
          <strong>Einmalig einrichten:</strong> Gehe auf <a href="https://emailjs.com" target="_blank" rel="noreferrer" style={{color:"var(--blue)"}}>emailjs.com</a>, erstelle ein kostenloses Konto (200 Mails/Monat), verbinde deinen Mail-Service und erstelle ein Template mit den Variablen: <code>to_email</code>, <code>to_name</code>, <code>event_title</code>, <code>ranking_text</code>, <code>my_rank</code>, <code>my_pts</code>, <code>prize_text</code>. Danach trägst du die drei Keys unten ein.
        </div>
        {[{k:"serviceId",l:"Service ID"},{k:"templateId",l:"Template ID"},{k:"publicKey",l:"Public Key"}].map(({k,l})=>(
          <div key={k} className="field"><label>{l}</label>
            <input className="inp" placeholder={l} value={mailCfg[k]} onChange={e=>setMailCfg(f=>({...f,[k]:e.target.value}))}/>
          </div>
        ))}
        <button className="btn bp bfull mt8" onClick={async()=>{ await persistCfg({...cfg,...mailCfg}); toast$("Konfiguration gespeichert ✓"); }}>Speichern</button>
      </div>
      <div className="card">
        <div className="ctitle">Manueller Mail-Versand</div>
        <div className="tm" style={{marginBottom:12}}>Sobald du die letzte Frage bewertest, werden Mails automatisch an alle Spieler mit E-Mail-Adresse versendet.</div>
        <div style={{fontSize:13,marginBottom:12}}>
          {data.players.filter(p=>p.email).length} von {data.players.length} Spielern haben eine E-Mail hinterlegt.
        </div>
        <button className="btn bp bfull" disabled={mailSending} onClick={sendMailsManually}>
          {mailSending?"Sende Mails…":"📧 Mails jetzt senden"}
        </button>
        {data.players.filter(p=>p.email).map(p=>(
          <div key={p.id} className="rrow" style={{marginTop:8}}>
            <span style={{fontWeight:600,flex:1}}>{p.name}</span>
            <span style={{color:"var(--t3)"}}>{p.email}</span>
          </div>
        ))}
        {!data.players.filter(p=>p.email).length&&<div className="tm">Noch kein Spieler hat eine E-Mail hinterlegt.</div>}
      </div>
    </div>
  );

  // ── EVENT DETAIL VIEW ──────────────────────────────────────────────────────
  const activeEv = data.events.find(e=>e.id===activeEvId);
  if(!activeEv) return <div className="wrap pe"><div className="empty"><div className="ei">📅</div><h3>Event nicht gefunden</h3></div></div>;
  const qs = activeEv.questions||[];
  const evSolved = qs.filter(hasSol).length;
  const closed = !isOpen(activeEv.deadline);

  return (
    <div className="wrap pe">
      <button className="ev-back" onClick={()=>setAdminView("home")}>← Alle Events</button>
      <div className="ev-header">
        <div style={{fontSize:19,fontWeight:800,letterSpacing:"-.3px",marginBottom:4}}>{activeEv.title}</div>
        <div className="tm">Pot: CHF {calcPot(activeEv.id,data.players,data.paid,activeEv.entryFee||10)} · {qs.length} Fragen · {evSolved}/{qs.length} bewertet</div>
        {qs.length>0&&<div className="prog mt8"><div className="progf" style={{width:`${(evSolved/qs.length)*100}%`}}/></div>}
      </div>

      <div className="tabs">
        <button className={`tab ${activeEvTab==="questions"?"active":""}`} onClick={()=>setActiveEvTab("questions")}>❓ Fragen</button>
        <button className={`tab ${activeEvTab==="solutions"?"active":""}`} onClick={()=>setActiveEvTab("solutions")}>✅ Lösungen</button>
        <button className={`tab ${activeEvTab==="ranking"?"active":""}`} onClick={()=>setActiveEvTab("ranking")}>🏅 Rangliste</button>
        <button className={`tab ${activeEvTab==="players"?"active":""}`} onClick={()=>setActiveEvTab("players")}>👥 Spieler</button>
      </div>

      {/* ── SOLUTIONS ── */}
      {activeEvTab==="solutions"&&(
        <>
          <div className="ibox" style={{marginBottom:16}}>
            💡 Trage die richtige Antwort pro Frage ein und klicke <strong>Speichern</strong>. Punkte werden <strong>sofort automatisch berechnet</strong> und die Rangliste aktualisiert.
          </div>
          {!qs.length&&<div className="empty"><div className="ei">❓</div><h3>Noch keine Fragen</h3><p>Wechsle zum Tab „❓ Fragen" um Fragen hinzuzufügen.</p></div>}
          {qs.map((q,qi)=>{
            const isSolved=hasSol(q);
            const draft=drafts[q.id]??(isSolved?q.solution:"");
            return (
              <div key={q.id} className={`qc ${isSolved?"solved":""}`}>
                <div className="qh">
                  <div className="qn">{qi+1}</div>
                  <div className="qt">{q.text}</div>
                  <div className="qp">{q.points} Pt.</div>
                  {isSolved&&<span className="chip cgreen" style={{flexShrink:0}}>✓ Bewertet</span>}
                </div>
                {/* Player answers summary */}
                <div style={{display:"flex",flexWrap:"wrap",gap:6,margin:"8px 0"}}>
                  {data.players.map(pl=>{
                    const ans=data.answers[`${pl.id}_${q.id}`];
                    if(!ans) return null;
                    const correct=isSolved&&textMatch(ans,q.solution);
                    return <span key={pl.id} className={`chip ${isSolved?(correct?"cgreen":"cred"):""}`} style={{fontSize:11}}>{pl.name}: {ans}</span>;
                  })}
                </div>
                {q.type==="choice"&&(
                  <div className="cg">
                    {q.options.map((opt,oi)=>(
                      <button key={oi} className={`cb ${draft===opt?"sel":""} ${isSolved&&opt===q.solution?"cor":""}`}
                        onClick={()=>setDrafts(d=>({...d,[q.id]:opt}))}>
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
                {(q.type==="text"||q.type==="number")&&(
                  <input className="inp" type={q.type==="number"?"number":"text"}
                    placeholder="Richtige Antwort eingeben…"
                    value={draft} onChange={e=>setDrafts(d=>({...d,[q.id]:e.target.value}))}/>
                )}
                <div className="flex mt8" style={{gap:8}}>
                  <button className="btn bp bsm" onClick={()=>setSol(activeEvId,q.id,drafts[q.id]??q.solution??"")}>{isSolved?"Aktualisieren":"✓ Speichern"}</button>
                  {isSolved&&<span style={{fontSize:12,color:"var(--t3)",alignSelf:"center"}}>Lösung: <strong>{q.solution}</strong>{q.type==="number"&&` (±${q.tolerance})`}</span>}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* ── QUESTIONS ── */}
      {activeEvTab==="questions"&&(
        <>
          <div className="card">
            <div className="ctitle">Neue Frage hinzufügen</div>
            <div className="field"><label>Fragetext</label>
              <input className="inp" placeholder="Wer gewinnt das Finale?" value={qForm.text} onChange={e=>setQForm(f=>({...f,text:e.target.value}))}/>
            </div>
            <div className="field"><label>Fragetyp</label>
              <select className="inp" value={qForm.type} onChange={e=>setQForm(f=>({...f,type:e.target.value}))}>
                <option value="choice">Auswahl (Multiple Choice)</option>
                <option value="text">Freitext</option>
                <option value="number">Zahl mit Toleranz</option>
              </select>
            </div>
            {qForm.type==="choice"&&(
              <div className="field"><label>Antwortoptionen</label>
                {qForm.options.map((o,oi)=>(
                  <input key={oi} className="inp" style={{marginBottom:6}} placeholder={`Option ${oi+1}`}
                    value={o} onChange={e=>setQForm(f=>({...f,options:f.options.map((x,xi)=>xi===oi?e.target.value:x)}))}/>
                ))}
              </div>
            )}
            {qForm.type==="number"&&(
              <div className="field"><label>Toleranz (±)</label>
                <input className="inp" type="number" placeholder="1" value={qForm.tolerance} onChange={e=>setQForm(f=>({...f,tolerance:e.target.value}))}/>
              </div>
            )}
            <div className="field"><label>Punkte</label>
              <input className="inp" type="number" value={qForm.points} onChange={e=>setQForm(f=>({...f,points:e.target.value}))}/>
            </div>
            <button className="btn bp bfull mt8" onClick={()=>addQ(activeEvId)}>+ Frage hinzufügen</button>
          </div>

          {!qs.length&&<div className="empty"><div className="ei">❓</div><h3>Noch keine Fragen</h3></div>}
          {qs.map((q,qi)=>(
            <div key={q.id} className="qc">
              <div className="qh">
                <div className="qn">{qi+1}</div>
                <div className="qt">{q.text}</div>
                <div className="qp">{q.points} Pt.</div>
                {hasSol(q)&&<span className="chip cgreen" style={{flexShrink:0,fontSize:10}}>✓</span>}
              </div>
              {q.type==="choice"&&<div style={{fontSize:12,color:"var(--t3)",marginTop:6}}>Optionen: {q.options.join(" · ")}</div>}
              {q.type==="number"&&<div style={{fontSize:12,color:"var(--t3)",marginTop:6}}>Typ: Zahl ±{q.tolerance}</div>}
              <button className="btn bg bsm mt8" style={{color:"var(--red)"}} onClick={()=>deleteQ(activeEvId,q.id)}>🗑 Löschen</button>
            </div>
          ))}
        </>
      )}

      {/* ── RANKING (per event) ── */}
      {activeEvTab==="ranking"&&(()=>{
        const evRank = buildRank(data.players, scores);
        const evPot = calcPot(activeEv.id, data.players, data.paid, activeEv.entryFee||10);
        const evPrize = i => { if(!evPot) return null; if(i===0) return `CHF ${(evPot*.6).toFixed(2)}`; if(i===1) return `CHF ${(evPot*.3).toFixed(2)}`; if(i===2) return `CHF ${(evPot*.1).toFixed(2)}`; return null; };
        return (
          <div className="card">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div className="ctitle" style={{marginBottom:0}}>Rangliste – {activeEv.title}</div>
              {evPot>0&&<div style={{fontSize:13,fontWeight:700,color:"var(--green)"}}>Pot: CHF {evPot}</div>}
            </div>
            {evRank.length===0&&<div className="empty"><div className="ei">🏅</div><h3>Noch keine Punkte</h3></div>}
            {evRank.map((p,i)=>{
              const pc=p.rank===1?"rp1":p.rank===2?"rp2":p.rank===3?"rp3":"rpn";
              const ptc=p.rank===1?"rp1c":p.rank===2?"rp2c":p.rank===3?"rp3c":"rpnc";
              return (
                <div key={p.id} className="rrow clickable" onClick={()=>openProfile(p.id)}>
                  <div className={`rpos ${pc}`}>{p.rank===1?"🥇":p.rank===2?"🥈":p.rank===3?"🥉":p.rank}</div>
                  <div style={{flex:1}}>
                    <div className="rname">{p.name}</div>
                    {evPrize(p.rank-1)&&<div style={{fontSize:12,fontWeight:600,marginTop:2,color:p.rank===1?"var(--gold)":p.rank===2?"var(--silver)":"var(--bronze)"}}>{evPrize(p.rank-1)}</div>}
                  </div>
                  <div className={`rpts ${ptc}`}>{p.pts}</div>
                  <div style={{fontSize:12,color:"var(--t3)"}}>›</div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── PLAYERS (per event) ── */}
      {activeEvTab==="players"&&(()=>{
        const evPaidCount = data.players.filter(p=>(data.paid||{})[`${activeEv.id}_${p.id}`]).length;
        const evPot = calcPot(activeEv.id, data.players, data.paid, activeEv.entryFee||10);
        return (
          <div className="card">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div>
                <div className="ctitle" style={{marginBottom:2}}>Spieler – {activeEv.title}</div>
                <div className="tm">Einsatz CHF {activeEv.entryFee||10}/Spieler · {evPaidCount}/{data.players.length} bezahlt</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:22,fontWeight:800,color:evPaidCount===data.players.length&&data.players.length>0?"var(--green)":"var(--orange)"}}>{evPaidCount}/{data.players.length}</div>
                <div style={{fontSize:10,color:"var(--t3)"}}>bezahlt</div>
              </div>
            </div>
            {data.players.length>0&&(
              <div className="prog" style={{marginBottom:14}}>
                <div className="progf" style={{width:`${(evPaidCount/data.players.length)*100}%`,background:"var(--green)"}}/>
              </div>
            )}
            {data.players.length===0&&<div className="tm">Noch keine Spieler registriert.</div>}
            {buildRank(data.players,scores).map((p)=>{
              const key=`${activeEv.id}_${p.id}`;
              const isPaid=!!(data.paid||{})[key];
              return (
                <div key={p.id} className="rrow" style={{alignItems:"center"}}>
                  <div style={{flex:1,cursor:"pointer"}} onClick={()=>openProfile(p.id)}>
                    <div className="rname" style={{fontSize:14}}>{p.name}</div>
                    <div style={{fontSize:11,color:"var(--t3)"}}>{p.pts} Pt. · {p.email||"keine Mail"}</div>
                  </div>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",userSelect:"none",flexShrink:0}}>
                    <span style={{fontSize:12,fontWeight:600,color:isPaid?"var(--green)":"var(--t3)"}}>
                      {isPaid?"✓ Bezahlt":"Ausstehend"}
                    </span>
                    <div
                      onClick={async()=>{
                        const newPaid={...(data.paid||{}),[key]:!isPaid};
                        await persist({...data,paid:newPaid});
                        toast$(isPaid?`${p.name} als ausstehend markiert`:`${p.name} als bezahlt markiert ✓`);
                      }}
                      style={{width:44,height:24,borderRadius:12,cursor:"pointer",flexShrink:0,background:isPaid?"var(--green)":"var(--b2)",transition:"background .2s",position:"relative"}}
                    >
                      <div style={{position:"absolute",top:3,left:isPaid?22:3,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,.2)"}}/>
                    </div>
                  </label>
                </div>
              );
            })}
            {evPaidCount>0&&(
              <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid var(--b)",display:"flex",justifyContent:"space-between",fontSize:13}}>
                <span style={{color:"var(--t3)"}}>Aktueller Pot:</span>
                <span style={{fontWeight:700,color:"var(--green)"}}>CHF {evPot} ({evPaidCount} × CHF {activeEv.entryFee||10})</span>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
