import Script from 'next/script';
import PageTransition from '../components/PageTransition';
import './globals.css';

export const metadata = {
  title: 'VivAI',
  description: 'Chat with your local model',
};

const GA_MEASUREMENT_ID = 'G-0VGZF1VZ7Y';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
        <PageTransition>{children}</PageTransition>
      </body>
    </html>
  );
}
