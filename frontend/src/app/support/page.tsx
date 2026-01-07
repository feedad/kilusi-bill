'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import ScrollAnimation from '@/components/landing/ScrollAnimation';
import { Phone, Mail, Clock, MapPin, MessageCircle } from 'lucide-react';

interface CompanySettings {
    name: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    supportContacts: Array<{ id: string; label: string; number: string }>;
    operatingHours?: {
        weekday: string;
        weekend: string;
    };
}

export default function SupportPage() {
    const [company, setCompany] = useState<CompanySettings>({
        name: 'Kilusi',
        address: 'Jl. Teknologi No. 123\nKawasan Bisnis Digital, Jakarta Selatan\nDKI Jakarta 12345',
        phone: '021-1234-5678',
        email: 'support@kilusi.id',
        website: '',
        supportContacts: [],
        operatingHours: {
            weekday: '08:00 - 22:00 WIB',
            weekend: '09:00 - 18:00 WIB'
        }
    });

    useEffect(() => {
        fetch('/api/v1/public/settings')
            .then(res => res.json())
            .then(data => {
                if (data.success && data.data.company) {
                    setCompany(prev => ({
                        ...prev,
                        ...data.data.company
                    }));
                }
            })
            .catch(err => console.error("Failed to fetch settings:", err));
    }, []);

    // Helper to find primary WhatsApp number
    const getPrimaryWA = () => {
        if (company.supportContacts && company.supportContacts.length > 0) {
            return company.supportContacts[0].number;
        }
        return '6281234567890'; // Default fallback
    };

    return (
        <main className="min-h-screen bg-white dark:bg-slate-950 font-sans">
            <Navbar />

            <div className="pt-32 pb-16 bg-blue-600">
                <div className="container mx-auto px-6 text-center">
                    <h1 className="text-4xl font-bold text-white mb-4">Bantuan Teknis</h1>
                    <p className="text-blue-100 max-w-2xl mx-auto">
                        Tim support kami siap membantu Anda 24/7. Hubungi kami melalui saluran di bawah ini.
                    </p>
                </div>
            </div>

            <div className="container mx-auto px-6 py-20">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                    {/* Contacts List (Replaces single WA & Call Center) */}
                    <ScrollAnimation>
                        <div className="bg-slate-50 dark:bg-slate-900 p-8 rounded-2xl border border-slate-100 dark:border-slate-800 text-center hover:shadow-lg transition-all h-full">
                            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                                <MessageCircle className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Hubungi Kami</h3>
                            <p className="text-slate-600 dark:text-slate-400 mb-6">
                                Chat dengan tim support kami melalui WhatsApp.
                            </p>

                            <div className="space-y-3">
                                {company.supportContacts && company.supportContacts.length > 0 ? (
                                    company.supportContacts.map((contact) => (
                                        <div key={contact.id} className="flex items-center justify-between gap-3 p-3 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                                            <div className="text-left">
                                                <div className="font-semibold text-sm text-slate-900 dark:text-white">{contact.label || 'Support'}</div>
                                                <div className="text-xs text-slate-500">{contact.number}</div>
                                            </div>
                                            <a
                                                href={`https://wa.me/${contact.number.replace(/\D/g, '')}`}
                                                target="_blank"
                                                className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 transition"
                                            >
                                                Chat
                                            </a>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-sm text-slate-500 italic">Belum ada kontak tersedia.</div>
                                )}
                            </div>
                        </div>
                    </ScrollAnimation>

                    {/* Email */}
                    <ScrollAnimation delay={0.4}>
                        <div className="bg-slate-50 dark:bg-slate-900 p-8 rounded-2xl border border-slate-100 dark:border-slate-800 text-center hover:shadow-lg transition-all h-full">
                            <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Mail className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Email Support</h3>
                            <p className="text-slate-600 dark:text-slate-400 mb-6">
                                Kirim detail kendala teknis Anda melalui email.
                            </p>
                            <a
                                href={`mailto:${company.email}`}
                                className="inline-block bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-bold py-3 px-8 rounded-xl hover:bg-slate-300 dark:hover:bg-slate-700 transition"
                            >
                                {company.email}
                            </a>
                        </div>
                    </ScrollAnimation>
                </div>

                <div className="mt-20 max-w-4xl mx-auto">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 md:p-12 border border-slate-200 dark:border-slate-800">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                            <div>
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Jam Operasional</h2>
                                <div className="space-y-4">
                                    <div className="flex items-start gap-4">
                                        <Clock className="w-6 h-6 text-blue-600 mt-1" />
                                        <div>
                                            <h4 className="font-bold text-slate-900 dark:text-white">Senin - Jumat</h4>
                                            <p className="text-slate-600 dark:text-slate-400">{company.operatingHours?.weekday || '08:00 - 22:00 WIB'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-4">
                                        <Clock className="w-6 h-6 text-blue-600 mt-1" />
                                        <div>
                                            <h4 className="font-bold text-slate-900 dark:text-white">Sabtu - Minggu / Libur</h4>
                                            <p className="text-slate-600 dark:text-slate-400">{company.operatingHours?.weekend || '09:00 - 18:00 WIB'}</p>
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-500 mt-4 italic">
                                        *Layanan gangguan teknis (NOC) tetap beroperasi 24 jam untuk monitoring jaringan.
                                    </p>
                                </div>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Kantor Kami</h2>
                                <div className="flex items-start gap-4">
                                    <MapPin className="w-6 h-6 text-blue-600 mt-1" />
                                    <div>
                                        <h4 className="font-bold text-slate-900 dark:text-white">Head Office</h4>
                                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
                                            {company.address}
                                        </p>
                                        <a href="https://maps.google.com" target="_blank" className="text-blue-600 font-semibold mt-4 inline-block hover:underline">
                                            Lihat di Google Maps &rarr;
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <Footer />
        </main>
    );
}
