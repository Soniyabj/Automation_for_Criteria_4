import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";   // <- this line must exist

createRoot(document.getElementById("root")).render(<App />);
