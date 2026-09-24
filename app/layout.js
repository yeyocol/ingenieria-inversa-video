import "./globals.css";

export const metadata = {
  title: "Ingeniería Inversa de Video",
  description: "Sube un video y obtén un análisis profundo con IA para replicarlo al máximo.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
