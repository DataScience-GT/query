import Link from "next/link";
export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen text-center p-8">
            <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
            <p className="text-lg text-gray-400 mb-8">We couldn't find the page you were looking for.</p>
            <Link href="/" className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">
                Return Home
            </Link>
        </div>
    );
}
