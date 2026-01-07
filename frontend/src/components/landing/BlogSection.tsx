'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CalendarIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import ScrollAnimation from './ScrollAnimation';

export default function BlogSection() {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch only 3 latest posts
        fetch('/api/v1/blog/posts?limit=3')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setPosts(data.data);
                }
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    if (loading || posts.length === 0) return null;

    return (
        <section className="py-24 bg-white dark:bg-slate-950">
            <div className="container mx-auto px-6 md:px-12 lg:px-24">
                <ScrollAnimation className="text-center mb-16">
                    <span className="text-blue-600 font-bold tracking-widest uppercase text-sm">Blog & Berita</span>
                    <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white mt-3 mb-4 tracking-tight">
                        Informasi Terkini
                    </h2>
                </ScrollAnimation>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                    {posts.map((post, idx) => (
                        <ScrollAnimation key={post.id} delay={idx * 100}>
                            <Link href={`/blog/${post.slug}`} className="group block h-full">
                                <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800 hover:shadow-xl transition-all duration-300 h-full flex flex-col">
                                    <div className="aspect-[16/9] bg-slate-200 relative overflow-hidden">
                                        {post.cover_image ? (
                                            <img
                                                src={post.cover_image}
                                                alt={post.title}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-blue-50 text-blue-300">
                                                <span className="font-bold text-xl">KILUSI</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-6 flex-1 flex flex-col">
                                        <div className="flex items-center text-xs text-slate-500 mb-3 gap-2">
                                            <CalendarIcon className="w-4 h-4" />
                                            {new Date(post.created_at).toLocaleDateString('id-ID')}
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">
                                            {post.title}
                                        </h3>
                                        <p className="text-slate-600 dark:text-slate-400 text-sm line-clamp-3 mb-4 flex-1">
                                            {post.excerpt}
                                        </p>
                                        <span className="text-blue-600 font-bold text-sm inline-flex items-center group-hover:underline">
                                            Baca Selengkapnya <ArrowRightIcon className="w-4 h-4 ml-1" />
                                        </span>
                                    </div>
                                </div>
                            </Link>
                        </ScrollAnimation>
                    ))}
                </div>

                <div className="text-center">
                    <Link href="/blog">
                        <button className="px-8 py-3 rounded-full border border-slate-300 dark:border-slate-700 hover:border-blue-600 hover:text-blue-600 transition-all font-bold">
                            Lihat Semua Artikel
                        </button>
                    </Link>
                </div>
            </div>
        </section>
    );
}
