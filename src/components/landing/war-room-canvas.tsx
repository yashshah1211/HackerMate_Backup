"use client";

import { useState } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "motion/react";
import { ArrowUpRight, Check, Code2, Cpu, GitBranch, Layers, Terminal, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import styles from "./landing.module.css";

export function WarRoomCanvas() {
  const reduced = useReducedMotion();
  const x = useMotionValue(5);
  const y = useMotionValue(-8);
  const rotateX = useSpring(x, { stiffness: 160, damping: 24 });
  const rotateY = useSpring(y, { stiffness: 160, damping: 24 });
  const [view, setView] = useState<"build" | "ship">("build");
  return <div className={styles.scene} onPointerMove={event => {
    if (reduced || event.pointerType !== "mouse") return;
    const box = event.currentTarget.getBoundingClientRect();
    x.set((0.5 - (event.clientY - box.top) / box.height) * 12);
    y.set(((event.clientX - box.left) / box.width - 0.5) * 16);
  }} onPointerLeave={() => { x.set(5); y.set(-8); }}>
    <div className={styles.orbit} aria-hidden="true" />
    <div className={styles.orbitTwo} aria-hidden="true" />
    <motion.div className={styles.warRoom} style={{ rotateX: reduced ? 0 : rotateX, rotateY: reduced ? 0 : rotateY, transformStyle: "preserve-3d" }}>
      <div className={styles.windowBar}><span><i/><i/><i/></span><span><Terminal size={12}/> team / launch-sequence</span><span className={styles.limeDot}/></div>
      <div className={styles.canvasBody}>
        <div className={styles.canvasTop}><span className={styles.mono}>WORKSPACE PREVIEW</span><Badge variant="brand" dot>Ready to build</Badge></div>
        <h2>One team.<br/><span>All systems go.</span></h2>
        <div className={styles.canvasTabs} aria-label="Workspace preview">
          <button type="button" aria-pressed={view === "build"} onClick={() => setView("build")}><Layers size={13}/> Build</button>
          <button type="button" aria-pressed={view === "ship"} onClick={() => setView("ship")}><Zap size={13}/> Ship</button>
        </div>
        <div className={styles.board}>
          {(view === "build" ? ["Design", "Develop", "Review"] : ["Validate", "Demo", "Submit"]).map((column, index) => <div key={column}>
            <div className={styles.columnTitle}><span className={styles.limeDot}/>{column}<span>0{index + 1}</span></div>
            <div className={styles.task}><span className={styles.taskGlyph}>{index === 0 ? <Layers size={17}/> : index === 1 ? <Code2 size={17}/> : <GitBranch size={17}/>}</span><b>{(view === "build" ? ["Map the experience", "Connect the API", "Review the pull request"] : ["Check the edge cases", "Rehearse the story", "Freeze the commit"])[index]}</b><span className={styles.taskLines}/><div className={styles.taskBottom}><span>{["UX", "DEV", "QA"][index]}</span><Check size={12}/></div></div>
          </div>)}
        </div>
        <div className={styles.canvasFooter}><GitBranch size={13}/><span>main</span><span>Ideas → commits → demo day</span></div>
      </div>
      <div className={styles.floatingChip}><Cpu size={17}/><div><b>Different skills. Shared momentum.</b><span>Your next team starts here.</span></div><ArrowUpRight size={16}/></div>
    </motion.div>
    <span className={styles.sceneCaption}>MOVE TO EXPLORE · CLICK BUILD / SHIP</span>
  </div>;
}
