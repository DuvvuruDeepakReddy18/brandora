"use client";
import { createContext, useContext } from "react";
import { ArrowRight } from "lucide-react";

/* Lets any screen offer a one-click role switch while the isolated demo is active. */
export type DemoState = {
  active: boolean;
  role: string;
  switchRole: (role: string) => Promise<unknown>;
};
export const DemoContext = createContext<DemoState>({
  active: false,
  role: "",
  switchRole: async () => false,
});
export const useDemo = () => useContext(DemoContext);

const NAMES: Record<string, string> = {
  creator: "Creator (Alex)",
  reviewer: "Reviewer (Sam)",
  manager: "Manager (Maya)",
  partner: "Partner (Jordan)",
};

export function SwitchRole({ role, label }: { role: string; label?: string }) {
  const demo = useDemo();
  if (!demo.active || demo.role === role) return null;
  return (
    <button type="button" className="switch-role" onClick={() => demo.switchRole(role)}>
      {label || `Switch to ${NAMES[role] || role}`} <ArrowRight size={12} />
    </button>
  );
}

/* Fetch a demo sample as a File so it can be dropped into an upload control. */
export async function sampleFile(name: string, type: string) {
  const response = await fetch(`/api/demo/assets/${name}`, { credentials: "same-origin" });
  if (!response.ok) throw new Error("The sample file could not be loaded. Reset the demo and try again.");
  return new File([await response.blob()], name, { type });
}
