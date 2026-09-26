"use client";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Code2, Database, PenTool, Plus, Target } from "lucide-react";
import { Badge, FitBadge } from "@/components/ui/badge";
import styles from "./landing.module.css";

const archetypes = [
  { name: "Fullstack React", skills: "React · TypeScript", domain: "Frontend", icon: Code2 },
  { name: "FastAPI / Python", skills: "APIs · PostgreSQL", domain: "Backend", icon: Database },
  { name: "UI/UX Designer", skills: "Figma · Prototyping", domain: "Design", icon: PenTool },
];
export function MatchSimulator() {
  const [selected, setSelected] = useState<number[]>([0, 1]);
  const reduced = useReducedMotion();
  const score = [0, 38, 74, 96][selected.length];
  return <div className={styles.simulator}>
    <div className={styles.simHeading}><span className={styles.mono}><Target size={14}/> THE COMPLEMENTARITY LAB</span><Badge>Interactive demo</Badge></div>
    <div className={styles.simBody}><div className={styles.archetypes}>
      {archetypes.map((item, index) => {
        const active = selected.includes(index); const Icon = item.icon;
        return <button key={item.name} type="button" aria-pressed={active} className={styles.archetype} onClick={() => setSelected(current => active ? current.filter(i => i !== index) : [...current, index])}>
          <span className={styles.archetypeIcon}><Icon size={20}/></span><span><b>{item.name}</b><small>{item.skills}</small></span><span className={styles.choice}>{active ? <Check size={14}/> : <Plus size={14}/>}</span>
        </button>;
      })}
    </div><div className={styles.synergy}>
      <div className={styles.gauge}><svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="67" className={styles.gaugeTrack}/><motion.circle cx="80" cy="80" r="67" className={styles.gaugeFill} initial={false} animate={{ pathLength: score / 100 }} transition={{ duration: reduced ? 0 : .65 }}/></svg><div aria-live="polite" aria-atomic="true"><motion.strong key={score} initial={reduced ? false : { opacity: .3, y: 5 }} animate={{ opacity: 1, y: 0 }}>{score}<span>%</span></motion.strong><span>SYNERGY</span></div></div>
      <div className={styles.domainTags}>{selected.map(i => <Badge key={i} variant={i === 2 ? "purple" : "brand"}>{archetypes[i].domain}</Badge>)}</div>
      <span className={styles.simVerdict}>{selected.length === 3 ? "Three domains. One stronger team." : selected.length === 0 ? "Choose a builder to start." : "Add a different skill. Expand your range."}</span>
      <span className={styles.fitExample}>Example fit <FitBadge score={score}/></span>
    </div></div>
    <p className={styles.simNote}>Illustrative scores, not a live recommendation. Real recommendations depend on your profile and available teammates.</p>
  </div>;
}
