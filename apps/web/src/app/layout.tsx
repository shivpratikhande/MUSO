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

export const metadata: Metadata = {
  title: 'MUSO: Capture the moment. Earn from it.',
  description:
    'MUSO is the creator economy for live events. Fans film the show, publish their clips, and get paid when people unlock, tip or watch them.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'MUSO: Film the show. Get paid.',
    description: 'Fans capture live events and earn from unlocks, tips and sponsor-funded USDC reward pools.',
    type: 'website',
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
