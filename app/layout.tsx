// app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'
// 1. Import IBM_Plex_Mono instead of Inter
import { IBM_Plex_Mono } from 'next/font/google'
import Navbar from '../components/Navbar'

// 2. Configure IBM_Plex_Mono and assign it to the correct CSS variable
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '700'], // Specify the weights you need
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
      {/* 3. Apply the new font variable to the body */}
      <body className={`${ibmPlexMono.variable} font-sans`}>
        <Navbar />
        {children}
      </body>
    </html>
  )
}