// app/layout.tsx - Digital Bloom x Brutalist Theme
import './globals.css'
import type { Metadata } from 'next'
import { Roboto_Mono, Space_Grotesk } from 'next/font/google'
import Navbar from '../components/Navbar'

// Techy, Brutalist fonts
const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '700', '500'],
  variable: '--font-sans',
})

export const metadata: Metadata = {
  title: "Hacklytics 2027: Digital Bloom",
  description: "Data Science @ GT - Digital Bloom",
  authors: [{ name: "DSGT" }],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${robotoMono.variable} ${spaceGrotesk.variable} font-sans`} suppressHydrationWarning>
        <Navbar />
        {children}
      </body>
    </html>
  )
}
