import type { Metadata, Viewport } from 'next';
import { Anton, Instrument_Serif, Inter } from 'next/font/google';
import './globals.css';

const anton = Anton({ weight: '400', subsets: ['latin'], variable: '--font-anton', display: 'swap' });
const serif = Instrument_Serif({
  weight: '400',
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
});
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

const SITE_URL = 'https://musofans.vercel.app';
const TITLE = 'MUSO: Film the show. Get paid.';
const SHARE_DESC = 'Turn concert moments into rewards.';
const OG_IMAGE = { url: '/og-image.png', width: 1200, height: 630, alt: 'MUSO — Film the show. Get paid.' };

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: 'Fans capture live events and earn from unlocks, tips and sponsor-funded USDC reward pools.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: TITLE,
    description: SHARE_DESC,
    url: SITE_URL,
    siteName: 'MUSO',
    images: [OG_IMAGE],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: SHARE_DESC,
    images: [OG_IMAGE.url],
  },
};

export const viewport: Viewport = {
  themeColor: '#D9FF55',
  colorScheme: 'light',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${anton.variable} ${serif.variable} ${inter.variable}`}>
      <body>
        <noscript>
          <style>{'.reveal{opacity:1!important;transform:none!important}'}</style>
        </noscript>
        {children}
      </body>
    </html>
  );
}
