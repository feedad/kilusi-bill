'use client';
import { BoltIcon, ShieldCheckIcon, UserGroupIcon, WifiIcon, LockClosedIcon, GlobeAltIcon, DevicePhoneMobileIcon, CloudIcon, ClockIcon, BanknotesIcon } from '@heroicons/react/24/outline';
import ScrollAnimation from './ScrollAnimation';

// Fallback Icons map
const iconMap = {
    Speed: WifiIcon,
    Support: UserGroupIcon,
    Stable: ShieldCheckIcon,
    Flash: BoltIcon,
    Secure: LockClosedIcon,
    Global: GlobeAltIcon,
    Device: DevicePhoneMobileIcon,
    Cloud: CloudIcon,
    Time: ClockIcon,
    Price: BanknotesIcon
};

export default function FeaturesSection({ features = [] }) {
    const displayFeatures = features.length > 0 ? features : [
        { icon: 'Speed', title: 'Internet Super Cepat', description: 'Kecepatan hingga 1Gbps untuk streaming 4K tanpa buffering.' },
        { icon: 'Stable', title: 'Koneksi Stabil', description: 'Jaringan Fiber Optic 100% menjamin uptime 99.9%.' },
        { icon: 'Support', title: 'Support Responsif', description: 'Tim teknis kami siap membantu masalah Anda 24/7.' },
    ];

    return (
        <section className="py-24 bg-white dark:bg-slate-950">
            <div className="container mx-auto px-6 md:px-12 lg:px-24">
                <ScrollAnimation className="text-center mb-16">
                    <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white mb-4 tracking-tight">
                        Mengapa Memilih Kami?
                    </h2>
                    <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
                        Kami berkomitmen memberikan pengalaman internet terbaik dengan teknologi terkini dan pelayanan sepenuh hati.
                    </p>
                </ScrollAnimation>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {displayFeatures.map((feature, idx) => {
                        const Icon = iconMap[feature.icon] || WifiIcon;
                        return (
                            <ScrollAnimation key={idx} className="h-full">
                                <div className="h-full p-8 rounded-3xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-300 transform hover:-translate-y-2 group">
                                    <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                        <Icon className="w-8 h-8" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                                        {feature.title}
                                    </h3>
                                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                                        {feature.description}
                                    </p>
                                </div>
                            </ScrollAnimation>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
