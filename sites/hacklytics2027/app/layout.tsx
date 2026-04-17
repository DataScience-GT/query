// app/layout.tsx - 1980s Arcade Retro Theme
import './globals.css'
import type { Metadata } from 'next'
import { Press_Start_2P, Orbitron } from 'next/font/google'
import Navbar from '../components/Navbar'

// 1980s Arcade fonts
const pixel = Press_Start_2P({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-pixel',
})

const retro = Orbitron({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  variable: '--font-retro',
})

export const metadata: Metadata = {
  title: 'Hacklytics 2027: Arcade Edition',
  description: 'Data Science @ GT - 1980s Arcade Style',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${pixel.variable} ${retro.variable} font-pixel`} suppressHydrationWarning>
        <Navbar />
        {children}
      </body>
    </html>
  )
}
