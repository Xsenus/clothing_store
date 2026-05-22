import { useEffect } from "react";
import { markApplicationBooted } from "@/lib/client-error-reporting";

export default function AppBootReporter() {
  useEffect(() => {
    markApplicationBooted();
  }, []);

  return null;
}
