'use client';

import { useState, useEffect } from 'react';
import { Gauge, Headset, Infinity as InfinityIcon, ShieldCheck, Trophy, Sparkles, Zap, Star, Check } from 'lucide-react';
import Link from 'next/link';
import ScrollAnimation from './ScrollAnimation';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Autoplay } from 'swiper/modules';

// Import Swiper styles
import 'swiper/css';
import 'swiper/css/pagination';

// Helper to format currency
const formatPrice = (price: any) => {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(price).replace('Rp', 'Rp ');
};

const getIcon = (iconName: string) => {
    const icons: any = { Gauge, Headset, Infinity: InfinityIcon, ShieldCheck, Trophy, Sparkles, Zap, Star, Check };
    return icons[iconName] || Check;
};

export default function PricingSection() {
    const [packages, setPackages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/v1/landing/packages')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setPackages(data.data);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch packages", err);
                setLoading(false);
            });
    }, []);

    if (loading) return <div className="py-24 text-center">Loading Packages...</div>;

    return (
        <section className="py-24 bg-slate-50 dark:bg-slate-900" id="pricing">
            <div className="container mx-auto px-6 md:px-12 lg:px-24">
                <ScrollAnimation className="text-center mb-16">
                    <span className="text-blue-600 font-bold tracking-widest uppercase text-sm">Paket Internet</span>
                    <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white mt-3 mb-4 tracking-tight">
                        Pilih Paket Sesuai Kebutuhan
                    </h2>
                    <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
                        Harga transparan, tanpa biaya tersembunyi. Nikmati internet tanpa batas.
                    </p>
                </ScrollAnimation>

                <Swiper
                    modules={[Pagination, Autoplay]}
                    spaceBetween={30}
                    slidesPerView={1}
                    breakpoints={{
                        640: { slidesPerView: 1 },
                        768: { slidesPerView: 2 },
                        1024: { slidesPerView: 3 },
                    }}
                    pagination={{ clickable: true }}
                    autoplay={{ delay: 5000, disableOnInteraction: false }}
                    className="pb-12 px-4 !overflow-visible"
                >
                    {packages.map((pkg, idx) => {
                        // Default styles if config missing
                        const borderColor = pkg.borderColor || 'border-slate-200 dark:border-slate-800';
                        const badgeColor = pkg.badgeColor || 'bg-blue-600 text-white';

                        return (
                            <SwiperSlide key={pkg.id} className="!h-auto pb-8 flex">
                                <div className={`relative p-8 rounded-3xl w-full h-full bg-white dark:bg-slate-950 border-2 transition-all duration-300 flex flex-col ${borderColor} hover:shadow-xl hover:-translate-y-1`}>
                                    {pkg.badge && (
                                        <div className={`absolute -top-3 left-1/2 transform -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-md ${badgeColor} z-10`}>
                                            {pkg.badge}
                                        </div>
                                    )}

                                    <div className="text-center mb-6">
                                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{pkg.name}</h3>
                                        {/* Speed optional display if not in features */}
                                    </div>

                                    <div className="space-y-4 mb-8 flex-grow">
                                        {(pkg.features || []).map((feature, i) => {
                                            const Icon = getIcon(feature.icon);
                                            return (
                                                <div key={i} className="flex items-center text-slate-700 dark:text-slate-300">
                                                    <Icon className="w-5 h-5 text-blue-600 mr-3 flex-shrink-0" />
                                                    <span className="text-sm font-semibold">{feature.text}</span>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="text-center border-t border-slate-100 dark:border-slate-800 pt-6">
                                        <div className="flex items-end justify-center mb-1">
                                            <span className="text-4xl font-extrabold text-blue-900 dark:text-blue-100">
                                                {formatPrice(pkg.price).replace('/bulan', '').replace(',00', '')}
                                            </span>
                                            <span className="text-slate-500 font-medium mb-1 ml-1">/mo</span>
                                        </div>
                                        <p className="text-xs text-slate-500 font-medium mb-6">
                                            {pkg.installationFee === 'Free' ? (
                                                <span className="text-green-600 font-bold bg-green-50 px-2 py-1 rounded-full dark:bg-green-900/20">Free Installation</span>
                                            ) : (
                                                `Biaya Instalasi ${pkg.installationFee}`
                                            )}
                                        </p>

                                        <Link href={`/customer/register?package=${pkg.id}`} className="block w-full">
                                            <button className={`w-full py-3 rounded-xl font-bold transition-all ${pkg.badge
                                                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/30'
                                                : 'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700'
                                                }`}>
                                                Pilih Paket
                                            </button>
                                        </Link>
                                    </div>
                                </div>
                            </SwiperSlide>
                        );
                    })}
                </Swiper>
            </div>
        </section>
    );
}
