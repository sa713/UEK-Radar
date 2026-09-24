import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"Радар эксперта УЭК",description:"Контекст и аналитика для экспертов кибербезопасности",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ru"><body className="antialiased">{children}</body></html>}
