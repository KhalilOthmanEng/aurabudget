import React, { useState, lazy, Suspense } from "react";
import Sidebar from "./components/Sidebar";

// Lazy-load every page so only the active page's JS is parsed on first visit
const Dashboard  = lazy(() => import("./pages/Dashboard"));
const Records    = lazy(() => import("./pages/Records"));
const Categories = lazy(() => import("./pages/Categories"));
const Settings   = lazy(() => import("./pages/Settings"));

function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 rounded-full border-2 border-transparent border-t-teal-400 animate-spin" />
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("Page crashed:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center max-w-md">
            <p className="text-lg font-display font-bold text-aura-text mb-2">Something went wrong</p>
            <p className="text-sm text-aura-subtle mb-4">{this.state.error?.message || "An unexpected error occurred."}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-5 py-2.5 rounded-xl bg-aura-teal text-aura-bg font-display font-semibold text-sm hover:bg-emerald-400 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [page, setPage] = useState("dashboard");

  return (
    <div className="min-h-screen bg-aura-bg bg-noise bg-repeat">
      <Sidebar active={page} onNavigate={setPage} />

      <main className="ml-[220px] min-h-screen">
        <ErrorBoundary key={page}>
          <Suspense fallback={<PageSpinner />}>
            {page === "dashboard"    && <Dashboard />}
            {page === "transactions" && <Records />}
            {page === "categories"   && <Categories />}
            {page === "settings"     && <Settings />}
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
