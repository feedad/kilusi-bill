'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Facebook, Instagram, Phone } from 'lucide-react';

export default function Footer() {
    const [footerContent, setFooterContent] = useState({
        about: 'Penyedia layanan internet fiber optic terpercaya yang berkomitmen memberikan pengalaman digital terbaik bagi keluarga dan bisnis Anda.',
        copyright: 'Kita Selalu Terkoneksi',
        social: { fb: '', ig: '', wa: '' },
        companyName: 'Feedad@Kilusi' // Default fallback
    });

    useEffect(() => {
        // Fetch Landing Content
        fetch('/api/v1/landing/content')
            .then(res => res.json())
            .then(data => {
                if (data.success && data.data.footer) {
                    setFooterContent(prev => ({
                        ...prev,
                        about: data.data.footer.about || prev.about,
                        copyright: data.data.footer.copyright || prev.copyright,
                        social: data.data.footer.social || prev.social
                    }));
                }
            })
            .catch(err => console.error("Footer content fetch error:", err));

        // Fetch Company Settings
        fetch('/api/v1/public/settings')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const companyName = data.data.branding?.siteTitle || data.data.company?.name;
                    if (companyName) {
                        setFooterContent(prev => ({ ...prev, companyName }));
                    }
                }
            })
            .catch(err => console.error("Public settings fetch error:", err));
    }, []);

    const openSocial = (url: string) => {
        if (!url) return;
        window.open(url.startsWith('http') ? url : `https://${url}`, '_blank');
    };

    const openWA = (num: string) => {
        if (!num) return;
        const cleanNum = num.replace(/\D/g, '');
        window.open(`https://wa.me/${cleanNum}`, '_blank');
    };

    return (
        <footer className="bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 pt-16 pb-8">
            <div className="container mx-auto px-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
                    {/* Brand */}
                    <div className="col-span-1 md:col-span-2">
                        <div className="flex items-center gap-3 mb-6">
                            <img src="/images/logo-icon.png" alt="Kilusi Logo" className="h-10 w-auto" />
                            <span className="text-2xl font-bold text-slate-900 dark:text-white">Kilusi</span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-sm whitespace-pre-wrap">
                            {footerContent.about}
                        </p>
                        <div className="flex gap-4">
                            {/* Social Icons */}
                            {footerContent.social.fb && (
                                <div onClick={() => openSocial(footerContent.social.fb)} className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:bg-blue-100 hover:text-blue-600 transition-colors cursor-pointer">
                                    <Facebook className="w-5 h-5" />
                                </div>
                            )}
                            {footerContent.social.ig && (
                                <div onClick={() => openSocial(footerContent.social.ig)} className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:bg-pink-100 hover:text-pink-600 transition-colors cursor-pointer">
                                    <Instagram className="w-5 h-5" />
                                </div>
                            )}
                            {footerContent.social.wa && (
                                <div onClick={() => openWA(footerContent.social.wa)} className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:bg-green-100 hover:text-green-600 transition-colors cursor-pointer">
                                    <Phone className="w-5 h-5" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Links 1 */}
                    <div>
                        <h4 className="font-bold text-slate-900 dark:text-white mb-6">Layanan</h4>
                        <ul className="space-y-4">
                            <li><Link href="/customer/register" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 transition-colors">Paket Rumah</Link></li>
                            <li><Link href="/customer/register" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 transition-colors">Paket Bisnis</Link></li>
                            <li><Link href="#coverage" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 transition-colors">Cek Area</Link></li>
                        </ul>
                    </div>

                    {/* Links 2 */}
                    <div>
                        <h4 className="font-bold text-slate-900 dark:text-white mb-6">Dukungan</h4>
                        <ul className="space-y-4">
                            <li><Link href="/customer/login" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 transition-colors">Portal Pelanggan</Link></li>
                            <li><Link href="/support" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 transition-colors">Bantuan Teknis</Link></li>
                            <li><Link href="/terms" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 transition-colors">Syarat & Ketentuan</Link></li>
                        </ul>
                    </div>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-sm text-slate-500 text-center md:text-left">
                        &copy; {new Date().getFullYear()} <span className="font-semibold">{footerContent.copyright}</span>. All rights reserved.
                    </p>
                    <p className="text-sm text-slate-500 flex gap-1 items-center">
                        Powered by <span className="text-blue-600 font-semibold">{footerContent.companyName}</span>
                    </p>
                </div>
            </div>
        </footer>
    );
}
