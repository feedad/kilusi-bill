'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import HeroSection from '@/components/landing/HeroSection';
import BannerSection from '@/components/landing/BannerSection';
import FeaturesSection from '@/components/landing/FeaturesSection';
import PricingSection from '@/components/landing/PricingSection';
import TestimonialSection from '@/components/landing/TestimonialSection';
import BlogSection from '@/components/landing/BlogSection';
import Footer from '@/components/landing/Footer';
import Link from 'next/link';

import ScrollAnimation from '@/components/landing/ScrollAnimation';

// Dynamically import MapSection to avoid SSR issues with Leaflet
const MapSection = dynamic(() => import('@/components/landing/MapSection'), {
  ssr: false,
  loading: () => <div className="w-full h-[500px] bg-slate-100 dark:bg-slate-900 animate-pulse flex items-center justify-center">Loading Map...</div>
});

import Navbar from '@/components/landing/Navbar';

export default function Home() {
  const [content, setContent] = useState({
    hero: {},
    features: [],
    testimonials: [],
    banners: []
  });

  useEffect(() => {
    // Fetch editable content
    fetch('/api/v1/landing/content')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setContent(data.data);
        }
      })
      .catch(err => console.error("Content fetch error:", err));
  }, []);

  return (
    <main className="min-h-screen bg-white dark:bg-slate-950 font-sans selection:bg-blue-200 dark:selection:bg-blue-900">
      <Navbar />
      <div className="pt-16">
        <ScrollAnimation>
          <HeroSection content={content.hero} />
        </ScrollAnimation>

        <ScrollAnimation delay={0.2}>
          <BannerSection banners={content.banners} />
        </ScrollAnimation>

        <ScrollAnimation>
          <FeaturesSection features={content.features} />
        </ScrollAnimation>

        <ScrollAnimation>
          <PricingSection />
        </ScrollAnimation>

        <ScrollAnimation>
          <MapSection />
        </ScrollAnimation>

        <ScrollAnimation>
          <BlogSection />
        </ScrollAnimation>

        <ScrollAnimation>
          <TestimonialSection testimonials={content.testimonials} />
        </ScrollAnimation>

        <Footer />
      </div>
    </main>
  );
}