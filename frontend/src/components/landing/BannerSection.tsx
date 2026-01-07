'use client';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination, Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';
import ScrollAnimation from './ScrollAnimation';

export default function BannerSection({ banners = [] }) {
    // Fallback if no banners provided
    const displayBanners = banners.length > 0 ? banners : [
        { id: 1, image: 'https://placehold.co/1200x400/1e293b/FFFFFF/png?text=Kilusi+Promo+1', alt: 'Promo 1', caption: 'Promo Spesial Awal Tahun' },
        { id: 2, image: 'https://placehold.co/1200x400/2563eb/FFFFFF/png?text=Internet+Cepat', alt: 'Promo 2', caption: 'Upgrade Speed Sekarang' },
    ];

    if (banners.length === 0 && displayBanners.length === 0) {
        return null;
    }

    return (
        <section className="w-full py-16 bg-slate-50 dark:bg-slate-900 border-b dark:border-slate-800">
            <div className="container mx-auto px-6 md:px-12 lg:px-24">
                <ScrollAnimation className="w-full rounded-2xl overflow-hidden shadow-2xl ring-4 ring-white dark:ring-slate-800">
                    <Swiper
                        spaceBetween={0}
                        centeredSlides={true}
                        autoplay={{
                            delay: 5000,
                            disableOnInteraction: false,
                        }}
                        pagination={{
                            clickable: true,
                            dynamicBullets: true,
                        }}
                        navigation={true}
                        modules={[Autoplay, Pagination, Navigation]}
                        className="w-full h-[250px] md:h-[450px]"
                    >
                        {displayBanners.map((banner, index) => (
                            <SwiperSlide key={index}>
                                <div className="relative w-full h-full">
                                    <img
                                        src={banner.image}
                                        alt={banner.alt || `Banner ${index + 1}`}
                                        className="w-full h-full object-cover"
                                    />
                                    {banner.caption && (
                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-8 text-white">
                                            <p className="text-xl md:text-2xl font-bold tracking-tight mb-2">{banner.caption}</p>
                                        </div>
                                    )}
                                </div>
                            </SwiperSlide>
                        ))}
                    </Swiper>
                </ScrollAnimation>
            </div>
        </section>
    );
}
