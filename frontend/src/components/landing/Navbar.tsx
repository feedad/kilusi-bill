import Link from 'next/link';

export default function Navbar() {
    return (
        <nav className="fixed w-full z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-all">
            <div className="container mx-auto px-6 h-16 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2 group">
                    <img src="/images/logo-icon.png" alt="Logo" className="h-8 w-auto group-hover:scale-110 transition-transform" />
                    <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">Kilusi</span>
                </Link>
                <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-300">
                    <Link href="/" className="hover:text-blue-600 transition-colors">Beranda</Link>
                    <Link href="/#pricing" className="hover:text-blue-600 transition-colors">Paket</Link>
                    <Link href="/#coverage" className="hover:text-blue-600 transition-colors">Jangkauan</Link>
                    <Link href="/blog" className="hover:text-blue-600 transition-colors">Blog</Link>
                    <Link href="/customer/login" className="px-5 py-2 rounded-full border border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:text-blue-500 transition-all">
                        Login Portal
                    </Link>
                    <Link href="/customer/register" className="px-5 py-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/30 transition-all">
                        Daftar
                    </Link>
                </div>
            </div>
        </nav>
    );
}
