'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import { CalendarIcon, EyeIcon } from '@heroicons/react/24/outline';

async function getPosts() {
    // Note: In Next.js App Router we can fetch directly in Server Component
    // but for simplicity and to match the client-side paradigm used elsewhere, using fetch
    // Actually, let's use client Component here to avoid build complexity with mixed envs
    const res = await fetch('/api/v1/blog/posts');
    const data = await res.json();
    return data.data || [];
}

export default function BlogListing() {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/v1/blog/posts')
            .then(res => res.json())
            .then(data => {
                if (data.success) setPosts(data.data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    return (
        <main className="min-h-screen bg-white dark:bg-slate-950">
            <Navbar />

            <div className="pt-32 pb-16 bg-blue-600">
                <div className="container mx-auto px-6 text-center">
                    <h1 className="text-4xl font-bold text-white mb-4">Blog & Berita</h1>
                    <p className="text-blue-100 max-w-2xl mx-auto">
                        Informasi terbaru, panduan, dan tips seputar layanan internet Kilusi.
                    </p>
                </div>
            </div>

            <div className="container mx-auto px-6 py-20">
                {loading ? (
                    <div className="text-center py-20">Loading...</div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {posts.map(post => (
                                <Link href={`/blog/${post.slug}`} key={post.id} className="group">
                                    <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800 hover:shadow-xl transition-all duration-300 h-full flex flex-col">
                                        <div className="aspect-[16/9] bg-slate-200 relative overflow-hidden">
                                            {post.cover_image ? (
                                                <img
                                                    src={post.cover_image}
                                                    alt={post.title}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-blue-100 text-blue-500">
                                                    <span className="font-bold text-2xl">KILUSI</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-6 flex-1 flex flex-col">
                                            <div className="flex items-center text-xs text-slate-500 mb-3 gap-4">
                                                <div className="flex items-center gap-1">
                                                    <CalendarIcon className="w-4 h-4" />
                                                    {new Date(post.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                                                </div>
                                            </div>
                                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3 line-clamp-2 group-hover:text-blue-600 transition-colors">
                                                {post.title}
                                            </h3>
                                            <p className="text-slate-600 dark:text-slate-400 text-sm line-clamp-3 mb-4 flex-1">
                                                {post.excerpt || 'Baca selengkapnya...'}
                                            </p>
                                            <span className="text-blue-600 font-bold text-sm group-hover:underline">Baca Artikel &rarr;</span>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>

                        {posts.length === 0 && (
                            <div className="text-center py-20 text-slate-500">
                                Belum ada artikel yang diterbitkan.
                            </div>
                        )}
                    </>
                )}
            </div>

            <Footer />
        </main>
    );
}
