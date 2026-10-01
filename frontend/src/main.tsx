import { createRoot } from "react-dom/client";
import "./themes";
import { ThemeProvider } from "./themes/ThemeProvider";
import { AppRouter } from "./app/router";
import "./styles/base.css";
import "./styles/components.css";

createRoot(document.getElementById("root")!).render(<ThemeProvider><AppRouter /></ThemeProvider>);
