import React from "react";
import { reportClientError } from "@/lib/client-error-reporting";

export default class SafeRenderBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Non-critical UI block failed.", error, errorInfo);
    reportClientError(error, errorInfo, this.props.source || "safe-render-boundary");
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }

    return this.props.children;
  }
}
