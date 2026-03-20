import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { App } from "./App";
import "./styles.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL;

function MissingConfig() {
  return (
    <div className="shell shell--centered">
      <section className="panel panel--hero">
        <p className="eyebrow">Friends Wall</p>
        <h1>Missing Convex configuration</h1>
        <p className="muted">
          Set <code>VITE_CONVEX_URL</code> in <code>.env.local</code> after you
          create or connect a Convex deployment.
        </p>
      </section>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {convexUrl ? (
      <ConvexProvider client={new ConvexReactClient(convexUrl)}>
        <App />
      </ConvexProvider>
    ) : (
      <MissingConfig />
    )}
  </React.StrictMode>,
);
