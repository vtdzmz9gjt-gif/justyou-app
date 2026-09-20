"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { track } from "@vercel/analytics";
import Home from "./Home";
import SessionView from "./SessionView";
import Trail from "./Trail";
import Wayfind, { type View } from "./Wayfind";
import { recordSessionStart } from "@/lib/storage";

const Threshold = dynamic(() => import("./Threshold"), { ssr: false });

export default function App() {
  const [pastThreshold, setPastThreshold] = useState(false);
  const [view, setView] = useState<View>("home");

  if (!pastThreshold) {
    return (
      <Threshold
        onClear={() => {
          const state = recordSessionStart();
          if (state.sessionCount > 1) track("return_visit");
          setPastThreshold(true);
        }}
      />
    );
  }

  return (
    <>
      <Wayfind current={view} onChange={setView} />
      {view === "home" && <Home onContinue={() => setView("session")} />}
      {view === "session" && <SessionView onExit={() => setView("home")} />}
      {view === "trail" && <Trail />}
    </>
  );
}
