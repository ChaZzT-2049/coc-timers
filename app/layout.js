import "./globals.css";

export const metadata = {
  title: "Revisión de clan",
  description: "Ranking de revisión de un clan de Clash of Clans. No saca a nadie del clan.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2a1c10",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
