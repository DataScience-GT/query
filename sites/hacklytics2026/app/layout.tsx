// app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'
import { IBM_Plex_Mono } from 'next/font/google'
import Navbar from '../components/Navbar'

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-ibm-plex-mono',
})

export const metadata: Metadata = {
  title: 'Hacklytics 2026: Golden Byte',
  description: 'Data Science @ GT',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${ibmPlexMono.variable} font-sans`}>
        <Navbar />
        {children}
      </body>
    </html>
  )
}
