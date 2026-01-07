'use client';
import { StarIcon } from '@heroicons/react/24/solid';
import ScrollAnimation from './ScrollAnimation';

export default function TestimonialSection({ testimonials = [] }) {
    // Fallback
    const list = testimonials.length > 0 ? testimonials : [
        { name: 'Budi Santoso', role: 'Freelancer', text: 'Koneksinya sangat stabil, meeting online jadi lancar tanpa putus-putus. Recommended!', rating: 5 },
        { name: 'Siti Aminah', role: 'Ibu Rumah Tangga', text: 'Anak-anak senang karena streaming Youtube lancar terus. Harganya juga terjangkau.', rating: 5 },
        { name: 'Bambang', role: 'Pemilik Cafe', text: 'Pelayanan cepat tanggap. Kalau ada gangguan langsung diinfo dan diperbaiki.', rating: 4 },
    ];

    return (
        <section className="py-24 bg-white dark:bg-slate-950">
            <div className="container mx-auto px-6 md:px-12 lg:px-24">
                <ScrollAnimation className="text-center mb-16">
                    <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white mb-4 tracking-tight">
                        Kata Mereka Tentang Kilusi
                    </h2>
                    <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
                        Kepercayaan pelanggan adalah prioritas utama kami.
                    </p>
                </ScrollAnimation>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {list.map((item, idx) => (
                        <ScrollAnimation key={idx} className="h-full">
                            <div className="bg-slate-50 dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 h-full flex flex-col justify-between">
                                <div>
                                    <div className="flex mb-4 text-yellow-500">
                                        {[...Array(5)].map((_, i) => (
                                            <StarIcon key={i} className={`w-5 h-5 ${i < item.rating ? 'text-yellow-400' : 'text-slate-300 dark:text-slate-700'}`} />
                                        ))}
                                    </div>
                                    <p className="text-slate-600 dark:text-slate-300 italic mb-6 leading-relaxed">"{item.text}"</p>
                                </div>
                                <div className="flex items-center gap-4 mt-auto">
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center font-bold text-white shadow-lg">
                                        {item.name.charAt(0)}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900 dark:text-white">{item.name}</h4>
                                        <span className="text-sm text-slate-500">{item.role}</span>
                                    </div>
                                </div>
                            </div>
                        </ScrollAnimation>
                    ))}
                </div>
            </div>
        </section>
    );
}
