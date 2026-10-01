import type { ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";

export function Layout({ children }: { children: ReactNode }) {
  return <div className="site-shell"><a className="skip-link" href="#main-content">Bỏ qua điều hướng</a><Header /><main id="main-content" className="site-main" tabIndex={-1}>{children}</main><Footer /></div>;
}
